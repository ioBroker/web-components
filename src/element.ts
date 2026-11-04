/**
 * Base class for ioBroker web components
 *
 * Takes over what every component would otherwise have to get right itself:
 * - `socket`, `settings`, `theme` and `editMode` may arrive in any order and change at any time,
 * - the states and objects the settings name are subscribed while the element is in the document, re-subscribed
 *   when the settings or the socket change, and unsubscribed when it leaves the document,
 * - several changes in one task are drawn once.
 *
 * ```js
 * import { IobWebComponent, defineWebComponent } from '@iobroker/web-components/element';
 *
 * export const manifest = { manifestVersion: 1, tag: 'my-value', name: 'Value', settings: { ... } };
 *
 * class MyValue extends IobWebComponent {
 *     getStateIds(settings) {
 *         return [settings.oid];
 *     }
 *     render() {
 *         this.textContent = String(this.states[this.settings.oid]?.val ?? '-');
 *     }
 * }
 *
 * defineWebComponent(manifest, MyValue);
 * ```
 *
 * This module defines a class that extends `HTMLElement`, so it can only be imported where there is a DOM.
 * Hosts import the main entry `@iobroker/web-components` instead.
 */
import { isFormDialog } from './dialog.js';
import { getText } from './manifest.js';
import { openNativeDialog } from './nativeDialog.js';
import { getPanelSettingTypes, toSettings } from './settings.js';
import type {
    WebComponentDialogs,
    WebComponentElementDialog,
    WebComponentFormDialog,
    WebComponentManifest,
    WebComponentSettings,
    WebComponentSocket,
    WebComponentText,
    WebComponentTheme,
} from './types.js';

export { openNativeDialog, type NativeDialogOptions } from './nativeDialog.js';

interface Subscription {
    socket: WebComponentSocket;
    /** The subscribed states */
    states: string[];
    /** The subscribed objects */
    objects: string[];
}

/** The IDs without empty entries and doubles */
function toIds(ids: (string | undefined | null)[]): string[] {
    return [...new Set(ids.filter((id): id is string => typeof id === 'string' && !!id))];
}

export abstract class IobWebComponent<
    TSettings extends WebComponentSettings = WebComponentSettings,
