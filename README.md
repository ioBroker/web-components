# @iobroker/web-components

Custom elements that every ioBroker UI can show alike: vis-2, devices, aura, admin. A component describes its
own settings, the host renders that description as its own settings UI and hands the component two things - a
connection to ioBroker and the values of the settings.

This package is the contract between the two sides, plus what both would otherwise write themselves:

| Entry                                      | For               | What                                                          |
|--------------------------------------------|-------------------|---------------------------------------------------------------|
| `@iobroker/web-components`                 | hosts             | types, checking a manifest, settings values, finding, loading |
| `@iobroker/web-components/element`         | component authors | base class `IobWebComponent`, `defineWebComponent`, dialogs   |
| `@iobroker/web-components/esm/react-19.js` | web, admin        | React 19 as one ES module, served as `/lib/esm/react-19.js`   |
| `@iobroker/web-components/esm/react-18.js` | web, admin        | React 18 as one ES module, served as `/lib/esm/react-18.js`   |

The main entry touches no DOM while it is imported, so a host can use it in Node as well (tests, a backend
that checks manifests). `element` defines a class that extends `HTMLElement` and needs a browser.

## The module of a component

One ES module per component. When it is imported it

1. registers its custom element - once only, `defineWebComponent` guards against a second import,
2. exports `manifest`, a plain JSON-serializable object.

