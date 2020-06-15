//@flow
import {px, size} from "../gui/size"
import stream from "mithril/stream/stream.js"
import {DatePicker} from "../gui/base/DatePicker"
import {Dialog} from "../gui/base/Dialog"
import type {CalendarInfo} from "./CalendarView"
import m from "mithril"
import {TextFieldN} from "../gui/base/TextFieldN"
import {lang} from "../misc/LanguageViewModel"
import type {DropDownSelectorAttrs} from "../gui/base/DropDownSelectorN"
import {DropDownSelectorN} from "../gui/base/DropDownSelectorN"
import {Icons} from "../gui/base/icons/Icons"
import type {CalendarEvent} from "../api/entities/tutanota/CalendarEvent"
import {downcast, memoized, noOp} from "../api/common/utils/Utils"
import type {ButtonAttrs} from "../gui/base/ButtonN"
import {ButtonN, ButtonType} from "../gui/base/ButtonN"
import type {CalendarAttendeeStatusEnum} from "../api/common/TutanotaConstants"
import {AlarmInterval, CalendarAttendeeStatus, EndType, RepeatPeriod} from "../api/common/TutanotaConstants"
import {findAndRemove, numberRange, remove} from "../api/common/utils/ArrayUtils"
import {calendarAttendeeStatusDescription, getCalendarName, getStartOfTheWeekOffsetForUser} from "./CalendarUtils"
import {TimePicker} from "../gui/base/TimePicker"
import {createRecipientInfo, getDisplayText} from "../mail/MailUtils"
import type {MailboxDetail} from "../mail/MailModel"
import type {CalendarEventAttendee} from "../api/entities/tutanota/CalendarEventAttendee"
import {Bubble, BubbleTextField} from "../gui/base/BubbleTextField"
import {MailAddressBubbleHandler} from "../misc/MailAddressBubbleHandler"
import type {Contact} from "../api/entities/tutanota/Contact"
import {attachDropdown} from "../gui/base/DropdownN"
import {HtmlEditor} from "../gui/base/HtmlEditor"
import {Icon} from "../gui/base/Icon"
import {BootIcons} from "../gui/base/icons/BootIcons"
import {CheckboxN} from "../gui/base/CheckboxN"
import {ExpanderButtonN, ExpanderPanelN} from "../gui/base/ExpanderN"
import {client} from "../misc/ClientDetector"
import {locator} from "../api/main/MainLocator"

