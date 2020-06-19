//@flow
import m from "mithril"
import type {CalendarEvent} from "../api/entities/tutanota/CalendarEvent"
import {Icon} from "../gui/base/Icon"
import {theme} from "../gui/theme"
import {replyToEventInvitation, showEventDetails} from "../calendar/CalendarInvites"
import {CalendarAttendeeStatus} from "../api/common/TutanotaConstants"
import {BannerButton} from "../gui/base/Banner"
import {lang} from "../misc/LanguageViewModel"
import {isAllDayEvent} from "../api/common/utils/CommonCalendarUtils"
import {formatDateTime, formatDateWithMonth} from "../misc/Formatter"
import {MessageBoxN} from "../gui/base/MessageBoxN"
import {px, size} from "../gui/size"
import {BootIcons} from "../gui/base/icons/BootIcons"
import {Icons} from "../gui/base/icons/Icons"
import {ButtonN, ButtonType} from "../gui/base/ButtonN"
import type {CalendarAttendeeStatusEnum} from "../api/common/TutanotaConstants"
import type {CalendarEventAttendee} from "../api/entities/tutanota/CalendarEventAttendee"

export type Attrs = {
	event: CalendarEvent,
	recipient: string,
}

export class EventBanner implements MComponent<Attrs> {
	view({attrs: {event, recipient}}: Vnode<Attrs>): Children {
		const ownAttendee = event.attendees.find((a) => a.address.address === recipient)

		return m(MessageBoxN, {
				style: {
					alignItems: "start",
					paddingBottom: "0",
					maxWidth: "100%",
					marginTop: px(size.vpad),
				}
			}, m(".flex.col.plr", [
				m(".flex.col", [
					m(".flex.pb-s.items-end", [renderSectionIndicator(BootIcons.Calendar), m(".h3", event.summary)]),
					m(".flex.pb-s.items-center", [renderSectionIndicator(Icons.Time), formatTime(event)]),
					event.location ? m(".flex.pb-s.items-center", [renderSectionIndicator(Icons.Pin), event.location]) : null,
					m(".flex.pb-s.items-center", [renderSectionIndicator(BootIcons.Contacts), event.attendees.map(a => a.address.address).join(", ")]),
				]),
				ownAttendee
					? ownAttendee.status !== CalendarAttendeeStatus.NEEDS_ACTION
					? m(".align-self-start", lang.get("eventYourDecision_msg", {"{decision}": decisionString(ownAttendee.status)}))
					: renderReplyButtons(event, ownAttendee)
					: null,
				m(".ml-negative-s.limit-width.align-self-start", m(ButtonN, {
					label: "viewEvent_action",
					type: ButtonType.Secondary,
					click: () => showEventDetails(event),
				})),
			]),
		)
	}
}

function renderSectionIndicator(icon) {
	return m(".pr", m(Icon, {icon, large: true, style: {fill: theme.content_button}}))
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

function formatTime(event: CalendarEvent) {
	if (isAllDayEvent(event)) {
		return formatDateWithMonth(event.startTime)
	} else {
		return formatDateTime(event.startTime)
	}
}