```js
export const manifest = {
    manifestVersion: 1,
    tag: 'iob-state-tile',                       // name of the custom element: lower case, with a "-"
    name: { en: 'State tile', de: 'Zustandskachel' },
    description: { en: '...', de: '...' },        // optional
    icon: 'iob-state-tile.svg',                  // optional: relative to the module, or a data: URL
    size: { width: 180, height: 110 },           // optional: the size the element looks best in, in px
    settings: {                                   // JSON-Config: a panel, or tabs of panels
        type: 'panel',
        items: {
            oid: { type: 'objectId', label: { en: 'State', de: 'Datenpunkt' } },
            decimals: { type: 'number', label: 'Decimals', min: 0, max: 6, default: 1 },
            toggle: { type: 'checkbox', label: 'Toggle on click', default: true },
            textTrue: { type: 'text', label: 'Text for true', hidden: '!data.toggle' },
        },
    },
};
```

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
| `theme`    | optional: `light` or `dark`, the theme of the host; `light` if the host does not set it     |
| `editMode` | optional: `true` while the user arranges the page in the editor of the host                 |
| `dialogs`  | optional: dialogs in the look of the host, see [Dialogs](#dialogs)                          |

The values are in one object, not in a property each, because many names a setting would have are taken by
`HTMLElement` already: `title`, `lang`, `hidden`, `id`, `style`, ...

The rules for a component:

- It works in any order: `settings` before `socket`, `socket` before `settings`, all of them changing at any time.
  Without a socket it waits for one; it never opens a connection of its own.
- It subscribes while it is in the document and unsubscribes when it leaves. Of the socket it uses only
  `subscribeState`, `unsubscribeState`, `getState`, `setState`, `getObject`, `subscribeObject`,
  `unsubscribeObject`, `getHistory`, `sendTo` and `systemLang` (`WebComponentSocket`). With
  `sendTo(instance, command, data)` it asks its own adapter for what states and objects do not carry.
- A value has the type its setting declares: a number for `number` and `slider`, a boolean for `checkbox`, a
  string otherwise. A setting without a value is missing from the object.
- It fills the box the host gives it (`:host { display: block; width: 100%; height: 100% }`) and never measures
  itself - it scales with container queries (`container-type: size`, `cqmin`).
- It has a transparent background and inherits `color` and `font` from the host, so it follows the theme of the
  host. Shadow DOM keeps its own styles in and the styles of the host out; `theme` is for what CSS cannot carry,
  like the colors of a chart.
- In `editMode` it writes no states, sends no command that changes something, and reacts to no clicks - the
  host needs them to select and move it. Where settings are still missing, it may show sample data.
- It brings everything it needs; a component built with Lit or Svelte bundles its framework, one built with React
  may take React from the host (see [Frameworks in components](#frameworks-in-components)).

The base class takes care of the first two rules:

```js
import { IobWebComponent, defineWebComponent } from '@iobroker/web-components/element';

export const manifest = {
    manifestVersion: 1,
    tag: 'my-value',
    name: 'Value',
    settings: { type: 'panel', items: { oid: { type: 'objectId', label: 'State' } } },
};

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

defineWebComponent(manifest, MyValue);
```

`this.states` and `this.objects` hold what the subscribed IDs have, `this.setState(id, val)` writes through the
socket (not in edit mode), `this.text(...)` translates into `this.systemLang`. The objects of the states are read
once; `getObjectIds(settings)` names objects to keep up to date, like a diagram that is edited elsewhere.
`getStateIds` may read those objects - the states a diagram names - and is asked again whenever one of them arrives
or changes. `this.theme` and `this.editMode` are what the host set, and a change of them draws again as well.

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
  component maps these imports (`REACT_SPECIFIERS`) onto one of the URLs instead of bundling them, and every React
  component of that major on the page uses the same instance:

```js
// vite.config.mjs
import { REACT_19_URL, REACT_SPECIFIERS } from '@iobroker/web-components';

export default {
    build: {
        lib: { entry: 'src/my-tile.jsx', formats: ['es'], fileName: () => 'my-tile.js' },
        rollupOptions: {
            external: REACT_SPECIFIERS,
            output: { paths: Object.fromEntries(REACT_SPECIFIERS.map(name => [name, REACT_19_URL])) },
        },
    },
};
```

A component on React 18 takes `REACT_18_URL` instead. The built module then starts with
`import { createRoot, jsx, jsxs } from "/lib/esm/react-19.js"`; the example below is 3 KB, with the base class
bundled. It renders into its shadow root:

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

defineWebComponent(manifest, MyTile);
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
- The URL is absolute. Behind a reverse proxy that serves ioBroker under a path (`https://example.com/iob/`) it
  misses.

## How a host finds and shows the components

An adapter lists its components in `common.webComponents` of its `io-package.json`, as module URLs relative to
its admin folder. Admin and web both serve that folder as `/adapter/<adapter>/`, so every host loads them from
the same place:

```json
"common": {
    "webComponents": ["webcomponents/my-tile.js"]
}
```

```ts
import { getWebComponentSources, loadWebComponents, getSettingTypes, toSettings } from '@iobroker/web-components';

const instances = Object.values(await socket.getObjectViewSystem('instance', 'system.adapter.', 'system.adapter.香'));
const components = await loadWebComponents(getWebComponentSources(instances, document.baseURI));

// show one
const { manifest } = components[0];
const el = document.createElement(manifest.tag);
el.socket = socket;
el.settings = toSettings(getSettingTypes(manifest), storedValues);
container.appendChild(el);
```

`getWebComponentSources` finds `/adapter/` from the address of the host: next to its folder (`/vis-2/`), at the
root, or - for a host that is an admin tab like `/adapter/devices/tab.html` - next to its own adapter folder. A path
prefix of a reverse proxy stays.

`getDefaultSettings(manifest)` gives the values for a new instance, `getSettingsGroups(manifest)` the panels
to render, `checkManifest(manifest)` what is wrong with one.

## Open points

- Size in a grid (sections of vis-2, cards of devices), and whether a component can ask its host for another size.
- Which other events a host can bind to actions of its own, and whether the manifest lists them.
- Versioning: two adapters bringing the same tag, an older module still cached by the browser.
- The shared React behind a reverse proxy with a path prefix (an import map of the host could point it elsewhere).
- Colors of the host beyond `theme` (primary color, paper), so that the content of a dialog matches the host.

## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**
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
