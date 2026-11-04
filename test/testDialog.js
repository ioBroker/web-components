// Dialogs: the <dialog> of the browser as fallback, and the dialogs of a host through the base class
import assert from 'node:assert/strict';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

import { DIALOG_CLOSE_EVENT, isFormDialog } from '../build/index.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

const FORM = {
    type: 'panel',
    items: {
        _head: { type: 'header', text: { en: 'Limits', de: 'Grenzen' } },
        name: { type: 'text', label: 'Name' },
        count: { type: 'number', label: 'Count', min: 0, max: 10, default: 3 },
        on: { type: 'checkbox', label: 'On' },
        mode: {
            type: 'select',
            label: 'Mode',
            options: [
                { value: 'a', label: 'A' },
                { value: 'b', label: 'B' },
            ],
        },
        extra: { type: 'text', label: 'Extra', hidden: '!data.on' },
    },
};

describe('Dialogs', () => {
    let openNativeDialog;
    let TestDialogs;

    before(async () => {
        GlobalRegistrator.register();
        const element = await import('../build/element.js');
        openNativeDialog = element.openNativeDialog;

        TestDialogs = class extends element.IobWebComponent {
            render() {}

            ask(request) {
                return this.openDialog(request);
            }
        };
        element.defineWebComponent({ tag: 'test-dialogs' }, TestDialogs);
    });

    after(async () => {
        document.body.innerHTML = '';
        await GlobalRegistrator.unregister();
    });

    /** The open native dialog and its parts */
    function shown() {
        const holder = document.querySelector('[data-iob-dialog]');
        if (!holder) {
            return null;
        }
        const root = holder.shadowRoot;
        const field = name =>
            [...root.querySelectorAll('label')]
                .find(label => label.querySelector('span')?.textContent.startsWith(name))
                ?.querySelector('input, select, textarea');
        const label = name =>
            [...root.querySelectorAll('label')].find(l => l.querySelector('span')?.textContent.startsWith(name));
        const button = text => [...root.querySelectorAll('button')].find(b => b.textContent === text);
        return { holder, root, dialog: root.querySelector('dialog'), field, label, button };
    }

    it('tells a form from an element', () => {
        assert.equal(isFormDialog({ form: FORM }), true);
        assert.equal(isFormDialog({ element: {} }), false);
    });

    it('shows a form with the browser dialog and gives the values typed', async () => {
        const result = openNativeDialog(
            { title: { en: 'Edit', de: 'Bearbeiten' }, form: FORM, data: { name: 'Pump' } },
            { lang: 'de', theme: 'dark' },
        );
        const d = shown();
        assert.equal(d.dialog.open, true);
        assert.equal(d.dialog.className, 'dark');
        assert.equal(d.root.querySelector('header span').textContent, 'Bearbeiten');
        assert.equal(d.root.querySelector('h3').textContent, 'Grenzen');
        assert.equal(d.field('Name').value, 'Pump');
        // the default where data has no value
        assert.equal(d.field('Count').value, '3');
        assert.equal(d.button('Abbrechen') !== undefined, true);

        // hidden follows the values
        assert.equal(d.label('Extra').hidden, true);
        d.field('On').checked = true;
        d.field('On').dispatchEvent(new Event('change', { bubbles: true }));
        assert.equal(d.label('Extra').hidden, false);

        d.field('Name').value = 'Pool';
        d.field('Count').value = '7';
        d.field('Mode').selectedIndex = 1;
        d.field('Extra').value = 'x';
        d.button('OK').click();
        assert.deepEqual(await result, { name: 'Pool', count: 7, on: true, mode: 'b', extra: 'x' });
        assert.equal(shown(), null);
    });

    it('gives null when the form is cancelled or closed', async () => {
        let result = openNativeDialog({ form: FORM });
        shown().button('Cancel').click();
        assert.equal(await result, null);
        assert.equal(shown(), null);

        result = openNativeDialog({ form: FORM });
        shown().root.querySelector('button.close').click();
        assert.equal(await result, null);
        assert.equal(shown(), null);
    });

    it('frames an element of the component and takes its result', async () => {
        const content = document.createElement('div');
        content.textContent = 'Battery 80 %';
        const result = openNativeDialog({ title: 'Battery', element: content, width: 600 });
        const d = shown();
        assert.equal(d.dialog.style.width, '600px');
        assert.equal(d.root.querySelector('.body').firstChild, content);
        assert.equal(d.root.querySelector('footer'), null);

        content.dispatchEvent(
            new CustomEvent(DIALOG_CLOSE_EVENT, { detail: { node: 'battery' }, bubbles: true, composed: true }),
        );
        assert.deepEqual(await result, { node: 'battery' });
        assert.equal(shown(), null);
    });

    it('takes the dialogs of the host when it offers them, and the types of the form', async () => {
        const el = document.createElement('test-dialogs');
        document.body.appendChild(el);
        const asked = [];
        el.dialogs = {
            open(request) {
                asked.push(request);
                // a host that keeps everything as text
                return Promise.resolve({ count: '7', on: 'true', unknown: 1 });
            },
        };
        const values = await el.ask({ form: FORM });
        assert.equal(asked.length, 1);
        assert.equal(shown(), null);
        assert.deepEqual(values, { count: 7, on: true });

        el.dialogs.open = () => Promise.resolve(undefined);
        assert.equal(await el.ask({ element: document.createElement('div') }), null);
        el.remove();
    });

    it('takes the browser dialog without dialogs of the host, and none in edit mode', async () => {
        const el = document.createElement('test-dialogs');
        document.body.appendChild(el);
        el.editMode = true;
        assert.equal(await el.ask({ form: FORM }), null);
        assert.equal(shown(), null);

        el.editMode = false;
        const result = el.ask({ form: FORM });
        await tick();
        shown().button('OK').click();
        assert.deepEqual(await result, { count: 3, on: false, mode: 'a', name: '', extra: '' });
        el.remove();
    });
});
