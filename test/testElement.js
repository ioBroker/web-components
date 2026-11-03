// The base class and the loader need a DOM: happy-dom, registered only for these tests
import assert from 'node:assert/strict';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

import { loadWebComponent, loadWebComponents } from '../build/index.js';

/** Let the microtasks and the answers of the fake socket run */
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

/** A socket that keeps what was asked of it */
function fakeSocket(systemLang = 'de') {
    const handlers = {};
    const values = { 'a.0.x': { val: 1, ack: true }, 'a.0.y': { val: true, ack: true } };
    const calls = [];
    return {
        systemLang,
        calls,
        handlers,
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
        };
        defineWebComponent({ tag: 'test-tile' }, TestTile);
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
            assert.deepEqual(loaded, { ...source, manifest });
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
