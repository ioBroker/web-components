// selectSendTo and autocompleteSendTo: the settings whose options the host asks an instance for
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';

import {
    checkManifest,
    fillPattern,
    getSendToRequest,
    getSettingTypes,
    SEND_TO_TYPES,
    toSendToOptions,
    toSettings,
} from '../build/index.js';
import { MANIFEST } from './testManifest.js';

const LOCATION = {
    type: 'selectSendTo',
    label: { en: 'Location', de: 'Ort' },
    command: 'getLocations',
    jsonData: '{ "withHours": ${data.hours}, "lang": "${data.lang}" }',
    instance: '${data.instance}',
    alsoDependsOn: ['region'],
};

describe('fillPattern', () => {
    it('fills ${data.x} and keeps the rest of the text as it is', () => {
        assert.equal(fillPattern('plain', {}), 'plain');
        assert.equal(fillPattern('${data.a}-${data.b}', { a: 1, b: 'x' }), '1-x');
        assert.equal(fillPattern('`\\n${data.a}`', { a: 2 }), '`\\n2`');
    });
});

describe('getSendToRequest', () => {
    const data = { instance: 'openmeteo-notify.1', hours: true, lang: 'de', region: 'north' };

    it('asks the instance of the pattern with the message of jsonData', () => {
        const request = getSendToRequest(LOCATION, data, 'openmeteo-notify');
        assert.deepEqual(
            { ...request, key: undefined },
            {
                instance: 'openmeteo-notify.1',
                command: 'getLocations',
                data: { withHours: true, lang: 'de' },
                key: undefined,
            },
        );
    });

    it('asks <adapter>.0 without instance, sends data as it is or null, and send as command', () => {
        assert.deepEqual(getSendToRequest({ type: 'autocompleteSendTo', data: { a: 1 } }, {}, 'demo'), {
            instance: 'demo.0',
            command: 'send',
            data: { a: 1 },
            key: JSON.stringify(['demo.0', 'send', { a: 1 }, []]),
        });
        assert.equal(getSendToRequest({ type: 'selectSendTo', command: 'x' }, {}, 'demo').data, null);
    });

    it('takes an instance with system.adapter. in front', () => {
        const request = getSendToRequest(LOCATION, { ...data, instance: 'system.adapter.demo.2' }, 'demo');
        assert.equal(request.instance, 'demo.2');
    });

    it('changes its key when the message, the instance or a setting of alsoDependsOn changes - only then', () => {
        const key = getSendToRequest(LOCATION, data, 'x').key;
        assert.equal(getSendToRequest(LOCATION, { ...data, other: 5 }, 'x').key, key);
        assert.notEqual(getSendToRequest(LOCATION, { ...data, lang: 'en' }, 'x').key, key);
        assert.notEqual(getSendToRequest(LOCATION, { ...data, instance: 'demo.0' }, 'x').key, key);
        assert.notEqual(getSendToRequest(LOCATION, { ...data, region: 'south' }, 'x').key, key);
    });

    it('is null for another type, without an instance, and for a pattern or jsonData that fails', () => {
        assert.equal(getSendToRequest({ type: 'select' }, data, 'x'), null);
        assert.equal(getSendToRequest(LOCATION, { ...data, instance: '' }, 'x'), null);
        assert.equal(getSendToRequest(LOCATION, { ...data, instance: undefined }, 'x'), null);
        assert.equal(getSendToRequest({ ...LOCATION, jsonData: '{ no json' }, data, 'x'), null);
        assert.equal(getSendToRequest({ ...LOCATION, instance: '${data.a.b.c}' }, data, 'x'), null);
        assert.deepEqual(SEND_TO_TYPES, ['selectSendTo', 'autocompleteSendTo']);
    });
});

describe('toSendToOptions', () => {
    it('takes [{ value, label }] and plain values, and leaves out the rest', () => {
        assert.deepEqual(
            toSendToOptions([
                { value: 'a', label: 'A' },
                { value: 2, label: { en: 'Two', de: 'Zwei' }, description: 'more' },
                { value: true },
                'plain',
                { label: 'no value' },
                null,
                [1],
            ]),
            [
                { value: 'a', label: 'A' },
                { value: 2, label: { en: 'Two', de: 'Zwei' } },
                { value: true, label: 'true' },
                { value: 'plain', label: 'plain' },
            ],
        );
        for (const answer of [undefined, null, { error: 'offline' }, 'text']) {
            assert.deepEqual(toSendToOptions(answer), []);
        }
    });
});

describe('the sendTo types in the manifest', () => {
    const schema = JSON.parse(readFileSync(new URL('../schemas/manifest.json', import.meta.url), 'utf8'));
    const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);
    const manifest = {
        ...MANIFEST,
        module: 'tile.js',
        settings: {
            type: 'panel',
            items: {
                instance: { type: 'instance', adapter: 'openmeteo-notify' },
                location: LOCATION,
                device: {
                    type: 'autocompleteSendTo',
                    command: 'getDevices',
                    data: { all: true },
                    freeSolo: true,
                    maxLength: 40,
                    options: [{ value: '', label: 'None' }],
                },
            },
        },
    };

    it('are valid, and carry a string as value', () => {
        assert.equal(validate(manifest), true, JSON.stringify(validate.errors));
        assert.equal(checkManifest(manifest), null);
        const types = getSettingTypes(manifest);
        assert.deepEqual(types, { instance: 'instance', location: 'selectSendTo', device: 'autocompleteSendTo' });
        assert.deepEqual(toSettings(types, { location: 7, device: 'lamp' }), { location: '7', device: 'lamp' });
    });

    it('reject attributes of the wrong type', () => {
        const items = manifest.settings.items;
        for (const wrong of [
            { ...items.location, alsoDependsOn: 'region' },
            { ...items.location, jsonData: { a: 1 } },
            { ...items.device, freeSolo: 'yes' },
            { ...items.device, maxLength: 0 },
        ]) {
            const invalid = { ...manifest, settings: { type: 'panel', items: { wrong } } };
            assert.equal(validate(invalid), false, JSON.stringify(wrong));
        }
    });
});