export function showCalendarEventDialog(date: Date, calendars: Map<Id, CalendarInfo>, mailboxDetail: MailboxDetail,
                                        existingEvent?: CalendarEvent) {
	locator.calendarEventViewModel(date, calendars, mailboxDetail, existingEvent).then((viewModel) => {
		const startOfTheWeekOffset = getStartOfTheWeekOffsetForUser()
		const startDatePicker = new DatePicker(startOfTheWeekOffset, "dateFrom_label", "emptyString_msg", true, viewModel.readOnly)
		const endDatePicker = new DatePicker(startOfTheWeekOffset, "dateTo_label", "emptyString_msg", true, viewModel.readOnly)
		startDatePicker.date.map((date) => viewModel.onStartDateSelected(date))
		endDatePicker.date.map((date) => viewModel.onEndDateSelected(date))

		const repeatValues = createRepeatValues()
		const intervalValues = createIntevalValues()
		const endTypeValues = createEndTypeValues()
		const repeatEndDatePicker = new DatePicker(startOfTheWeekOffset, "emptyString_msg", "emptyString_msg", true)
		repeatEndDatePicker.date.map((date) => viewModel.onRepeatEndDateSelected(date))

		const alarmIntervalItems = [
			{name: lang.get("comboBoxSelectionNone_msg"), value: null},
			{name: lang.get("calendarReminderIntervalFiveMinutes_label"), value: AlarmInterval.FIVE_MINUTES},
			{name: lang.get("calendarReminderIntervalTenMinutes_label"), value: AlarmInterval.TEN_MINUTES},
			{name: lang.get("calendarReminderIntervalThirtyMinutes_label"), value: AlarmInterval.THIRTY_MINUTES},
			{name: lang.get("calendarReminderIntervalOneHour_label"), value: AlarmInterval.ONE_HOUR},
			{name: lang.get("calendarReminderIntervalOneDay_label"), value: AlarmInterval.ONE_DAY},
			{name: lang.get("calendarReminderIntervalTwoDays_label"), value: AlarmInterval.TWO_DAYS},
			{name: lang.get("calendarReminderIntervalThreeDays_label"), value: AlarmInterval.THREE_DAYS},
			{name: lang.get("calendarReminderIntervalOneWeek_label"), value: AlarmInterval.ONE_WEEK}
		]

		const endOccurrencesStream = memoized(stream)

		function renderEndValue(): Children {
			if (viewModel.repeat == null || viewModel.repeat.endType === EndType.Never) {
				return null
			} else if (viewModel.repeat.endType === EndType.Count) {
				return m(DropDownSelectorN, {
					label: "emptyString_msg",
					items: intervalValues,
					selectedValue: endOccurrencesStream(viewModel.repeat.endValue),
					selectionChangedHandler: (endValue: number) => viewModel.onEndOccurencesSelected(endValue),
					icon: BootIcons.Expand,
				})
			} else if (viewModel.repeat.endType === EndType.UntilDate) {
				repeatEndDatePicker.setDate(new Date(viewModel.repeat.endValue))
				return m(repeatEndDatePicker)
			} else {
				return null
			}
		}

		const editorOptions = {enabled: false, alignmentEnabled: false, fontSizeEnabled: false}
		const descriptionEditor = new HtmlEditor("description_label", editorOptions, () => m(ButtonN, {
				label: "emptyString_msg",
				title: 'showRichTextToolbar_action',
				icon: () => Icons.FontSize,
				click: () => editorOptions.enabled = !editorOptions.enabled,
				isSelected: () => editorOptions.enabled,
				noBubble: true,
				type: ButtonType.Toggle,
			})
		)
			.setMinHeight(400)
			.showBorders()
			.setEnabled(!viewModel.readOnly)
			// We only set it once, we don't viewModel on every change, that would be slow
			.setValue(viewModel.note)

		const okAction = (dialog) => {
			viewModel.changeDescription(descriptionEditor.getValue())
			viewModel.onOkPressed().then((result) => {
				if (result.status === "ok") {
					const {askForUpdates} = result
					if (askForUpdates) {
						// TODO: translate
						// TODO: it should probably be more clear with options
						Dialog.confirm(() => "Send out updates?")
						      .then(askForUpdates)
						      .then(() => dialog.close())
					} else {
						dialog.close()
					}
				} else {
					Dialog.error(result.error)
				}
			})
		}

		const attendeesField = makeAttendeesField((bubble) => {
			viewModel.addAttendee(bubble.entity.mailAddress)
			remove(attendeesField.bubbles, bubble)
		})

		const attendeesExpanded = stream(false)

		const renderInviting = (): Children => viewModel.canModifyGuests() ? m(attendeesField) : null

		function renderAttendees() {
			const iconForStatus = {
				[CalendarAttendeeStatus.ACCEPTED]: Icons.Checkmark,
				[CalendarAttendeeStatus.TENTATIVE]: BootIcons.Help,
				[CalendarAttendeeStatus.DECLINED]: Icons.Cancel,
				[CalendarAttendeeStatus.NEEDS_ACTION]: null
			}

			function renderStatusIcon(attendee: CalendarEventAttendee): Children {
				const icon = iconForStatus[attendee.status]

				const iconElement = icon
					? m(Icon, {icon, large: true})
					: m(".icon-large", {
						style: {display: "block"}
					})
				const status: CalendarAttendeeStatusEnum = downcast(attendee.status)
				return m(".mr-s", {
					style: {display: "block"},
					title: calendarAttendeeStatusDescription(status)
				}, iconElement)
			}

			const renderGuest = a => m(".flex.mr-negative-s", [
				m(".flex.flex-grow.items-center", {
						style: {
							height: px(size.button_height),
						},
					},
					[renderStatusIcon(a), m("div", a.address.name ? `${a.address.name} ${a.address.address}` : a.address.address)]
				),
				viewModel.canModifyGuests()
					? m(ButtonN, {
						label: "delete_action",
						type: ButtonType.Action,
						icon: () => Icons.Cancel,
						click: () => viewModel.removeAttendee(a.address.address)
					})
					: null
			])

			return m(".pt-s", viewModel.attendees.map(renderGuest))
		}

		function renderOrganizer(): Children {
			return m(DropDownSelectorN, {
				label: "organizer_label",
				items: viewModel.possibleOrganizers.map((address) => ({name: address, value: address})),
				selectedValue: stream(viewModel.organizer || null),
				dropdownWidth: 300,
				disabled: !viewModel.canModifyOrganizer(),
			})
		}

		const renderGoingSelector = () => m(DropDownSelectorN, Object.assign({}, {
			label: "attendingEvent_label",
			items: [
				{name: lang.get("noSelection_msg"), value: CalendarAttendeeStatus.NEEDS_ACTION, selectable: false},
				{name: lang.get("yes_label"), value: CalendarAttendeeStatus.ACCEPTED},
				{name: lang.get("maybe_label"), value: CalendarAttendeeStatus.TENTATIVE},
				{name: lang.get("no_label"), value: CalendarAttendeeStatus.DECLINED},
			],
			selectedValue: stream(viewModel.going),
			selectionChangedHandler: (going) => viewModel.selectGoing(going)
		}, {disabled: !viewModel.canModifyOwnAttendance()}))

		const renderEasyGoingSelector = () => viewModel.existingEvent && viewModel.existingEvent.isCopy
			? renderTwoColumnsIfFits(
				m(".flex.items-center.flex-grow", [
						m("", lang.get("attendingEvent_label")),
						m(".flex-grow"),
						m(ButtonN, {
							label: "yes_label",
							click: () => viewModel.replyGoingDirectly(CalendarAttendeeStatus.ACCEPTED).then(() => dialog.close()),
							type: viewModel.going === CalendarAttendeeStatus.ACCEPTED ? ButtonType.Primary : ButtonType.Secondary,
						}),
						m(ButtonN, {
							label: "maybe_label",
							click: () => viewModel.replyGoingDirectly(CalendarAttendeeStatus.TENTATIVE).then(() => dialog.close()),
							type: viewModel.going === CalendarAttendeeStatus.TENTATIVE ? ButtonType.Primary : ButtonType.Secondary,
						}),
						m(ButtonN, {
							label: "no_label",
							click: () => viewModel.replyGoingDirectly(CalendarAttendeeStatus.DECLINED).then(() => dialog.close()),
							type: viewModel.going === CalendarAttendeeStatus.DECLINED ? ButtonType.Primary : ButtonType.Secondary,
						}),
					]
				),
				null
			)
			: null

		const renderDateTimePickers = () => renderTwoColumnsIfFits(
			[
				m(".mr-s.flex-grow", m(startDatePicker)),
				!viewModel.allDay()
					? m(".time-field", m(TimePicker, {
						value: viewModel.startTime,
						onselected: (time) => viewModel.onStartTimeSelected(time),
						amPmFormat: viewModel.amPmFormat,
						disabled: viewModel.readOnly
					}))
					: null
			],
			[
				m(".mr-s.flex-grow", m(endDatePicker)),
				!viewModel.allDay()
					? m(".time-field", m(TimePicker, {
						value: viewModel.endTime,
						onselected: (time) => viewModel.onEndTimeSelected(time),
						amPmFormat: viewModel.amPmFormat,
						disabled: viewModel.readOnly
					}))
					: null
			]
		)

		const renderLocationField = () => m(TextFieldN, {
			label: "location_label",
			value: viewModel.location,
			disabled: viewModel.readOnly,
			injectionsRight: () => {
				let address = encodeURIComponent(viewModel.location())
				if (address === "") {
					return null;
				}
				return m(ButtonN, {
					label: 'showAddress_alt',
					icon: () => Icons.Pin,
					click: () => {
						window.open(`https://www.openstreetmap.org/search?query=${address}`, '_blank')
					}
				})
			}
		})

		function renderCalendarPicker() {
			return m(".flex-half.pl-s", m(DropDownSelectorN, ({
				label: "calendar_label",
				items: viewModel.calendars.map((calendarInfo) => {
					return {name: getCalendarName(calendarInfo.groupInfo, calendarInfo.shared), value: calendarInfo}
				}),
				selectedValue: viewModel.selectedCalendar,
				icon: BootIcons.Expand,
				disabled: viewModel.readOnly
			}: DropDownSelectorAttrs<CalendarInfo>)))
		}

		// Avoid creating stream on each render. Will create new stream if the value is changed.
		// We could just change the value of the stream on each render but ultimately we should avoid
		// passing streams into components.
		const repeatFrequencyStream = memoized(stream)
		const repeatIntervalStream = memoized(stream)
		const endTypeStream = memoized(stream)

		function renderRepeatPeriod() {
			return m(DropDownSelectorN, {
				label: "calendarRepeating_label",
				items: repeatValues,
				selectedValue: repeatFrequencyStream(viewModel.repeat && viewModel.repeat.frequency || null),
				selectionChangedHandler: (period) => viewModel.onRepeatPeriodSelected(period),
				icon: BootIcons.Expand,
				disabled: viewModel.readOnly,
			})
		}

		function renderRepeatInterval() {
			return m(DropDownSelectorN, {
				label: "interval_title",
				items: intervalValues,
				selectedValue: repeatIntervalStream(viewModel.repeat && viewModel.repeat.interval || 1),
				selectionChangedHandler: (period) => viewModel.onRepeatIntervalChanged(period),
				icon: BootIcons.Expand,
				disabled: viewModel.readOnly
			})
		}

		function renderEndType(repeat) {
			return m(DropDownSelectorN, {
					label: () => lang.get("calendarRepeatStopCondition_label"),
					items: endTypeValues,
					selectedValue: endTypeStream(repeat.endType),
					selectionChangedHandler: (period) => viewModel.onRepeatEndTypeChanged(period),
					icon: BootIcons.Expand,
					disabled: viewModel.readOnly,
				}
			)
		}

		const renderRepeatRulePicker = () => renderTwoColumnsIfFits([
				// Repeat type == Frequency: Never, daily, annually etc
				m(".flex-grow", renderRepeatPeriod()),
				// Repeat interval: every day, every second day etc
				m(".flex-grow.ml-s"
					+ (viewModel.repeat ? "" : ".hidden"), renderRepeatInterval()),
			],
			viewModel.repeat
				? [
					m(".flex-grow", renderEndType(viewModel.repeat)),
					m(".flex-grow.ml-s", renderEndValue()),
				]
				: null
		)

		function renderChangesMessage() {
			return viewModel.existingEvent && viewModel.existingEvent.isCopy
				? m(".mt", lang.get("eventCopy_msg"))
				: null
		}

		function renderDialogContent() {
			startDatePicker.setDate(viewModel.startDate)
			endDatePicker.setDate(viewModel.endDate)

			return m(".calendar-edit-container.pb", [
					renderHeading(),
					renderChangesMessage(),
					renderEasyGoingSelector(),
					renderDateTimePickers(),
					m(".flex.items-center", [
						m(CheckboxN, {
							checked: viewModel.allDay,
							disabled: viewModel.readOnly,
							label: () => lang.get("allDay_label")
						}),
						m(".flex-grow"),
						m(ExpanderButtonN, {
							label: "showMore_action",
							expanded: attendeesExpanded,
							style: {paddingTop: 0},
						})
					]),
					m(ExpanderPanelN, {
							expanded: attendeesExpanded,
							class: "mb",
						}, renderTwoColumnsIfFits(
						m(".flex-grow", [
							viewModel.existingEvent ? renderGoingSelector() : null,
							renderOrganizer(),
						]),
						m(".flex-grow", [
							renderInviting(),
							m(".mt", lang.get("guests_label")),
							renderAttendees()
						]),
						),
					),
					renderRepeatRulePicker(),
					m(".flex", [
						renderCalendarPicker(),
						viewModel.canModifyAlarms()
							? m(".flex.col.flex-half.pl-s",
							[
								viewModel.alarms.map((a) => m(DropDownSelectorN, {
									label: "reminderBeforeEvent_label",
									items: alarmIntervalItems,
									selectedValue: stream(downcast(a.trigger)),
									icon: BootIcons.Expand,
									selectionChangedHandler: (value) => viewModel.changeAlarm(a.alarmIdentifier, value),
									key: a.alarmIdentifier
								})),
								m(DropDownSelectorN, {
									label: "reminderBeforeEvent_label",
									items: alarmIntervalItems,
									selectedValue: stream(null),
									icon: BootIcons.Expand,
									selectionChangedHandler: (value) => value && viewModel.addAlarm(value)
								})
							])
							: m(".flex.flex-half.pl-s"),
					]),
					renderLocationField(),
					m(descriptionEditor),
				]
			)
		}

		function deleteEvent() {
			if (viewModel.existingEvent == null) {
				return Promise.resolve(true)
			}
			const p = viewModel.repeat
				? Dialog.confirm("deleteRepeatingEventConfirmation_msg")
				: Promise.resolve(true)
			return p.then((answer) => {
				if (answer) {
					viewModel.deleteEvent()
					dialog.close()
				}
			})
		}

		const moreButtonActions = () => [
			{
				label: "delete_action",
				type: ButtonType.Dropdown,
				icon: () => Icons.Trash,
				click: () => deleteEvent()
			}
		]

		const renderMoreButton = () => (existingEvent && existingEvent._id && !viewModel.readOnly)
			? m(".mr-negative-s", m(ButtonN, attachDropdown({
				label: "more_label",
				icon: () => Icons.More,
			}, moreButtonActions)))
			: null

		function renderHeading() {
			return m(".flex.items-end", [
				m(TextFieldN, {
					label: "title_placeholder",
					value: viewModel.summary,
					disabled: viewModel.readOnly,
					class: "big-input pt flex-grow mr-s"
				}),
				renderMoreButton(),
			])
		}

		const dialog = Dialog.largeDialog(
			{
				left: [{label: "cancel_action", click: () => dialog.close(), type: ButtonType.Secondary}],
				right: [{label: "ok_action", click: () => okAction(dialog), type: ButtonType.Primary}],
				middle: () => lang.get("createEvent_label"),
			},
			{view: () => m(".calendar-edit-container.pb", renderDialogContent())}
		)
		if (client.isMobileDevice()) {
			// Prevent focusing text field automatically on mobile. It opens keyboard and you don't see all details.
			dialog.setFocusOnLoadFunction(noOp)
		}
		dialog.show()
	})
}


