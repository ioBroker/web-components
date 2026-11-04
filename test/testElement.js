// The base class and the loader need a DOM: happy-dom, registered only for these tests
import assert from 'node:assert/strict';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

import { importWebComponent, loadWebComponent, loadWebComponents } from '../build/index.js';

/** Let the microtasks and the answers of the fake socket run */
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

/** A socket that keeps what was asked of it */
function fakeSocket(systemLang = 'de') {
    const handlers = {};
    const objectHandlers = {};
    const values = { 'a.0.x': { val: 1, ack: true }, 'a.0.y': { val: true, ack: true } };
    const calls = [];
    return {
        systemLang,
        calls,
        handlers,
        subscribeObject(ids, cb) {
            ids = [].concat(ids);
            calls.push(['subscribeObject', ...ids]);
            ids.forEach(id => (objectHandlers[id] ||= new Set()).add(cb));
            return Promise.resolve();
        },
        unsubscribeObject(ids, cb) {
            ids = [].concat(ids);
            calls.push(['unsubscribeObject', ...ids]);
            ids.forEach(id => objectHandlers[id]?.delete(cb));
            return Promise.resolve();
        },
        emitObject(id, obj) {
            objectHandlers[id]?.forEach(cb => cb(id, obj));
        },
        subscribedObjects() {
            return Object.keys(objectHandlers).filter(id => objectHandlers[id].size);
        },
        subscribeState(ids, cb) {
            ids = [].concat(ids);
            calls.push(['subscribe', ...ids]);
            ids.forEach(id => (handlers[id] ||= new Set()).add(cb));
            // like socket-client: the current values follow the subscription
            setTimeout(() => ids.forEach(id => cb(id, values[id] || null)), 0);
            return Promise.resolve();
        },
        unsubscribeState(ids, cb) {
            ids = [].concat(ids);
            calls.push(['unsubscribe', ...ids]);
            ids.forEach(id => handlers[id]?.delete(cb));
        },
        getState: id => Promise.resolve(values[id] || null),
        getObject: id => Promise.resolve({ _id: id, common: { name: { en: `Name ${id}`, de: `Name von ${id}` } } }),
        setState(id, val) {
            calls.push(['setState', id, val]);
            values[id] = { val, ack: false };
            handlers[id]?.forEach(cb => cb(id, values[id]));
            return Promise.resolve();
        },
        emit(id, state) {
            handlers[id]?.forEach(cb => cb(id, state));
        },
        subscribed() {
            return Object.keys(handlers).filter(id => handlers[id].size);
        },
    };
}

