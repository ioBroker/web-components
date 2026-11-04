/**
 * The contract between an ioBroker web component and the application that shows it (vis-2, devices, aura, admin).
 *
 * A web component is an ES module that
 * 1. registers its custom element when it is imported (guarded against a second import, see `defineWebComponent`),
 * 2. exports `manifest` - a JSON-serializable {@link WebComponentManifest}.
 *
 * The host then sets two properties on the element:
 * - `socket`: the connection to ioBroker, see {@link WebComponentSocket}
 * - `settings`: the values of the settings the manifest describes, a new object on every change
 *
 * and, if it has them, two optional ones: `theme` and `editMode`, see {@link WebComponentElement}.
 *
 * To tell the host something, the element dispatches a `CustomEvent` that bubbles, is composed and can be
 * cancelled; a host that calls `preventDefault()` answers it itself.
 */

/** A text in one or several languages, like `common.name` of an object */
export type WebComponentText = ioBroker.StringOrTranslated;

/** What a host has to be able to show of the settings - a subset of JSON-Config */
export type WebComponentSettingType =
    | 'text'
    | 'password'
    | 'number'
    | 'slider'
    | 'checkbox'
    | 'color'
    | 'select'
    | 'objectId'
    | 'instance'
    | 'header'
    | 'staticText'
    | 'divider';

export interface WebComponentSettingOption {
    value: string | number | boolean;
    label: WebComponentText;
}

/** One entry of `items` in a JSON-Config panel */
export interface WebComponentSetting {
    type: WebComponentSettingType;
    label?: WebComponentText;
    /** Explanation of the field */
    help?: WebComponentText;
    /** The text of `header` and `staticText` */
    text?: WebComponentText;
    default?: string | number | boolean;
    /** `number`, `slider` */
    min?: number;
    max?: number;
    step?: number;
    /** `text`: more than one line */
    minRows?: number;
    /** `select` */
    options?: WebComponentSettingOption[];
    /** `instance`: instances of this adapter only */
    adapter?: string;
    /** JS expression over `data` (the values of all settings), as in JSON-Config */
    hidden?: string;
    /** JS expression over `data` (the values of all settings), as in JSON-Config */
    disabled?: string;
}

/** A JSON-Config panel: the keys of `items` are the names of the settings */
export interface WebComponentSettingsPanel {
    type: 'panel';
    label?: WebComponentText;
    items: Record<string, WebComponentSetting>;
}

/** A JSON-Config tab panel: each tab is a group of settings */
export interface WebComponentSettingsTabs {
    type: 'tabs';
    items: Record<string, WebComponentSettingsPanel>;
}

/** The size a component looks best in */
export interface WebComponentSize {
    /** In px */
    width: number;
    /** In px */
    height: number;
    /**
     * Optional, false if missing. True: the component works in exactly this size only - the host shows it so and
     * lets nobody resize it
     */
    noResize?: boolean;
}

export interface WebComponentManifest {
    /** Version of this contract, 1 for now */
    manifestVersion: 1;
    /** Name of the custom element: lower case, must contain a `-` */
    tag: string;
    /** Name of the component, e.g. for a palette */
    name: WebComponentText;
    description?: WebComponentText;
    /** Picture of the component: a `data:` URL or a URL relative to the module */
    icon?: string;
    /** The size the element looks best in. A host uses it for a new instance */
    size?: WebComponentSize;
    /** The settings of the component, in JSON-Config */
    settings: WebComponentSettingsPanel | WebComponentSettingsTabs;
}

/** Called with the new object, or `null` when it was deleted */
export type WebComponentObjectChangeHandler = (id: string, obj: ioBroker.Object | null | undefined) => void;

/**
 * The part of `Connection` (`@iobroker/socket-client`) a web component may rely on. Every host has such a
 * connection anyway: vis-2, admin, devices and every app built on `@iobroker/gui-components`.
 */
export interface WebComponentSocket {
    systemLang: ioBroker.Languages;
    subscribeState(id: string | string[], cb: ioBroker.StateChangeHandler): Promise<void>;
    unsubscribeState(id: string | string[], cb?: ioBroker.StateChangeHandler): void;
    getState(id: string): Promise<ioBroker.State | null | undefined>;
    setState(id: string, val: ioBroker.StateValue | ioBroker.SettableState, ack?: boolean): Promise<void>;
    getObject(id: string): Promise<ioBroker.Object | null | undefined>;
    subscribeObject(id: string | string[], cb: WebComponentObjectChangeHandler): Promise<void>;
    unsubscribeObject(id: string | string[], cb?: WebComponentObjectChangeHandler): Promise<void>;
    getHistory(id: string, options: ioBroker.GetHistoryOptions): Promise<ioBroker.GetHistoryResult>;
}

/** The values of the settings as the element gets them, keyed by the names in `items` */
export type WebComponentSettings = Record<string, string | number | boolean | undefined>;

/** The theme of the host, for what a component cannot take from the inherited CSS */
export type WebComponentTheme = 'light' | 'dark';

/** The element as the host sees it */
export interface WebComponentElement extends HTMLElement {
    socket?: WebComponentSocket | null;
    settings?: WebComponentSettings;
    /** Optional: the theme of the host, `light` if the host does not set it */
    theme?: WebComponentTheme;
    /**
     * Optional: true while the user arranges the page in the editor of the host. The element then writes no
     * states and reacts to no clicks, and may show sample data where settings are still missing
     */
    editMode?: boolean;
}

/** What the module of a web component exports */
export interface WebComponentModule {
    manifest?: WebComponentManifest;
}

/** Where the module of a web component is */
export interface WebComponentSource {
    /** Absolute URL of the module */
    url: string;
    /** The adapter that brings it, or empty if the host brings it itself */
    adapter: string;
    /** Version of that adapter */
    version: string;
}

/** A web component that was found and loaded: its element is defined */
export interface LoadedWebComponent extends WebComponentSource {
    manifest: WebComponentManifest;
}
