# @iobroker/web-components

Custom elements that every ioBroker UI can show alike: vis-2, devices, aura, admin. A component describes its
own settings, the host renders that description as its own settings UI and hands the component two things - a
connection to ioBroker and the values of the settings.

This package is the contract between the two sides, plus what both would otherwise write themselves:

| Entry                                            | For               | What                                                          |
|--------------------------------------------------|-------------------|---------------------------------------------------------------|
| `@iobroker/web-components`                       | hosts             | types, checking a manifest, settings values, finding, loading |
| `@iobroker/web-components/element`               | component authors | base class `IobWebComponent`, `defineWebComponent`, dialogs   |
| `@iobroker/web-components/esm/react-19.js`       | web, admin        | React 19 as one ES module, served as `/lib/esm/react-19.js`   |
| `@iobroker/web-components/esm/react-18.js`       | web, admin        | React 18 as one ES module, served as `/lib/esm/react-18.js`   |
| `@iobroker/web-components/schemas/manifest.json` | authors, checkers | JSON schema of a manifest file                                |

The main entry touches no DOM while it is imported, so a host can use it in Node as well (tests, a backend
that reads or checks manifests). `element` defines a class that extends `HTMLElement` and needs a browser.

## The manifest and the module

A component is two files side by side in the admin folder of its adapter:

| File           | What                                                             |
|----------------|------------------------------------------------------------------|
| `my-tile.json` | the manifest: tag, name, icon, size, settings - and the module   |
| `my-tile.js`   | the ES module that registers the custom element                  |

The manifest is plain JSON, so everyone can read it without running code of the component: a host for its palette
and its settings, a backend, the repochecker, an editor with the schema. A host imports the module only when it
shows the element.

```json
{
    "$schema": "https://raw.githubusercontent.com/ioBroker/web-components/main/schemas/manifest.json",
    "manifestVersion": 1,
    "tag": "iob-state-tile",
    "name": { "en": "State tile", "de": "Zustandskachel" },
    "description": { "en": "...", "de": "..." },
    "icon": "iob-state-tile.svg",
    "module": "iob-state-tile.js",
    "size": { "width": 180, "height": 110 },
    "settings": {
        "type": "panel",
        "items": {
            "oid": { "type": "objectId", "label": { "en": "State", "de": "Datenpunkt" } },
            "decimals": { "type": "number", "label": "Decimals", "min": 0, "max": 6, "default": 1 },
            "toggle": { "type": "checkbox", "label": "Toggle on click", "default": true },
            "textTrue": { "type": "text", "label": "Text for true", "hidden": "!data.toggle" }
        }
    }
}
```

| Key           |                                                                                  |
|---------------|----------------------------------------------------------------------------------|
| `tag`         | name of the custom element: lower case, with a `-`                               |
| `description` | optional                                                                         |
| `icon`        | optional: relative to the manifest file, or a `data:` URL                        |
| `module`      | the ES module that registers the element, relative to the manifest file          |
| `size`        | optional: the size the element looks best in, in px                              |
| `settings`    | JSON-Config: a panel, or tabs of panels                                          |

The schema is `@iobroker/web-components/schemas/manifest.json`; `checkManifest()` checks the same in code.

The module registers its element - once only, `defineWebComponent` guards against a second import:

```js
import { defineWebComponent } from '@iobroker/web-components/element';

defineWebComponent('iob-state-tile', StateTile);
```

A component whose manifest is made in its source - e.g. with the translations of its adapter - lets its build write
the JSON file. It may still export the manifest from the module as `manifest`.

Up to 0.2.0 the module was the only file and exported its `manifest`. Such a module still works: a host imports it
at once to read the manifest.

A host gives a new instance the `size`, and the user may resize it. A component that works in exactly this size
only says so with `noResize`: the host then shows it so and lets nobody resize it.

```js
size: { width: 400, height: 300, noResize: true }, // noResize is optional, false if missing
```

