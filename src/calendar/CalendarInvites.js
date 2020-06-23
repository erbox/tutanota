//@flow
import {parseCalendarFile} from "./CalendarImporter"
import {worker} from "../api/main/WorkerClient"
import {showCalendarEventDialog} from "./CalendarEventEditDialog"
import type {CalendarEvent} from "../api/entities/tutanota/CalendarEvent"
import type {File as TutanotaFile} from "../api/entities/tutanota/File"
import {loadCalendarInfos} from "./CalendarModel"
import {locator} from "../api/main/MainLocator"
import type {CalendarEventAttendee} from "../api/entities/tutanota/CalendarEventAttendee"
import type {CalendarAttendeeStatusEnum} from "../api/common/TutanotaConstants"
import {assertNotNull, clone} from "../api/common/utils/Utils"
import {getTimeZone, incrementSequence} from "./CalendarUtils"
import {createMailAddress} from "../api/entities/tutanota/MailAddress"

function loadOrCreateCalendarInfo() {
	return loadCalendarInfos()
		.then((calendarInfo) =>
			calendarInfo.size && calendarInfo || worker.addCalendar("").then(() => loadCalendarInfos()))
}

function getParsedEvent(fileData: DataFile): ?{event: CalendarEvent, uid: string} {
	try {
		const {contents} = parseCalendarFile(fileData)
		const parsedEventWithAlarms = contents[0]
		if (parsedEventWithAlarms && parsedEventWithAlarms.event.uid) {
			return {event: parsedEventWithAlarms.event, uid: parsedEventWithAlarms.event.uid}
		} else {
			return null
		}
	} catch (e) {
		console.log(e)
		return null
	}
}

export function showEventDetails(event: CalendarEvent) {
	return Promise.all([
		loadOrCreateCalendarInfo(),
		locator.mailModel.getUserMailboxDetails(),
	]).then(([calendarInfo, mailboxDetails]) => {
		showCalendarEventDialog(event.startTime, calendarInfo, mailboxDetails, event)
	})
}

export function eventDetailsForFile(file: TutanotaFile): Promise<?CalendarEvent> {
	return worker.downloadFileContent(file).then((fileData) => {
		const parsedEventWithAlarms = getParsedEvent(fileData)
		if (parsedEventWithAlarms == null) {
			return null
		}
		const parsedEvent = parsedEventWithAlarms.event
		return worker.getEventByUid(parsedEventWithAlarms.uid).then((existingEvent) => {
			if (existingEvent) {
				// It should be the latest version eventually via CalendarEventUpdates
				return existingEvent
			} else {
				// Set isCopy here to show that this is not created by us
				parsedEvent.isCopy = true
				return parsedEvent
			}
		})
	})
}

export function replyToEventInvitation(
	event: CalendarEvent,
	attendee: CalendarEventAttendee,
	decision: CalendarAttendeeStatusEnum
): Promise<void> {
	return locator.calendarUpdateDistributor().then((distributor) => {
		const eventClone = clone(event)
		const foundAttendee = assertNotNull(eventClone.attendees.find((a) => a.address.address === attendee.address.address))
		foundAttendee.status = decision
		event.sequence = incrementSequence(event.sequence)
		const address = createMailAddress({address: foundAttendee.address.address, name: foundAttendee.address.name})
		return distributor.sendResponse(event, address, decision)
		                  .then(() => locator.calendarModel().loadCalendarInfos())
		                  .then((calendarInfos) => Array.from(calendarInfos.values())[0])
		                  .then((calendar) => locator.calendarModel().createEvent(eventClone, [], getTimeZone(), calendar.groupRoot))
	})
}