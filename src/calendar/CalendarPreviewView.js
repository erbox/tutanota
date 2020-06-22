//@flow
import type {CalendarEvent} from "../api/entities/tutanota/CalendarEvent"
import m from "mithril"
import {Icon} from "../gui/base/Icon"
import {theme} from "../gui/theme"
import {BannerButton} from "../gui/base/Banner"
import {lang} from "../misc/LanguageViewModel"
import type {CalendarAttendeeStatusEnum} from "../api/common/TutanotaConstants"
import {CalendarAttendeeStatus, RepeatPeriod} from "../api/common/TutanotaConstants"
import type {CalendarEventAttendee} from "../api/entities/tutanota/CalendarEventAttendee"
import {replyToEventInvitation} from "./CalendarInvites"
import {getAllDayDateLocal, isAllDayEvent} from "../api/common/utils/CommonCalendarUtils"
import {formatDate, formatDateTime, formatDateWithMonth, formatTime} from "../misc/Formatter"
import {BootIcons} from "../gui/base/icons/BootIcons"
import {Icons} from "../gui/base/icons/Icons"
import {isSameDayOfDate} from "../api/common/utils/DateUtils"
import {incrementByRepeatPeriod} from "./CalendarModel"
import {getTimeZone} from "./CalendarUtils"
import {px, size} from "../gui/size"
import {memoized} from "../api/common/utils/Utils"
import {htmlSanitizer} from "../misc/HtmlSanitizer"

export type Attrs = {
	event: CalendarEvent,
	ownAttendee: ?CalendarEventAttendee,
}

export class CalendarPreviewView implements MComponent<Attrs> {
	_sanitizedDescription: (string) => string = memoized((html) => htmlSanitizer.sanitize(html, true).text)

	view({attrs: {event, ownAttendee}}: Vnode<Attrs>) {
		return m(".flex.col.plr.pb-s", [
			m(".flex.col", {
				style: {fontSize: px(size.font_size_smaller)}
			}, [
				m(".flex.pb-s.items-center", [renderSectionIndicator(BootIcons.Calendar), m(".h3", event.summary)]),
				m(".flex.pb-s.items-center", [
						renderSectionIndicator(Icons.Time),
						m(".align-self-center", formatEventDuration(event))
					]
				),
				event.location ? m(".flex.pb-s.items-center", [renderSectionIndicator(Icons.Pin), event.location]) : null,
				event.attendees.length
					? m(".flex.pb-s.items-center", [
						renderSectionIndicator(BootIcons.Contacts), event.attendees.map(a => a.address.address).join(", ")
					])
					: null,
				!!event.description
					? m(".flex.pb-s.items-start.scroll", {
						style: {maxHeight: "100px"},
					}, [
						renderSectionIndicator(Icons.AlignLeft, {marginTop: "2px"}),
						m("div", m.trust(this._sanitizedDescription(event.description))),
					])
					: null,
			]),
			ownAttendee
				? ownAttendee.status !== CalendarAttendeeStatus.NEEDS_ACTION
				? m(".align-self-start", lang.get("eventYourDecision_msg", {"{decision}": decisionString(ownAttendee.status)}))
				: renderReplyButtons(event, ownAttendee)
				: null,

		])
	}
}


function renderSectionIndicator(icon, style: {[string]: any} = {}) {
	return m(".pr", m(Icon, {
		icon,
		large: true,
		style: Object.assign({
			fill: theme.content_button,
			display: "block"
		}, style)
	}))
}

function renderReplyButtons(event, ownAttendee) {
	return m(".flex", [
		m(BannerButton, {
			text: lang.get("yes_label"),
			click: () => sendResponse(event, ownAttendee, CalendarAttendeeStatus.ACCEPTED),
			borderColor: theme.content_button,
			color: theme.content_fg
		}),
		m(BannerButton, {
			text: lang.get("maybe_label"),
			click: () => sendResponse(event, ownAttendee, CalendarAttendeeStatus.TENTATIVE),
			borderColor: theme.content_button,
			color: theme.content_fg
		}),
		m(BannerButton, {
			text: lang.get("no_label"),
			click: () => sendResponse(event, ownAttendee, CalendarAttendeeStatus.DECLINED),
			borderColor: theme.content_button,
			color: theme.content_fg
		}),
	])
}

function sendResponse(event: CalendarEvent, ownAttendee: CalendarEventAttendee, status: CalendarAttendeeStatusEnum) {
	replyToEventInvitation(event, ownAttendee, status)
		.then(() => ownAttendee.status = status)
		.then(m.redraw)
}

function decisionString(status) {
	if (status === CalendarAttendeeStatus.ACCEPTED) {
		return lang.get("yes_label")
	} else if (status === CalendarAttendeeStatus.TENTATIVE) {
		return lang.get("maybe_label")
	} else if (status === CalendarAttendeeStatus.DECLINED) {
		return lang.get("no_label")
	} else {
		return ""
	}
}

function formatEventDuration(event: CalendarEvent) {
	if (isAllDayEvent(event)) {
		const startTime = getAllDayDateLocal(event.startTime)
		const endTime = incrementByRepeatPeriod(getAllDayDateLocal(event.endTime), RepeatPeriod.DAILY, -1, getTimeZone())
		if (isSameDayOfDate(startTime, endTime)) {
			return formatDateWithMonth(startTime)
		} else {
			return `${formatDateWithMonth(startTime)} - ${(formatDateWithMonth(endTime))}`
		}
	} else {
		if (isSameDayOfDate(event.startTime, event.endTime)) {
			return `${formatDate(event.startTime)}, ${formatTime(event.startTime)} - ${formatTime(event.endTime)}`
		} else {
			return `${formatDateTime(event.startTime)} - ${formatDateTime(event.endTime)}`
		}
	}
}