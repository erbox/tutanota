//@flow
import m from "mithril"
import type {CalendarEvent} from "../api/entities/tutanota/CalendarEvent"
import {MessageBoxN} from "../gui/base/MessageBoxN"
import {px, size} from "../gui/size"
import {CalendarPreviewView} from "../calendar/CalendarPreviewView"
import {ButtonN, ButtonType} from "../gui/base/ButtonN"
import {showEventDetails} from "../calendar/CalendarInvites"

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
				}
			}, [
				m(CalendarPreviewView, {event, ownAttendee}),
				m(".mt-negative-s.ml-s.limit-width.align-self-start", m(ButtonN, {
					label: "viewEvent_action",
					type: ButtonType.Secondary,
					click: () => showEventDetails(event),
				})),
			],
		)
	}
}

