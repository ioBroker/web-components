# @iobroker/web-components

Custom elements that every ioBroker UI can show alike: vis-2, devices, aura, admin. A component describes its
own settings, the host renders that description as its own settings UI and hands the component two things - a
connection to ioBroker and the values of the settings.

This package is the contract between the two sides, plus what both would otherwise write themselves:

| Entry                                | For               | What                                                          |
|--------------------------------------|-------------------|---------------------------------------------------------------|
| `@iobroker/web-components`           | hosts             | types, checking a manifest, settings values, finding, loading |
| `@iobroker/web-components/element`   | component authors | base class `IobWebComponent`, `defineWebComponent`            |

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
    size: { width: 180, height: 110 },           // optional: the size the element looks best in
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

`settings` is [JSON-Config](https://github.com/ioBroker/ioBroker.admin/blob/master/packages/jsonConfig/README.md),
so admin and devices (`@iobroker/json-config`) render it unchanged. A component may only use the types every
host can show:

`text` (`minRows`), `password`, `number` and `slider` (`min`, `max`, `step`), `checkbox`, `color`, `select`
(`options: [{ value, label }]`), `objectId`, `instance` (`adapter`), and the decorations without a value
`header`, `staticText` (`text`) and `divider`.

Every text (`name`, `label`, `help`, `text`, the labels of options) is a string or `{ en, de, ... }`. `hidden`
and `disabled` are JS expressions over `data`, the values of all settings.

## The element

The host sets two **properties**, not attributes:

| Property   | What                                                                                        |
|------------|---------------------------------------------------------------------------------------------|
| `socket`   | `Connection` of `@iobroker/socket-client` - every host already has one                      |
| `settings` | the values of the settings, keyed by the names in `items`; a **new object** on every change |

The values are in one object, not in a property each, because many names a setting would have are taken by
`HTMLElement` already: `title`, `lang`, `hidden`, `id`, `style`, ...

The rules for a component:

- It works in any order: `settings` before `socket`, `socket` before `settings`, both changing at any time.
- It subscribes while it is in the document and unsubscribes when it leaves. Of the socket it uses only
  `subscribeState`, `unsubscribeState`, `getState`, `setState`, `getObject` and `systemLang`
  (`WebComponentSocket`).
- A value has the type its setting declares: a number for `number` and `slider`, a boolean for `checkbox`, a
  string otherwise. A setting without a value is missing from the object.
- It fills the box the host gives it (`:host { display: block; width: 100%; height: 100% }`) and never measures
  itself - it scales with container queries (`container-type: size`, `cqmin`).
- It inherits `color` and `font` from the host, so it follows the theme of the host. Shadow DOM keeps its own
  styles in and the styles of the host out.
- It brings everything it needs; a component built with React, Lit or Svelte bundles its framework.

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
socket, `this.text(...)` translates into `this.systemLang`.

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

`getDefaultSettings(manifest)` gives the values for a new instance, `getSettingsGroups(manifest)` the panels
to render, `checkManifest(manifest)` what is wrong with one.

## Open points

- Size in a grid (sections of vis-2, cards of devices), and whether a component can ask its host for another size.
- Optional host properties: theme beyond inherited CSS, edit mode.
- Events from the component to the host ("open my dialog", "navigate").
- Versioning: two adapters bringing the same tag, an older module still cached by the browser.

## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**
- (@GermanBluefox) Initial release: the contract, helpers for hosts and the base class `IobWebComponent`

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
