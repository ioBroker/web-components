/**
 * Dialogs a component asks for, and the events every host understands - what host and component agree on
 */
import type { WebComponentDialogRequest, WebComponentFormDialog } from './types.js';

/** The event with which the content of an element dialog closes it; `detail` is the result */
export const DIALOG_CLOSE_EVENT = 'iob-dialog-close';

/**
 * The event with which a component asks the host to show one of its views, e.g. after a click;
 * `detail` is a `WebComponentNavigateDetail`. A host that has views shows it and calls `preventDefault()`,
 * one without views ignores the event
 */
export const NAVIGATE_EVENT = 'iob-navigate';

/**
 * Whether the host renders the dialog itself (a form) or frames an element of the component
 *
 * @param request what the component asked for
 */
export function isFormDialog(request: WebComponentDialogRequest): request is WebComponentFormDialog {
    return !!(request as WebComponentFormDialog).form;
}
