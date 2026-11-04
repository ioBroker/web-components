/**
 * Dialogs a component asks for - what host and component agree on
 */
import type { WebComponentDialogRequest, WebComponentFormDialog } from './types.js';

/** The event with which the content of an element dialog closes it; `detail` is the result */
export const DIALOG_CLOSE_EVENT = 'iob-dialog-close';

/**
 * Whether the host renders the dialog itself (a form) or frames an element of the component
 *
 * @param request what the component asked for
 */
export function isFormDialog(request: WebComponentDialogRequest): request is WebComponentFormDialog {
    return !!(request as WebComponentFormDialog).form;
}
