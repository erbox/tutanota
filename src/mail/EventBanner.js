//@flow
import m from "mithril"
import type {CalendarEvent} from "../api/entities/tutanota/CalendarEvent"
import {MessageBoxN} from "../gui/base/MessageBoxN"
import {px, size} from "../gui/size"
import {EventPreviewView} from "../calendar/EventPreviewView"
import {ButtonN, ButtonType} from "../gui/base/ButtonN"
import {replyToEventInvitation, showEventDetails} from "../calendar/CalendarInvites"
import type {CalendarAttendeeStatusEnum} from "../api/common/TutanotaConstants"
import {CalendarAttendeeStatus} from "../api/common/TutanotaConstants"
import {lang} from "../misc/LanguageViewModel"
import {BannerButton} from "../gui/base/Banner"
import {theme} from "../gui/theme"
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
					display: "flex",
					flexDirection: "column",
					paddingLeft: px(size.hpad_large),
					paddingRight: px(size.hpad_large)
				}
			}, [
				m(EventPreviewView, {event, ownAttendee}),
				m("", ownAttendee
					? ownAttendee.status !== CalendarAttendeeStatus.NEEDS_ACTION
						? m(".align-self-start", lang.get("eventYourDecision_msg", {"{decision}": decisionString(ownAttendee.status)}))
						: renderReplyButtons(event, ownAttendee)
					: null),
				m(".ml-negative-s.limit-width.align-self-start", m(ButtonN, {
					label: "viewEvent_action",
					type: ButtonType.Secondary,
					click: () => showEventDetails(event),
				})),
			],
		)
	}
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