`settings` is [JSON-Config](https://github.com/ioBroker/ioBroker.admin/blob/master/packages/jsonConfig/README.md),
so admin and devices (`@iobroker/json-config`) render it unchanged. A component may only use the types every
host can show:

`text` (`minRows`), `password`, `number` and `slider` (`min`, `max`, `step`), `checkbox`, `color`, `select`
(`options: [{ value, label }]`), `objectId` (`types`, `root`, e.g. `types: 'config', root: 'flow.0.diagrams'`),
`instance` (`adapter`), and the decorations without a value `header`, `staticText` (`text`) and `divider`.

Every text (`name`, `label`, `help`, `text`, the labels of options) is a string or `{ en, de, ... }`. `hidden`
and `disabled` are JS expressions over `data`, the values of all settings.

## The element

The host sets two **properties**, not attributes, and optional ones if it has them:

| Property   | What                                                                                        |
|------------|---------------------------------------------------------------------------------------------|
| `socket`   | `Connection` of `@iobroker/socket-client` - every host already has one                      |
| `settings` | the values of the settings, keyed by the names in `items`; a **new object** on every change |
| `theme`    | optional: the colors and the font of the host, see [Theme](#theme)                          |
| `editMode` | optional: `true` while the user arranges the page in the editor of the host                 |
| `dialogs`  | optional: dialogs in the look of the host, see [Dialogs](#dialogs)                          |
| `value`    | optional: the value the component edits, from a host that stores one, see [Values](#values) |

The values are in one object, not in a property each, because many names a setting would have are taken by
`HTMLElement` already: `title`, `lang`, `hidden`, `id`, `style`, ...

The rules for a component:

- It works in any order: `settings` before `socket`, `socket` before `settings`, all of them changing at any time.
  Without a socket it waits for one; it never opens a connection of its own.
- It subscribes while it is in the document and unsubscribes when it leaves. Of the socket it uses only
  `subscribeState`, `unsubscribeState`, `getState`, `setState`, `getObject`, `subscribeObject`,
  `unsubscribeObject`, `getHistory`, `getObjectViewSystem`, `sendTo` and `systemLang` (`WebComponentSocket`).
  With `getObjectViewSystem(type, start, end)` it finds objects it cannot name, like the players below the
  instance of a setting - read once, in a range as narrow as possible. With `sendTo(instance, command, data)` it
  asks its own adapter for what states and objects do not carry.
- A value has the type its setting declares: a number for `number` and `slider`, a boolean for `checkbox`, a
  string otherwise. A setting without a value is missing from the object.
- It fills the box the host gives it (`:host { display: block; width: 100%; height: 100% }`) and never measures
  itself - it scales with container queries (`container-type: size`, `cqmin`).
- It has a transparent background and inherits `color` and `font` from the host, so it follows the theme of the
  host. Shadow DOM keeps its own styles in and the styles of the host out; the [theme](#theme) brings the rest of
  the look of the host: the primary color of a button, the background of a panel, the colors of a chart.
- In `editMode` it writes no states, sends no command that changes something, and reacts to no clicks - the
  host needs them to select and move it. Where settings are still missing, it may show sample data.
- It brings everything it needs; a component built with Lit or Svelte bundles its framework, one built with React
  may take React from the host (see [Frameworks in components](#frameworks-in-components)).

The base class takes care of the first two rules:

```js
// my-value.js - its manifest my-value.json names it as "module"
import { IobWebComponent, defineWebComponent } from '@iobroker/web-components/element';

class MyValue extends IobWebComponent {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    // the states to subscribe for these settings - re-asked after every change
    getStateIds(settings) {
        return [settings.oid];
    }

    // called after every change of the socket, the settings, a state or an object; once per task
    render() {
        const oid = this.settings.oid;
        const name = this.text(this.objects[oid]?.common.name) || oid;
        this.shadowRoot.textContent = `${name}: ${this.states[oid]?.val ?? '-'}`;
    }
}

defineWebComponent('my-value', MyValue);
```

`this.states` and `this.objects` hold what the subscribed IDs have, `this.setState(id, val)` writes through the
socket (not in edit mode), `this.text(...)` translates into `this.systemLang`, `this.value` and
`this.changeValue(value)` are the [value](#values) the component edits. The objects of the states are read
once; `getObjectIds(settings)` names objects to keep up to date, like a diagram that is edited elsewhere.
`getStateIds` may read those objects - the states a diagram names - and is asked again whenever one of them arrives
or changes. `this.theme` is the theme of the host, always complete, and `this.editMode` what the host set; a change
of them draws again as well.

## Theme

The host sets `theme` to an object with its colors and its font. Colors are CSS colors, sizes numbers in px:

| Field                                 | What                                                       |
|---------------------------------------|------------------------------------------------------------|
| `type`                                | `light` or `dark`                                          |
| `primary`, `primaryContrast`          | the main color of the host (buttons, links) and text on it |
| `secondary`, `secondaryContrast`      | the color for accents and text on it                       |
| `background`                          | the page behind the component                              |
| `paper`                               | panels, cards and dialogs on the page                      |
| `text`, `textSecondary`               | text, and less important text: units, hints, labels        |
| `divider`                             | lines between parts, borders                               |
| `error`, `warning`, `info`, `success` | the colors of a state                                      |
| `fontFamily`, `fontSize`              | the font of the host                                       |
| `borderRadius`                        | the corners of buttons and fields; panels take about twice |

A host built with MUI - vis-2, devices, admin - takes it from its MUI theme:

```js
import { getWebComponentTheme } from '@iobroker/web-components';

el.theme = getWebComponentTheme(muiTheme); // e.g. from useTheme()
```

A host without MUI sets the fields it has; the rest comes from the light or the dark theme of ioBroker
(`getDefaultTheme(type)`). Without any theme a component looks like the light theme of ioBroker.

With the base class, `this.theme` is always complete, and the element carries the theme as CSS variables. They
reach into its shadow DOM, so plain CSS follows the host:

```css
.panel {
    background: var(--iob-paper);
    border: 1px solid var(--iob-divider);
    border-radius: calc(var(--iob-border-radius) * 2);
}
.unit {
    color: var(--iob-text-secondary);
}
button {
    background: var(--iob-primary);
    color: var(--iob-primary-contrast);
    border-radius: var(--iob-border-radius);
}
```

`--iob-primary`, `--iob-primary-contrast`, `--iob-secondary`, `--iob-secondary-contrast`, `--iob-background`,
`--iob-paper`, `--iob-text`, `--iob-text-secondary`, `--iob-divider`, `--iob-error`, `--iob-warning`, `--iob-info`,
`--iob-success`, `--iob-font-family`, `--iob-font-size` and `--iob-border-radius` (with `px`), plus `color-scheme`
for the native fields and scroll bars inside. The fallback dialog of the browser takes the theme too.

The base class also takes `light` or `dark` from a host older than the object. A component without the base class
gets the complete theme with `toWebComponentTheme(this.theme)` and the CSS variables with `getThemeCssVariables()`,
both from `@iobroker/web-components/element` as well.

## Events to the host

To tell the host something - a click on a part of it, a value the user picked - a component dispatches a
`CustomEvent` that `bubbles`, is `composed` (so it leaves the shadow DOM) and is `cancelable`. A host that answers
it itself, e.g. with a dialog of its own, calls `preventDefault()`, and the component does nothing more:

```js
// in the component - with the base class: this.emit(type, detail)
if (this.emit('flow-node-click', { node: 'pv' })) {
    this.showPopup('pv'); // nobody answered it
}

// in the host
el.addEventListener('flow-node-click', e => {
    e.preventDefault();
    showDialog(e.detail);
});
```

The name of an event contains a `-`, like a tag, so it never clashes with an event of the DOM. A host often clips
what leaves the box of a component, so a popup is usually better shown by the host.

Events every host understands:

| Event (constant)                          | `detail`              | The host                                                            |
|-------------------------------------------|-----------------------|---------------------------------------------------------------------|
| `iob-navigate` (`NAVIGATE_EVENT`)         | `{ view: 'Heating' }` | shows its view of that name if it has views, ignores the event else |
| `iob-dialog-close` (`DIALOG_CLOSE_EVENT`) | the result            | closes the element dialog, see below                                |
| `iob-change` (`CHANGE_EVENT`)             | the new value         | stores it if it stores values, see [Values](#values)                |

## Values

Most components show something. Some edit a value as well - a schedule, a list of times, a color, a place on a map -
and are shown by a host that keeps such values: JSON-Config in admin and devices, where the value is the attribute
of its item in the configuration of an instance. The value is not one of the `settings`: those say how the
component looks and works and are set by whoever places it; the value is what the user edits with it.

- The host sets the property `value`: JSON, any type the component needs. A host without values (vis-2) does not
  set it.
- The component changes it with the event `iob-change` (`CHANGE_EVENT`), whose `detail` is the new value - JSON, so
  the host can save it. A host that stores values stores it and calls `preventDefault()`; the component then takes
  the new value as its `value` itself. A host without values ignores the event, and so does a host whose field is
  disabled at the moment - the value stays as it was.
- The host sets `value` again whenever the stored value differs from the one the component has: changed by another
  field, or stored otherwise than sent - a limit, a confirmation the user declined. After the component's own
  change it does not.
- It reports a change when the user is done - a slider is let go, a dialog is closed - not on every move: the host
  checks every value, may ask the user to confirm it and marks the configuration as changed. Until then the
  component shows what the user does from its own state.
- In edit mode it changes nothing.

The value belongs to the host, as with a controlled field: the base class changes `this.value` only when the host
took the new one.

```js
class MySchedule extends IobWebComponent {
    render() {
        const bars = Array.isArray(this.value) ? this.value : [];
        // ... draw the bars
    }

    #onDragEnd(bars) {
        if (!this.changeValue(bars)) {
            // nobody stores it: e.g. vis-2. The bars jump back
        }
    }
}
```

Without the base class, a component defines `value` itself and dispatches the event like any other (bubbling,
composed, cancelable): `dispatchEvent()` returns `false` when the host took it.

## Dialogs

A component brings no dialog of its own - no MUI only for that. A MUI dialog would not even work: its portal
leaves the shadow DOM, where its styles are, and inside the shadow DOM the box of the component clips it. The
host frames the dialog instead, and the component asks for one of two kinds:

```js
// a form: the host renders the fields - the types of the settings, a JSON-Config panel - and gives the values
const values = await this.openDialog({
    title: { en: 'Limits', de: 'Grenzen' },
    form: { type: 'panel', items: { max: { type: 'number', label: 'Maximum', min: 0, max: 100 } } },
    data: { max: 80 },
});
// { max: 80 } typed as the form declares it, or null if the user cancelled

// an element: the component renders the content, the host only frames it (title, close button, backdrop)
const content = document.createElement('div');
content.attachShadow({ mode: 'open' }).innerHTML = '<svg>...</svg><button>Done</button>';
content.shadowRoot.querySelector('button').onclick = () =>
    content.dispatchEvent(new CustomEvent('iob-dialog-close', { detail: 'done', bubbles: true, composed: true }));
const result = await this.openDialog({ title: 'Battery', element: content, width: 600 });
// 'done', or null if the user closed it
```

`openDialog()` of the base class asks the host if it set `dialogs`, and takes the `<dialog>` of the browser
otherwise - opened with `showModal()`, it lies above everything of the page and is clipped by nothing. So a
component works in every host; in a host with `dialogs` it looks like the host. In edit mode it shows nothing and
gives `null`. Without the base class, `openNativeDialog(request, { lang, theme })` of
`@iobroker/web-components/element` is the same fallback.

The host moves the element of an element dialog into its own dialog, so the element brings its own styles in a
shadow root, and closes the dialog with the event `iob-dialog-close` (`DIALOG_CLOSE_EVENT`).

A host implements `dialogs.open(request)`: `isFormDialog(request)` tells the two kinds apart; for a form it renders
`request.form` like the settings and resolves with the values (`toSettings(getPanelSettingTypes(request.form),
values)` types them), for an element it puts `request.element` into its dialog and resolves with the `detail` of
`iob-dialog-close`; `null` when the user cancels.

The order for a click is: the event first (the host may answer it completely), then `openDialog()`.

## Frameworks in components

A component may be written with anything that ends up as a custom element: plain DOM, Lit, Preact, Svelte,
React. The host neither knows nor cares.

The contract carries **no React object** from the host. It would not help:

- A module that uses React calls it while it is evaluated (`createContext`, `forwardRef`, `memo` of every library
  it imports) - long before a host could hand anything to an element.
- `import { useState } from 'react'` cannot be rebound to an object passed in later. A component would have to
  call `this.React.useState` everywhere, and no library (MUI, ...) is written like that.
- Every component would be tied to the React version of every host it runs in.

What to do instead:

- **Lit or Preact** for new components: a few KB per component, and no question of sharing.
- **One build per adapter**: the components of one adapter are one Vite build with an entry each, so they share
  their chunks - and one React - with each other.
- **React from the host**: web and admin serve React 19 as one ES module at `/lib/esm/react-19.js`
  (`REACT_19_URL`), and React 18 at `/lib/esm/react-18.js` (`REACT_18_URL`): `react`, `react-dom`,
  `react-dom/client` and `react/jsx-runtime` together, so there can never be two copies of React in one. A
  component maps these imports (`REACT_SPECIFIERS`) onto that module instead of bundling them, and every React
  component of that major on the page uses the same instance.

The component imports React by a path relative to itself, made by `getReactImportPath(modulePath)` from where its
module lies in the admin folder. A host loads the module from `<base>/adapter/<adapter>/` and has `<base>/lib/esm/`
beside it, so the browser finds React under the same `<base>` - also behind a reverse proxy that serves ioBroker
under a path (`https://example.com/iob/`). A property of the element could not give the path: the imports are
resolved while the module is evaluated, before a host can set anything.

```js
// vite.config.mjs - the module is built to admin/webcomponents/my-tile.js
import { getReactImportPath, REACT_SPECIFIERS } from '@iobroker/web-components';

const react = getReactImportPath('webcomponents/my-tile.js'); // '../../../lib/esm/react-19.js'

export default {
    build: {
        lib: { entry: 'src/my-tile.jsx', formats: ['es'], fileName: () => 'my-tile.js' },
        rollupOptions: {
            external: REACT_SPECIFIERS,
            output: { paths: Object.fromEntries(REACT_SPECIFIERS.map(name => [name, react])) },
        },
    },
};
```

A component on React 18 takes `getReactImportPath(modulePath, 18)`. The built module then starts with
`import { createRoot, jsx, jsxs } from "../../../lib/esm/react-19.js"`; the example below is 3 KB, with the base
class bundled. It renders into its shadow root:

```jsx
import { createRoot } from 'react-dom/client';
import { IobWebComponent, defineWebComponent } from '@iobroker/web-components/element';

function Tile({ name, value, onToggle }) {
    return (
        <button onClick={onToggle}>
            {name}: {String(value ?? '-')}
        </button>
    );
}

class MyTile extends IobWebComponent {
    #root = createRoot(this.attachShadow({ mode: 'open' }));

    getStateIds(settings) {
        return [settings.oid];
    }

    render() {
        const oid = this.settings.oid;
        const value = this.states[oid]?.val;
        const name = this.text(this.objects[oid]?.common.name) || oid;
        this.#root.render(
            <Tile
                name={name}
                value={value}
                onToggle={() => this.setState(oid, !value)}
            />,
        );
    }
}

defineWebComponent('my-tile', MyTile);
```

What to know about the shared React:

- web and admin copy `build/esm/react-19.js` and `react-18.js` of this package into their `lib/esm/` when they
  are built, so the React minor is the one of the package version they ship. A component needs a major, nothing
  more specific; React 20 would come as `react-20.js` beside them.
- The size, minified: `react-19.js` 221 KB (69 KB gzip), `react-18.js` 142 KB (45 KB gzip). A browser loads a
  file only when a component on the page imports it, and once for all of them.
- Both majors work side by side on one page, each with its own instance: a React 18 component next to a React 19
  one.
- The host's own React (vis-2 bundles one) is another copy. That does no harm: a component renders into a root of
  its own and shares no elements with the host.
- A host serves `lib/esm/` beside `adapter/`, under the same base: web and admin do. `REACT_19_URL` and
  `REACT_18_URL` are where that is without a path prefix; a component does not import them, they miss behind a
  reverse proxy with a path.

## How a host finds and shows the components

An adapter lists its components in `common.webComponents` of its `io-package.json`: the manifest files, relative to
its admin folder. Admin and web both serve that folder as `/adapter/<adapter>/`, so every host loads them from the
same place; the file storage of ioBroker has it as `<adapter>.admin`.

```json
"common": {
    "webComponents": ["webcomponents/my-tile.json"]
}
```

```ts
import {
    getSettingTypes,
    getWebComponentSources,
    importWebComponent,
    loadWebComponents,
    toSettings,
} from '@iobroker/web-components';

const instances = Object.values(await socket.getObjectViewSystem('instance', 'system.adapter.', 'system.adapter.\u9999'));
// the manifests only - for the palette and the settings; no code of a component runs
const components = await loadWebComponents(getWebComponentSources(instances, document.baseURI));

// show one: its module first, so that the element has its class when it gets its properties
const component = components[0];
await importWebComponent(component);
const el = document.createElement(component.manifest.tag);
el.socket = socket;
el.settings = toSettings(getSettingTypes(component.manifest), storedValues);
container.appendChild(el);
```

`importWebComponent` imports a module once, however often it is asked, and rejects if the module does not define
the tag of the manifest. A host creates the element only after that; the base class would take over properties
set earlier, a component without it might not.

`getWebComponentSources` finds `/adapter/` from the address of the host: next to its folder (`/vis-2/`), at the
root, or - for a host that is an admin tab like `/adapter/devices/tab.html` - next to its own adapter folder. A path
prefix of a reverse proxy stays.

`getDefaultSettings(manifest)` gives the values for a new instance, `getSettingsGroups(manifest)` the panels
to render, `resolveManifestUrl(manifest.icon, component.url)` the icon, `checkManifest(manifest)` what is wrong
with one.

### Without web or admin

A host that is served neither by web nor by admin, and a backend, read the manifests from the file storage:

```ts
import { getWebComponentFiles, readWebComponentManifests } from '@iobroker/web-components';

// [{ adapter: 'flow', version, id: 'flow.admin', fileName: 'webcomponents/flow-diagram.json' }]
const files = getWebComponentFiles(instances);
const manifests = await readWebComponentManifests(files, async (id, fileName) =>
    (await adapter.readFileAsync(id, fileName)).file.toString(),
);
```

That is enough for a palette and the settings. To show an element, a browser still needs the module at a URL: the
host serves the admin folder of the adapter itself, or its page is served by web.

## Open points

- Size in a grid (sections of vis-2, cards of devices), and whether a component can ask its host for another size.
- Which other events a host can bind to actions of its own, and whether the manifest lists them.
- Whether the manifest says that a component edits a value, so that a host without values (vis-2) can leave it out
  of its palette.
- Versioning: two adapters bringing the same tag, an older module still cached by the browser.

## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->
### 0.6.0 (2026-11-05)
- (@GermanBluefox) Added values: a component that edits a value - in JSON-Config the attribute of its item - gets it
  from the host as the optional property `value` and changes it with the event `iob-change` (`CHANGE_EVENT`), whose
  `detail` is the new value. The base class has `this.value` and `changeValue()`, which changes the value only when
  the host took it. A host without values ignores the event

### 0.5.0 (2026-11-05)
- (@GermanBluefox) (breaking) `theme` is an object with the colors and the font of the host: `primary`, `secondary`,
  `background`, `paper`, `text`, `divider`, the colors of a state, `fontFamily`, `fontSize`, `borderRadius` and
  `type` (`light` or `dark`). Hosts built with MUI get it with `getWebComponentTheme(muiTheme)`. The base class
  completes what a host leaves out, still takes `light` or `dark` of older hosts, and sets the theme as CSS
  variables (`--iob-primary`, ...) on the element. A component that compared `this.theme` with `'dark'` reads
  `this.theme.type` now
- (@GermanBluefox) The fallback dialog of the browser takes the colors and the font of the theme

### 0.4.0 (2026-11-04)
- (@GermanBluefox) Added `getObjectViewSystem` to `WebComponentSocket`: a component finds the objects of one type
  in a range of IDs, e.g. the players of an instance. `Connection` of `@iobroker/socket-client` has it already, so
  vis-2, devices and admin pass it on unchanged
- (@GermanBluefox) Added `getReactImportPath(modulePath, major)`: a component imports the shared React relative to
  its own module (`../../../lib/esm/react-19.js`), so it finds it behind a reverse proxy with a path prefix too.
  Components built with `REACT_19_URL` keep working without a prefix; build them again to work with one

### 0.3.0 (2026-11-04)
- (@GermanBluefox) (breaking) A component is described by a manifest file (`.json`) next to its module, named in
  `common.webComponents`; the manifest gives the module as `module`. Hosts, backends and the repochecker read it
  without running code of the component. A module that exports its manifest still works
- (@GermanBluefox) `loadWebComponents` reads the manifests only; `importWebComponent()` imports the module of a
  component once, when the host shows it. `LoadedWebComponent` got `moduleUrl`
- (@GermanBluefox) Added `getWebComponentFiles()` and `readWebComponentManifests()`: the manifests from the file
  storage of ioBroker, for a host without web or admin and for a backend
- (@GermanBluefox) Added the JSON schema of a manifest file: `@iobroker/web-components/schemas/manifest.json`
- (@GermanBluefox) `defineWebComponent()` takes the tag alone, and the base class takes over properties a host set
  before the element was defined

### 0.2.0 (2026-11-04)
- (@GermanBluefox) Added dialogs: the optional host property `dialogs`, `openDialog()` in the base class with the
  `<dialog>` of the browser as fallback (`openNativeDialog()`), and `isFormDialog()`, `getPanelSettingTypes()` and
  `DIALOG_CLOSE_EVENT` for hosts
- (@GermanBluefox) The base class asks `getStateIds` again when an object of `getObjectIds` arrives or changes, so
  the states may come from an object (the nodes of a diagram)
- (@GermanBluefox) Added the event `iob-navigate` (`NAVIGATE_EVENT`) to show a view of the host
- (@GermanBluefox) Added the filters `types` and `root` of `objectId` settings
- (@GermanBluefox) `getWebComponentSources` finds `/adapter/` from a host that is an admin tab too

### 0.1.0 (2026-11-04)
- (@GermanBluefox) Initial release: the contract, helpers for hosts and the base class `IobWebComponent`
- (@GermanBluefox) Added `build/esm/react-19.js` - React 19 as one ES module for web and admin to serve as
  `/lib/esm/react-19.js` - with `REACT_19_URL` and `REACT_SPECIFIERS` for the build of a React component
- (@GermanBluefox) Added `build/esm/react-18.js` and `REACT_18_URL` - the same for React 18
- (@GermanBluefox) Added `subscribeObject`, `unsubscribeObject`, `getHistory` and `sendTo` to
  `WebComponentSocket`, and `getObjectIds()` to the base class for objects that are kept up to date
- (@GermanBluefox) Added the optional host properties `theme` and `editMode`, `size.noResize`, and events to the
  host (`emit()` in the base class)

## License
MIT License

Copyright (c) 2026 Denis Haev <dogafox@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