> extends HTMLElement {
    /** The values of the subscribed states, by ID; `null` while a state has no value */
    protected states: Record<string, ioBroker.State | null> = {};

    /**
     * The objects by ID, `null` if there is none: those of `getObjectIds` kept up to date, those of the states of
     * `getStateIds` read once per subscription
     */
    protected objects: Record<string, ioBroker.Object | null> = {};

    #socket: WebComponentSocket | null = null;

    #settings: TSettings = {} as TSettings;

    #theme: WebComponentTheme = 'light';

    #editMode = false;

    #dialogs: WebComponentDialogs | null = null;

    #subscription: Subscription | null = null;

    #renderPending = false;

    #onStateChange = (id: string, state: ioBroker.State | null | undefined): void => {
        if (this.#subscription?.states.includes(id)) {
            this.states[id] = state || null;
            this.#scheduleRender();
        }
    };

    #onObjectChange = (id: string, obj: ioBroker.Object | null | undefined): void => {
        if (this.#subscription?.objects.includes(id)) {
            this.objects[id] = obj || null;
            // the states may come from the object, like the nodes of a diagram
            this.#update();
        }
    };

    /** The connection to ioBroker, set by the host */
    get socket(): WebComponentSocket | null {
        return this.#socket;
    }

    set socket(socket: WebComponentSocket | null | undefined) {
        this.#socket = socket || null;
        this.#update();
    }

    /** The values of the settings of the manifest, set by the host - a new object on every change */
    get settings(): TSettings {
        return this.#settings;
    }

    set settings(settings: TSettings | null | undefined) {
        this.#settings = settings || ({} as TSettings);
        this.#update();
    }

    /** The theme of the host, `light` if the host sets none */
    get theme(): WebComponentTheme {
        return this.#theme;
    }

    set theme(theme: WebComponentTheme | null | undefined) {
        const value: WebComponentTheme = theme === 'dark' ? 'dark' : 'light';
        if (value !== this.#theme) {
            this.#theme = value;
            this.#scheduleRender();
        }
    }

    /** True while the user arranges the page in the editor of the host: write nothing, react to no clicks */
    get editMode(): boolean {
        return this.#editMode;
    }

    set editMode(editMode: boolean | null | undefined) {
        const value = !!editMode;
        if (value !== this.#editMode) {
            this.#editMode = value;
            this.#scheduleRender();
        }
    }

    /** Dialogs in the look of the host, if it offers them; `openDialog()` takes the browser's otherwise */
    get dialogs(): WebComponentDialogs | null {
        return this.#dialogs;
    }

    set dialogs(dialogs: WebComponentDialogs | null | undefined) {
        this.#dialogs = dialogs || null;
    }

    connectedCallback(): void {
        this.#update();
    }

    disconnectedCallback(): void {
        this.#unsubscribe();
    }

    /**
     * The states the element shows for these settings. Empty entries are ignored.
     *
     * The objects of `getObjectIds` may name them too, like the nodes of a diagram: read them from `objects`.
     * This is asked again whenever one of those objects arrives or changes.
     *
     * @param _settings the current settings
     */
    protected getStateIds(_settings: TSettings): (string | undefined | null)[] {
        return [];
    }

    /**
     * The objects the element shows for these settings, kept up to date in `objects` (e.g. a diagram that is
     * edited elsewhere). The objects of the states of `getStateIds` need not be listed: they are read anyway.
     *
     * @param _settings the current settings
     */
    protected getObjectIds(_settings: TSettings): (string | undefined | null)[] {
        return [];
    }

    /** Draw the element. Called after every change of the socket, the settings, a state, an object or the theme */
    protected abstract render(): void;

    /** The language of the ioBroker system, `en` while there is no socket. Not `lang`: that is the HTML attribute */
    protected get systemLang(): ioBroker.Languages {
        return this.#socket?.systemLang || 'en';
    }

    /**
     * A text of the manifest or of an object in the language of the system
     *
     * @param text a string or `{ en, de, ... }`
     */
    protected text(text: WebComponentText | undefined | null): string {
        return getText(text, this.systemLang);
    }

    /**
     * Write a state; does nothing without a socket and in edit mode
     *
     * @param id ID of the state
     * @param val the new value
     */
    protected setState(id: string, val: ioBroker.StateValue): Promise<void> {
        return this.#socket && !this.#editMode ? this.#socket.setState(id, val) : Promise.resolve();
    }

    /**
     * Tell the host something, e.g. a click it may want to answer with a dialog of its own: dispatches a
     * `CustomEvent` that bubbles out of the shadow DOM and can be cancelled
     *
     * @param type name of the event, with a `-` like a tag: `flow-node-click`
     * @param detail what the host needs to know
     * @returns false if the host called `preventDefault()`: it answers itself, the element does nothing more
     */
    protected emit(type: string, detail?: unknown): boolean {
        return this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable: true }));
    }

    /**
     * Show a dialog: the one of the host if it offers `dialogs`, the `<dialog>` of the browser otherwise. In edit
     * mode nothing is shown and the result is `null`.
     *
     * @param request a form the host renders, or an element of the component the host frames
     * @returns the values of a form, typed as it declares them; for an element the `detail` of its
     *   `iob-dialog-close` event; `null` when the user cancelled
     */
    protected openDialog(request: WebComponentFormDialog): Promise<WebComponentSettings | null>;
    protected openDialog(request: WebComponentElementDialog): Promise<unknown>;
    protected async openDialog(request: WebComponentFormDialog | WebComponentElementDialog): Promise<unknown> {
        if (this.#editMode) {
            return null;
        }
        const result = this.#dialogs
            ? await this.#dialogs.open(request)
            : await openNativeDialog(request, { lang: this.systemLang, theme: this.#theme });
        if (isFormDialog(request)) {
            // whatever a host returns, the component gets the types the form declares
            return result && typeof result === 'object'
                ? toSettings(getPanelSettingTypes(request.form), result as Record<string, unknown>)
                : null;
        }
        return result ?? null;
    }

    /** Subscribe what the settings name now and unsubscribe the rest, then draw */
    #update(): void {
        if (!this.isConnected) {
            return;
        }
        const socket = this.#socket;
        const states = socket ? toIds(this.getStateIds(this.#settings)) : [];
        const objects = socket ? toIds(this.getObjectIds(this.#settings)) : [];

        if (this.#subscription && this.#subscription.socket !== socket) {
            this.#unsubscribe();
        }
        const currentStates = this.#subscription?.states || [];
        const currentObjects = this.#subscription?.objects || [];
        const removedStates = currentStates.filter(id => !states.includes(id));
        const removedObjects = currentObjects.filter(id => !objects.includes(id));
        const addedStates = states.filter(id => !currentStates.includes(id));
        const addedObjects = objects.filter(id => !currentObjects.includes(id));

        if (socket && removedStates.length) {
            socket.unsubscribeState(removedStates, this.#onStateChange);
        }
        if (socket && removedObjects.length) {
            this.#unsubscribeObjects(socket, removedObjects);
        }
        for (const id of removedStates) {
            delete this.states[id];
        }
        for (const id of [...removedStates, ...removedObjects]) {
            if (!states.includes(id) && !objects.includes(id)) {
                delete this.objects[id];
            }
        }

        this.#subscription = socket && (states.length || objects.length) ? { socket, states, objects } : null;
        if (socket && addedStates.length) {
            this.#subscribeStates(socket, addedStates);
        }
        if (socket && addedObjects.length) {
            this.#subscribeObjects(socket, addedObjects);
        }
        this.#scheduleRender();
    }

    #isSubscribed(socket: WebComponentSocket, kind: 'states' | 'objects', id: string): boolean {
        return this.#subscription?.socket === socket && this.#subscription[kind].includes(id);
    }

    #subscribeStates(socket: WebComponentSocket, ids: string[]): void {
        socket
            .subscribeState(ids, this.#onStateChange)
            .catch(e => console.warn(`<${this.localName}>: cannot subscribe ${ids.join(', ')}: ${e}`));

        for (const id of ids) {
            // socket-client delivers the value on subscription; ask once more for a host whose socket does not
            socket
                .getState(id)
                .then(state => {
                    if (this.#isSubscribed(socket, 'states', id) && this.states[id] === undefined) {
                        this.states[id] = state || null;
                        this.#scheduleRender();
                    }
                })
                .catch(() => {});
            socket
                .getObject(id)
                .then(obj => {
                    // a subscribed object is kept up to date by its subscription
                    if (this.#isSubscribed(socket, 'states', id) && !this.#isSubscribed(socket, 'objects', id)) {
                        this.objects[id] = obj || null;
                        this.#scheduleRender();
                    }
                })
                .catch(() => {});
        }
    }

    #subscribeObjects(socket: WebComponentSocket, ids: string[]): void {
        socket
            .subscribeObject(ids, this.#onObjectChange)
            .catch(e => console.warn(`<${this.localName}>: cannot subscribe the objects ${ids.join(', ')}: ${e}`));

        // a subscription delivers changes only, not the object as it is now
        for (const id of ids) {
            socket
                .getObject(id)
                .then(obj => {
                    if (this.#isSubscribed(socket, 'objects', id)) {
                        this.objects[id] = obj || null;
                        this.#update();
                    }
                })
                .catch(() => {});
        }
    }

    #unsubscribeObjects(socket: WebComponentSocket, ids: string[]): void {
        socket.unsubscribeObject(ids, this.#onObjectChange).catch(() => {});
    }

    #unsubscribe(): void {
        if (this.#subscription) {
            const { socket, states, objects } = this.#subscription;
            if (states.length) {
                socket.unsubscribeState(states, this.#onStateChange);
            }
            if (objects.length) {
                this.#unsubscribeObjects(socket, objects);
            }
            this.#subscription = null;
        }
        this.states = {};
        this.objects = {};
    }

    #scheduleRender(): void {
        if (this.#renderPending) {
            return;
        }
        this.#renderPending = true;
        queueMicrotask(() => {
            this.#renderPending = false;
            if (this.isConnected) {
                this.render();
            }
        });
    }
}

/**
 * Register the element of a component under the tag of its manifest - once only, a second import of the module
 * (another version, another host on the same page) leaves the first definition in place
 *
 * @param manifest the manifest of the component
 * @param element the class of the element
 */
export function defineWebComponent(manifest: WebComponentManifest, element: CustomElementConstructor): void {
    if (!customElements.get(manifest.tag)) {
        customElements.define(manifest.tag, element);
    }
}
