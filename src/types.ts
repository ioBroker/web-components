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
 * and, if it has them, optional ones: `theme`, `editMode` and `dialogs`, see {@link WebComponentElement}.
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
    /** `objectId`: objects of these types only, `state` if missing - as in JSON-Config */
    types?: ioBroker.ObjectType | ioBroker.ObjectType[];
    /** `objectId`: this object and the ones below it only, e.g. `flow.0.diagrams` - as in JSON-Config */
    root?: string;
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
    /** Optional: the JSON schema of a manifest file, for editors - `@iobroker/web-components/schemas/manifest.json` */
    $schema?: string;
    /** Version of this contract, 1 for now */
    manifestVersion: 1;
    /** Name of the custom element: lower case, must contain a `-` */
    tag: string;
    /** Name of the component, e.g. for a palette */
    name: WebComponentText;
    description?: WebComponentText;
    /** Picture of the component: a `data:` URL or a URL relative to the manifest file */
    icon?: string;
    /**
     * The ES module that defines the element, relative to the manifest file. A host imports it only when it shows
     * the element. Required in a manifest file; a module that exports its manifest leaves it out
     */
    module?: string;
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
    /**
     * The objects of one type whose IDs lie between `start` and `end`, by ID - read once, not kept up to date
     *
     * For what a component has to find rather than name, e.g. the players of the instance of a setting:
     * `getObjectViewSystem('channel', 'music-assistant.0.players.', 'music-assistant.0.players.香')`.
     * Ask for a range as narrow as possible: without `start` and `end` it is every object of that type.
     *
     * @param type the type of the objects, e.g. `channel`
     * @param start the first ID
     * @param end the last ID; `<start>香` for everything below `start`
     */
    getObjectViewSystem<T extends ioBroker.ObjectType>(
        type: T,
        start?: string,
        end?: string,
    ): Promise<Record<string, ioBroker.AnyObject & { type: T }>>;
    /**
     * Send a command to an adapter instance and get its answer
     *
     * @param instance e.g. `flow.0`
     * @param command the command the adapter understands
     * @param data what the command needs
     */
    sendTo<T = unknown>(instance: string, command: string, data?: unknown): Promise<T>;
}

/** The values of the settings as the element gets them, keyed by the names in `items` */
export type WebComponentSettings = Record<string, string | number | boolean | undefined>;

/** Light or dark */
export type WebComponentThemeType = 'light' | 'dark';

/**
 * The theme of the host: its colors and its font, for what a component cannot take from the inherited CSS - a button
 * in the primary color, a panel on the page, the colors of a chart, text drawn into a canvas. Colors are CSS colors.
 * A host built with MUI gets it with `getWebComponentTheme(muiTheme)`.
 */
export interface WebComponentTheme {
    type: WebComponentThemeType;
    /** The main color of the host: buttons, links, the selected item */
    primary: string;
    /** Text on `primary` */
    primaryContrast: string;
    /** The color for accents beside `primary` */
    secondary: string;
    /** Text on `secondary` */
    secondaryContrast: string;
    /** The page behind the component */
    background: string;
    /** Panels, cards and dialogs on the page */
    paper: string;
    /** Text */
    text: string;
    /** Less important text: units, hints, labels */
    textSecondary: string;
    /** Lines between parts and borders */
    divider: string;
    error: string;
    warning: string;
    info: string;
    success: string;
    /** CSS `font-family` of the host */
    fontFamily: string;
    /** Base font size of the host in px */
    fontSize: number;
    /** Corner radius of buttons and fields in px; panels take about twice of it */
    borderRadius: number;
}

interface WebComponentDialogBase {
    title?: WebComponentText;
    /** In px; the host gives less on a small screen */
    width?: number;
    /** In px; the host gives less on a small screen */
    height?: number;
}

/**
 * A dialog whose content the component renders itself; the host only frames it (title, close button, backdrop)
 *
 * The host moves `element` into its dialog, so the element brings its own styles (a shadow root). It closes the
 * dialog by dispatching `iob-dialog-close` (bubbling, composed) with the result as `detail`.
 */
export interface WebComponentElementDialog extends WebComponentDialogBase {
    element: HTMLElement;
}

/** A dialog the host renders completely: fields like the settings, a JSON-Config panel */
export interface WebComponentFormDialog extends WebComponentDialogBase {
    form: WebComponentSettingsPanel;
    /** The values to start with, keyed by the names in `form.items`; else their `default` */
    data?: WebComponentSettings;
    /** Text of the button that takes the values, `OK` if missing */
    ok?: WebComponentText;
    /** Text of the button that drops them, `Cancel` if missing */
    cancel?: WebComponentText;
}

export type WebComponentDialogRequest = WebComponentElementDialog | WebComponentFormDialog;

/** `detail` of the event `iob-navigate` */
export interface WebComponentNavigateDetail {
    /** Name of the view of the host, as the user wrote it into the settings of the component */
    view: string;
}

/** Dialogs of the host - optional property `dialogs` of the element */
export interface WebComponentDialogs {
    /**
     * Show a dialog and resolve when it closes: with the values for a form (typed as the form declares them, like
     * settings), with the `detail` of `iob-dialog-close` for an element, with `null` when the user cancelled
     *
     * @param request what to show
     */
    open(request: WebComponentDialogRequest): Promise<unknown>;
}

/** The element as the host sees it */
export interface WebComponentElement extends HTMLElement {
    socket?: WebComponentSocket | null;
    settings?: WebComponentSettings;
    /**
     * Optional: the theme of the host, a complete object (`getWebComponentTheme()`); the light theme of ioBroker if
     * the host does not set it. The base class also takes `light` or `dark` of hosts older than the object
     */
    theme?: WebComponentTheme;
    /**
     * Optional: true while the user arranges the page in the editor of the host. The element then writes no
     * states and reacts to no clicks, and may show sample data where settings are still missing
     */
    editMode?: boolean;
    /** Optional: dialogs in the look of the host; without them a component takes the `<dialog>` of the browser */
    dialogs?: WebComponentDialogs | null;
}

/** What the module of a web component may export: older components bring their manifest so, not as a file */
export interface WebComponentModule {
    manifest?: WebComponentManifest;
}

/** Where a web component is described */
export interface WebComponentSource {
    /** Absolute URL of the manifest file (`.json`), or of a module that exports its manifest (`.js`) */
    url: string;
    /** The adapter that brings it, or empty if the host brings it itself */
    adapter: string;
    /** Version of that adapter */
    version: string;
}

/**
 * A web component whose manifest was read. Its element is defined only after `importWebComponent()` - a component
 * that comes as a module exporting its manifest, at once
 */
export interface LoadedWebComponent extends WebComponentSource {
    manifest: WebComponentManifest;
    /** Absolute URL of the module that defines the element */
    moduleUrl: string;
}

/** A file of the manifest of a component in the file storage of ioBroker - readable without web or admin */
export interface WebComponentFile {
    /** The adapter that brings it */
    adapter: string;
    /** Version of that adapter */
    version: string;
    /** The file storage of its admin folder: `<adapter>.admin` */
    id: string;
    /** Path of the file in it, e.g. `webcomponents/my-tile.json` */
    fileName: string;
}