function createRepeatValues() {
	return [
		{name: lang.get("calendarRepeatIntervalNoRepeat_label"), value: null},
		{name: lang.get("calendarRepeatIntervalDaily_label"), value: RepeatPeriod.DAILY},
		{name: lang.get("calendarRepeatIntervalWeekly_label"), value: RepeatPeriod.WEEKLY},
		{name: lang.get("calendarRepeatIntervalMonthly_label"), value: RepeatPeriod.MONTHLY},
		{name: lang.get("calendarRepeatIntervalAnnually_label"), value: RepeatPeriod.ANNUALLY}
	]
}

function createIntevalValues() {
	return numberRange(1, 256).map(n => {
		return {name: String(n), value: n}
	})
}

function createEndTypeValues() {
	return [
		{name: lang.get("calendarRepeatStopConditionNever_label"), value: EndType.Never},
		{name: lang.get("calendarRepeatStopConditionOccurrences_label"), value: EndType.Count},
		{name: lang.get("calendarRepeatStopConditionDate_label"), value: EndType.UntilDate}
	]
}

function makeAttendeesField(onBubbleCreated: (Bubble<RecipientInfo>) => void): BubbleTextField<RecipientInfo> {
	function createBubbleContextButtons(name: string, mailAddress: string): Array<ButtonAttrs | string> {
		let buttonAttrs = [mailAddress]
		buttonAttrs.push({
			label: "remove_action",
			type: ButtonType.Secondary,
			click: () => {
				findAndRemove(invitePeopleValueTextField.bubbles, (bubble) => bubble.entity.mailAddress === mailAddress)
			},
		})
		return buttonAttrs
	}

	const bubbleHandler = new MailAddressBubbleHandler({
		createBubble(name: ?string, mailAddress: string, contact: ?Contact): Bubble<RecipientInfo> {
			const recipientInfo = createRecipientInfo(mailAddress, name, contact, false)
			const buttonAttrs = attachDropdown({
				label: () => getDisplayText(recipientInfo.name, mailAddress, false),
				type: ButtonType.TextBubble,
				isSelected: () => false,
			}, () => createBubbleContextButtons(recipientInfo.name, mailAddress))
			const bubble = new Bubble(recipientInfo, buttonAttrs, mailAddress)
			Promise.resolve().then(() => onBubbleCreated(bubble))
			return bubble
		},

	})
	const invitePeopleValueTextField = new BubbleTextField("shareWithEmailRecipient_label", bubbleHandler, {marginLeft: 0})
	return invitePeopleValueTextField
}

function renderTwoColumnsIfFits(left: Children, right: Children): Children {
	if (client.isMobileDevice()) {
		return m(".flex.col", [
			m(".flex", left),
			m(".flex", right),
		])
	} else {
		return m(".flex", [
			m(".flex.flex-half.pr-s", left),
			m(".flex.flex-half.pl-s", right),
		])
	}
}