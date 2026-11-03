/**
 * Base class for ioBroker web components
 *
 * Takes over what every component would otherwise have to get right itself:
 * - `socket` and `settings` may arrive in any order and change at any time,
 * - the states the settings name are subscribed while the element is in the document, re-subscribed when the
 *   settings or the socket change, and unsubscribed when it leaves the document,
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
import { getText } from './manifest.js';
import type { WebComponentManifest, WebComponentSettings, WebComponentSocket, WebComponentText } from './types.js';

interface Subscription {
    socket: WebComponentSocket;
    ids: string[];
}

export abstract class IobWebComponent<
    TSettings extends WebComponentSettings = WebComponentSettings,
> extends HTMLElement {
    /** The values of the subscribed states, by ID; `null` while a state has no value */
    protected states: Record<string, ioBroker.State | null> = {};

    /** The objects of the subscribed states, by ID; read once per subscription, `null` if there is none */
    protected objects: Record<string, ioBroker.Object | null> = {};

    #socket: WebComponentSocket | null = null;

    #settings: TSettings = {} as TSettings;

    #subscription: Subscription | null = null;

    #renderPending = false;

    #onStateChange = (id: string, state: ioBroker.State | null | undefined): void => {
        if (this.#subscription?.ids.includes(id)) {
            this.states[id] = state || null;
            this.#scheduleRender();
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

    connectedCallback(): void {
        this.#update();
    }

    disconnectedCallback(): void {
        this.#unsubscribe();
    }

    /**
     * The states the element shows for these settings. Empty entries are ignored.
     *
     * @param _settings the current settings
     */
    protected getStateIds(_settings: TSettings): (string | undefined | null)[] {
        return [];
    }

    /** Draw the element. Called after every change of the socket, the settings, a state or an object */
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
     * Write a state; does nothing without a socket
     *
     * @param id ID of the state
     * @param val the new value
     */
    protected setState(id: string, val: ioBroker.StateValue): Promise<void> {
        return this.#socket ? this.#socket.setState(id, val) : Promise.resolve();
    }

    /** Subscribe what the settings name now and unsubscribe the rest, then draw */
    #update(): void {
        if (!this.isConnected) {
            return;
        }
        const socket = this.#socket;
        const wanted = socket
            ? [
                  ...new Set(
                      this.getStateIds(this.#settings).filter((id): id is string => typeof id === 'string' && !!id),
                  ),
              ]
            : [];

        if (this.#subscription && this.#subscription.socket !== socket) {
            this.#unsubscribe();
        }
        const current = this.#subscription?.ids || [];
        const removed = current.filter(id => !wanted.includes(id));
        const added = wanted.filter(id => !current.includes(id));

        if (socket && removed.length) {
            socket.unsubscribeState(removed, this.#onStateChange);
            for (const id of removed) {
                delete this.states[id];
                delete this.objects[id];
            }
        }
        this.#subscription = socket && wanted.length ? { socket, ids: wanted } : null;
        if (socket && added.length) {
            this.#subscribe(socket, added);
        }
        this.#scheduleRender();
    }

    #subscribe(socket: WebComponentSocket, ids: string[]): void {
        const stillWanted = (id: string): boolean =>
            this.#subscription?.socket === socket && this.#subscription.ids.includes(id);

        socket
            .subscribeState(ids, this.#onStateChange)
            .catch(e => console.warn(`<${this.localName}>: cannot subscribe ${ids.join(', ')}: ${e}`));

        for (const id of ids) {
            // socket-client delivers the value on subscription; ask once more for a host whose socket does not
            socket
                .getState(id)
                .then(state => {
                    if (stillWanted(id) && this.states[id] === undefined) {
                        this.states[id] = state || null;
                        this.#scheduleRender();
                    }
                })
                .catch(() => {});
            socket
                .getObject(id)
                .then(obj => {
                    if (stillWanted(id)) {
                        this.objects[id] = obj || null;
                        this.#scheduleRender();
                    }
                })
                .catch(() => {});
        }
    }

    #unsubscribe(): void {
        if (this.#subscription) {
            this.#subscription.socket.unsubscribeState(this.#subscription.ids, this.#onStateChange);
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
