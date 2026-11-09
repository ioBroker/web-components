// The JSON schema of a manifest file: what a repochecker or an editor sees, the same as checkManifest
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';

import { checkManifest } from '../build/index.js';
import { MANIFEST } from './testManifest.js';

const schema = JSON.parse(readFileSync(new URL('../schemas/manifest.json', import.meta.url), 'utf8'));
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);

const FILE = { $schema: schema.$id, ...MANIFEST, module: 'tile.js', size: { width: 180, height: 110 } };

describe('schemas/manifest.json', () => {
    it('accepts a manifest file', () => {
        assert.equal(validate(FILE), true, JSON.stringify(validate.errors));
        assert.equal(checkManifest(FILE), null);
        const tabs = {
            ...FILE,
            settings: {
                type: 'tabs',
                items: {
                    main: { type: 'panel', label: { en: 'Main', de: 'Haupt' }, items: { a: { type: 'text', sm: 6 } } },
                },
            },
        };
        assert.equal(validate(tabs), true, JSON.stringify(validate.errors));
        const edits = { ...FILE, editsValue: true };
        assert.equal(validate(edits), true, JSON.stringify(validate.errors));
        assert.equal(checkManifest(edits), null);
    });

    it('rejects what checkManifest rejects', () => {
        for (const wrong of [
            { ...FILE, manifestVersion: 2 },
            { ...FILE, tag: 'tile' },
            { ...FILE, name: '' },
            { ...FILE, module: '' },
            { ...FILE, size: { width: 0, height: 10 } },
            { ...FILE, size: { width: 10, height: 10, noResize: 'yes' } },
            { ...FILE, editsValue: 'yes' },
            { ...FILE, settings: { type: 'table', items: {} } },
        ]) {
            assert.equal(validate(wrong), false, JSON.stringify(wrong));
            assert.notEqual(checkManifest(wrong), null, JSON.stringify(wrong));
        }
    });

    it('demands the module in a file, and fields every host can show', () => {
        const { module: _module, ...withoutModule } = FILE;
        assert.equal(validate(withoutModule), false);
        assert.equal(validate({ ...FILE, settings: { type: 'panel', items: { a: { type: 'table' } } } }), false);
        assert.equal(validate({ ...FILE, name: { de: 'Nur deutsch' } }), false);
        assert.equal(validate({ ...FILE, colour: 'red' }), false);
    });
});