describe('IobWebComponent', () => {
    let TestTile;
    let TestDiagram;
    let defineWebComponent;

    before(async () => {
        GlobalRegistrator.register();
        // the class extends HTMLElement, so the module can only be loaded now
        const element = await import('../build/element.js');
        defineWebComponent = element.defineWebComponent;

        TestTile = class extends element.IobWebComponent {
            renders = 0;

            getStateIds(settings) {
                return [settings.oid, settings.oid2];
            }

            render() {
                this.renders++;
                const oid = this.settings.oid;
                this.textContent = `${this.text(this.objects[oid]?.common.name)}=${this.states[oid]?.val ?? '-'}`;
            }

            toggle() {
                return this.setState(this.settings.oid, !this.states[this.settings.oid]?.val);
            }

            notify(detail) {
                return this.emit('test-tile-click', detail);
            }
        };
        defineWebComponent({ tag: 'test-tile' }, TestTile);

        // shows an object that is edited elsewhere, and the name of a state
        TestDiagram = class extends element.IobWebComponent {
            getStateIds(settings) {
                return [settings.oid];
            }

            getObjectIds(settings) {
                return [settings.diagram];
            }

            render() {
                const { diagram, oid } = this.settings;
                this.textContent = `${this.objects[diagram]?.native?.nodes ?? '-'}|${this.text(this.objects[oid]?.common.name)}`;
            }
        };
        defineWebComponent({ tag: 'test-diagram' }, TestDiagram);
    });

    after(async () => {
        document.body.innerHTML = '';
        await GlobalRegistrator.unregister();
    });

    function create() {
        const el = document.createElement('test-tile');
        document.body.appendChild(el);
        return el;
    }

    it('works with the settings before the socket', async () => {
        const socket = fakeSocket();
        const el = create();
        el.settings = { oid: 'a.0.x' };
        await tick();
        assert.deepEqual(socket.calls, []);
        el.socket = socket;
        await tick();
        await tick();
        assert.deepEqual(socket.subscribed(), ['a.0.x']);
        assert.equal(el.textContent, 'Name von a.0.x=1');
        el.remove();
    });

    it('subscribes only while the element is in the document', async () => {
        const socket = fakeSocket();
        const el = document.createElement('test-tile');
        el.socket = socket;
        el.settings = { oid: 'a.0.x' };
        await tick();
        assert.deepEqual(socket.calls, []);
        document.body.appendChild(el);
        await tick();
        assert.deepEqual(socket.subscribed(), ['a.0.x']);
        el.remove();
        assert.deepEqual(socket.subscribed(), []);
        document.body.appendChild(el);
        assert.deepEqual(socket.subscribed(), ['a.0.x']);
        el.remove();
    });

    it('follows a change of the settings', async () => {
        const socket = fakeSocket();
        const el = create();
        el.socket = socket;
        el.settings = { oid: 'a.0.x', oid2: 'a.0.y' };
        await tick();
        el.settings = { oid: 'a.0.y' };
        await tick();
        assert.deepEqual(socket.calls, [
            ['subscribe', 'a.0.x', 'a.0.y'],
            ['unsubscribe', 'a.0.x'],
        ]);
        assert.deepEqual(socket.subscribed(), ['a.0.y']);
        // the same settings in a new object subscribe nothing again
        el.settings = { oid: 'a.0.y' };
        el.settings = { oid: '', oid2: null };
        await tick();
        assert.deepEqual(socket.subscribed(), []);
        el.remove();
    });

    it('moves the subscriptions to a new socket', async () => {
        const first = fakeSocket();
        const second = fakeSocket('en');
        const el = create();
        el.settings = { oid: 'a.0.x' };
        el.socket = first;
        await tick();
        el.socket = second;
        await tick();
        await tick();
        assert.deepEqual(first.subscribed(), []);
        assert.deepEqual(second.subscribed(), ['a.0.x']);
        assert.equal(el.textContent, 'Name a.0.x=1');
        el.socket = null;
        assert.deepEqual(second.subscribed(), []);
        el.remove();
    });

    it('draws once for several changes in one task', async () => {
        const socket = fakeSocket();
        const el = create();
        await tick();
        const before = el.renders;
        el.socket = socket;
        el.settings = { oid: 'a.0.x' };
        el.settings = { oid: 'a.0.x' };
        await Promise.resolve();
        assert.equal(el.renders, before + 1);
        el.remove();
    });

    it('draws a new value and ignores the states it does not show', async () => {
        const socket = fakeSocket();
        const el = create();
        el.socket = socket;
        el.settings = { oid: 'a.0.x' };
        await tick();
        await tick();
        socket.emit('a.0.x', { val: 42, ack: true });
        await tick();
        assert.equal(el.textContent, 'Name von a.0.x=42');
        const renders = el.renders;
        socket.emit('a.0.other', { val: 1 });
        await tick();
        assert.equal(el.renders, renders);
        el.remove();
    });

    it('writes a state through the socket', async () => {
        const socket = fakeSocket();
        const el = create();
        el.socket = socket;
        el.settings = { oid: 'a.0.y' };
        await tick();
        await el.toggle();
        await tick();
        assert.deepEqual(socket.calls.at(-1), ['setState', 'a.0.y', false]);
        assert.equal(el.textContent, 'Name von a.0.y=false');
        el.remove();
    });

    it('keeps the objects of getObjectIds up to date', async () => {
        const socket = fakeSocket();
        socket.getObject = id => Promise.resolve({ _id: id, common: { name: `Name ${id}` }, native: { nodes: 3 } });
        const el = document.createElement('test-diagram');
        document.body.appendChild(el);
        el.socket = socket;
        el.settings = { diagram: 'flow.0.diagrams.pv' };
        await tick();
        assert.deepEqual(socket.subscribedObjects(), ['flow.0.diagrams.pv']);
        // a subscription delivers no object: it is read once
        assert.equal(el.textContent, '3|');

        socket.emitObject('flow.0.diagrams.pv', { _id: 'flow.0.diagrams.pv', common: {}, native: { nodes: 5 } });
        await tick();
        assert.equal(el.textContent, '5|');
        // an object it does not show changes nothing
        socket.emitObject('flow.0.diagrams.other', { native: { nodes: 9 } });
        await tick();
        assert.equal(el.textContent, '5|');

        el.settings = { diagram: 'flow.0.diagrams.other' };
        await tick();
        assert.deepEqual(socket.subscribedObjects(), ['flow.0.diagrams.other']);
        el.remove();
        assert.deepEqual(socket.subscribedObjects(), []);
    });

    it('asks for the states again when an object of getObjectIds arrives or changes', async () => {
        // the states are named in the diagram, as in a flow diagram
        const Nodes = class extends customElements.get('test-diagram') {
            getStateIds(settings) {
                return this.objects[settings.diagram]?.native?.states || [];
            }
        };
        defineWebComponent({ tag: 'test-diagram-nodes' }, Nodes);
        const socket = fakeSocket();
        socket.getObject = id => Promise.resolve({ _id: id, common: {}, native: { nodes: 1, states: ['a.0.x'] } });
        const el = document.createElement('test-diagram-nodes');
        document.body.appendChild(el);
        el.socket = socket;
        el.settings = { diagram: 'flow.0.diagrams.pv' };
        await tick();
        await tick();
        assert.deepEqual(socket.subscribed(), ['a.0.x']);

        socket.emitObject('flow.0.diagrams.pv', { common: {}, native: { nodes: 2, states: ['a.0.y'] } });
        await tick();
        assert.deepEqual(socket.subscribed(), ['a.0.y']);
        assert.deepEqual(socket.subscribedObjects(), ['flow.0.diagrams.pv']);

        // deleted: nothing left to show
        socket.emitObject('flow.0.diagrams.pv', null);
        await tick();
        assert.deepEqual(socket.subscribed(), []);
        assert.deepEqual(socket.subscribedObjects(), ['flow.0.diagrams.pv']);
        el.remove();
        assert.deepEqual(socket.subscribedObjects(), []);
    });

    it('reads the object of a state once, but subscribes it when getObjectIds names it too', async () => {
        const socket = fakeSocket();
        const el = document.createElement('test-diagram');
        document.body.appendChild(el);
        el.socket = socket;
        el.settings = { oid: 'a.0.x' };
        await tick();
        await tick();
        assert.deepEqual(socket.subscribedObjects(), []);
        assert.equal(el.textContent, '-|Name von a.0.x');

        el.settings = { oid: 'a.0.x', diagram: 'a.0.x' };
        await tick();
        assert.deepEqual(socket.subscribedObjects(), ['a.0.x']);
        socket.emitObject('a.0.x', { common: { name: 'Neu' }, native: { nodes: 1 } });
        await tick();
        assert.equal(el.textContent, '1|Neu');

        // no longer subscribed, still a state: the object stays as it was last
        el.settings = { oid: 'a.0.x' };
        await tick();
        assert.deepEqual(socket.subscribedObjects(), []);
        assert.deepEqual(socket.subscribed(), ['a.0.x']);
        assert.equal(el.textContent, '-|Neu');
        el.remove();
    });

    it('takes theme and edit mode from the host and draws again', async () => {
        const el = create();
        await tick();
        assert.equal(el.theme, 'light');
        assert.equal(el.editMode, false);
        const renders = el.renders;
        el.theme = 'dark';
        el.editMode = true;
        await tick();
        assert.equal(el.renders, renders + 1);
        // the same values once more draw nothing
        el.theme = 'dark';
        el.editMode = true;
        await tick();
        assert.equal(el.renders, renders + 1);
        el.theme = 'blue';
        assert.equal(el.theme, 'light');
        el.remove();
    });

    it('writes no state in edit mode', async () => {
        const socket = fakeSocket();
        const el = create();
        el.socket = socket;
        el.settings = { oid: 'a.0.y' };
        el.editMode = true;
        await tick();
        await el.toggle();
        assert.equal(
            socket.calls.some(call => call[0] === 'setState'),
            false,
        );
        el.editMode = false;
        await el.toggle();
        assert.deepEqual(socket.calls.at(-1), ['setState', 'a.0.y', false]);
        el.remove();
    });

    it('tells the host with an event it can cancel', () => {
        const el = create();
        const got = [];
        const listener = e => {
            got.push([e.type, e.detail, e.bubbles, e.composed]);
            if (e.detail.node === 'pv') {
                e.preventDefault();
            }
        };
        document.body.addEventListener('test-tile-click', listener);
        assert.equal(el.notify({ node: 'battery' }), true);
        assert.equal(el.notify({ node: 'pv' }), false);
        assert.deepEqual(got, [
            ['test-tile-click', { node: 'battery' }, true, true],
            ['test-tile-click', { node: 'pv' }, true, true],
        ]);
        document.body.removeEventListener('test-tile-click', listener);
        el.remove();
    });

    it('takes over what the host set before the module defined the element', async () => {
        const socket = fakeSocket();
        const el = document.createElement('test-early');
        // a host that does not wait for the module
        el.socket = socket;
        el.settings = { oid: 'a.0.x' };
        el.theme = 'dark';
        document.body.appendChild(el);
        const element = await import('../build/element.js');
        defineWebComponent(
            'test-early',
            class extends element.IobWebComponent {
                getStateIds(settings) {
                    return [settings.oid];
                }

                render() {
                    this.textContent = `${this.theme}:${this.states[this.settings.oid]?.val ?? '-'}`;
                }
            },
        );
        await tick();
        await tick();
        assert.equal(Object.prototype.hasOwnProperty.call(el, 'settings'), false);
        assert.deepEqual(socket.subscribed(), ['a.0.x']);
        assert.equal(el.textContent, 'dark:1');
        el.remove();
    });

    it('defines a tag only once', () => {
        assert.doesNotThrow(() => defineWebComponent({ tag: 'test-tile' }, class extends HTMLElement {}));
        assert.equal(customElements.get('test-tile'), TestTile);
    });

    describe('loadWebComponent', () => {
        const source = { url: 'http://host/a.js', adapter: 'demo', version: '1.0.0' };
        const log = () => {
            const messages = [];
            return { messages, error: m => messages.push(m), warn: m => messages.push(m) };
        };

        it('loads a module that exports a manifest and defines its element', async () => {
            const manifest = {
                manifestVersion: 1,
                tag: 'test-tile',
                name: 'Tile',
                settings: { type: 'panel', items: {} },
            };
            const loaded = await loadWebComponent(source, { importer: async () => ({ manifest }) });
            assert.deepEqual(loaded, { ...source, manifest, moduleUrl: source.url });
        });

        it('reads a manifest file and imports nothing', async () => {
            const manifest = {
                manifestVersion: 1,
                tag: 'test-lazy',
                name: 'Lazy',
                module: 'lazy/test-lazy.js',
                settings: { type: 'panel', items: {} },
            };
            const read = [];
            const imported = [];
            const json = {
                url: 'http://host/adapter/demo/webcomponents/test-lazy.json',
                adapter: 'demo',
                version: '1',
            };
            const loaded = await loadWebComponent(json, {
                readManifest: async url => {
                    read.push(url);
                    return manifest;
                },
                importer: async url => {
                    imported.push(url);
                    return {};
                },
            });
            assert.deepEqual(read, [json.url]);
            assert.deepEqual(imported, []);
            assert.equal(loaded.moduleUrl, 'http://host/adapter/demo/webcomponents/lazy/test-lazy.js');
            assert.equal(customElements.get('test-lazy'), undefined);
        });

        it('says why it ignores a manifest file', async () => {
            const messages = log();
            const json = { url: 'http://host/a.json', adapter: 'demo', version: '1' };
            const settings = { type: 'panel', items: {} };
            const read = content => ({ readManifest: async () => content, log: messages });
            assert.equal(
                await loadWebComponent(json, read({ manifestVersion: 1, tag: 'a-b', name: 'x', settings })),
                null,
            );
            assert.equal(await loadWebComponent(json, read([])), null);
            assert.equal(
                await loadWebComponent(json, {
                    readManifest: async () => {
                        throw new Error('HTTP 404');
                    },
                    log: messages,
                }),
                null,
            );
            assert.match(messages.messages[0], /module is missing/);
            assert.match(messages.messages[1], /no manifest/);
            assert.match(messages.messages[2], /HTTP 404/);
        });

        it('imports the module of a component once, when the host shows it', async () => {
            const component = {
                url: 'http://host/b.json',
                adapter: 'demo',
                version: '1',
                moduleUrl: 'http://host/once.js',
                manifest: {
                    manifestVersion: 1,
                    tag: 'test-once',
                    name: 'Once',
                    settings: { type: 'panel', items: {} },
                },
            };
            let imports = 0;
            const importer = async () => {
                imports++;
                customElements.define('test-once', class extends HTMLElement {});
                return {};
            };
            await Promise.all([
                importWebComponent(component, { importer }),
                importWebComponent(component, { importer }),
            ]);
            await importWebComponent(component, { importer });
            assert.equal(imports, 1);
            assert.ok(customElements.get('test-once'));
        });

        it('rejects a module that does not define its tag, and tries it again later', async () => {
            const component = {
                url: 'http://host/c.json',
                adapter: 'demo',
                version: '1',
                moduleUrl: 'http://host/later.js',
                manifest: {
                    manifestVersion: 1,
                    tag: 'test-later',
                    name: 'Later',
                    settings: { type: 'panel', items: {} },
                },
            };
            await assert.rejects(
                importWebComponent(component, { importer: async () => ({}) }),
                /does not define <test-later>/,
            );
            await importWebComponent(component, {
                importer: async () => {
                    customElements.define('test-later', class extends HTMLElement {});
                    return {};
                },
            });
            assert.ok(customElements.get('test-later'));
        });

        it('says why it ignores a module', async () => {
            const messages = log();
            const settings = { type: 'panel', items: {} };
            assert.equal(await loadWebComponent(source, { importer: async () => ({}), log: messages }), null);
            assert.equal(
                await loadWebComponent(source, {
                    importer: async () => ({
                        manifest: { manifestVersion: 1, tag: 'no-such-tile', name: 'x', settings },
                    }),
                    log: messages,
                }),
                null,
            );
            assert.equal(
                await loadWebComponent(source, {
                    importer: async () => {
                        throw new Error('404');
                    },
                    log: messages,
                }),
                null,
            );
            assert.equal(messages.messages.length, 3);
            assert.match(messages.messages[0], /no manifest/);
            assert.match(messages.messages[1], /does not define <no-such-tile>/);
            assert.match(messages.messages[2], /404/);
        });

        it('takes a tag that two modules bring from the first one', async () => {
            const messages = log();
            const manifest = {
                manifestVersion: 1,
                tag: 'test-tile',
                name: 'Tile',
                settings: { type: 'panel', items: {} },
            };
            const loaded = await loadWebComponents([source, { ...source, url: 'http://host/b.js' }], {
                importer: async () => ({ manifest }),
                log: messages,
            });
            assert.deepEqual(
                loaded.map(component => component.url),
                ['http://host/a.js'],
            );
            assert.match(messages.messages[0], /already loaded/);
        });
    });
});
