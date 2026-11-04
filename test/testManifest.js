// The main entry is imported before any test registers a DOM: it must load in plain Node
import assert from 'node:assert/strict';

import {
    checkManifest,
    getDefaultSettings,
    getSettingsGroups,
    getSettingTypes,
    getText,
    getWebComponentFiles,
    getWebComponentSources,
    isManifestFile,
    readWebComponentManifests,
    resolveManifestUrl,
    toSettings,
    toSettingValue,
} from '../build/index.js';

export const MANIFEST = {
    manifestVersion: 1,
    tag: 'iob-test-tile',
    name: { en: 'Test tile', de: 'Testkachel' },
    icon: 'tile.svg',
    settings: {
        type: 'panel',
        items: {
            _header: { type: 'header', text: { en: 'State', de: 'Datenpunkt' } },
            oid: { type: 'objectId', label: 'State' },
            decimals: { type: 'number', min: 0, max: 6, default: 1 },
            _line: { type: 'divider' },
            variant: {
                type: 'select',
                options: [
                    { value: 'tile', label: 'Tile' },
                    { value: 'compact', label: 'One row' },
                ],
                default: 'tile',
            },
            toggle: { type: 'checkbox', default: true },
            textTrue: { type: 'text', hidden: '!data.toggle' },
        },
    },
};

describe('checkManifest', () => {
    it('accepts a valid manifest', () => {
        assert.equal(checkManifest(MANIFEST), null);
    });

    it('names what is wrong', () => {
        assert.match(checkManifest(undefined), /no manifest/);
        assert.match(checkManifest({ ...MANIFEST, manifestVersion: 2 }), /manifestVersion/);
        assert.match(checkManifest({ ...MANIFEST, tag: 'tile' }), /custom element/);
        assert.match(checkManifest({ ...MANIFEST, tag: 'Iob-Tile' }), /custom element/);
        assert.match(checkManifest({ ...MANIFEST, name: '' }), /name/);
        assert.match(checkManifest({ ...MANIFEST, settings: { type: 'table' } }), /JSON-Config/);
        assert.match(checkManifest({ ...MANIFEST, settings: { type: 'panel' } }), /no items/);
        assert.match(checkManifest([]), /no manifest/);
        assert.match(checkManifest({ ...MANIFEST, module: '' }), /module/);
        assert.match(checkManifest({ ...MANIFEST, module: 42 }), /module/);
    });

    it('accepts the module of a manifest file and the schema of an editor', () => {
        assert.equal(
            checkManifest({
                $schema: 'https://raw.githubusercontent.com/ioBroker/web-components/main/schemas/manifest.json',
                ...MANIFEST,
                module: 'tile.js',
            }),
            null,
        );
    });

    it('checks the size', () => {
        assert.equal(checkManifest({ ...MANIFEST, size: { width: 400, height: 300 } }), null);
        assert.equal(checkManifest({ ...MANIFEST, size: { width: 400, height: 300, noResize: true } }), null);
        assert.match(checkManifest({ ...MANIFEST, size: { width: 400 } }), /width and a height/);
        assert.match(checkManifest({ ...MANIFEST, size: { width: '400px', height: 300 } }), /width and a height/);
        assert.match(checkManifest({ ...MANIFEST, size: { width: 0, height: 300 } }), /width and a height/);
        assert.match(checkManifest({ ...MANIFEST, size: null }), /width and a height/);
        assert.match(checkManifest({ ...MANIFEST, size: { width: 400, height: 300, noResize: 'yes' } }), /noResize/);
    });
});

describe('getSettingsGroups', () => {
    it('makes one group of a panel', () => {
        const groups = getSettingsGroups(MANIFEST);
        assert.deepEqual(
            groups.map(group => group.name),
            ['common'],
        );
    });

    it('makes a group of each tab', () => {
        const groups = getSettingsGroups({
            ...MANIFEST,
            settings: {
                type: 'tabs',
                items: {
                    main: { type: 'panel', label: 'Main', items: { a: { type: 'text' } } },
                    look: { type: 'panel', items: { b: { type: 'color' } } },
                },
            },
        });
        assert.deepEqual(
            groups.map(group => [group.name, group.label]),
            [
                ['main', 'Main'],
                ['look', undefined],
            ],
        );
    });
});

describe('getText', () => {
    it('takes the language, then English, then any', () => {
        assert.equal(getText({ en: 'On', de: 'An' }, 'de'), 'An');
        assert.equal(getText({ en: 'On', de: 'An' }, 'fr'), 'On');
        assert.equal(getText({ de: 'An' }, 'fr'), 'An');
        assert.equal(getText('On', 'de'), 'On');
        assert.equal(getText(undefined, 'de'), '');
    });
});

describe('resolveManifestUrl', () => {
    it('resolves against the module', () => {
        assert.equal(
            resolveManifestUrl('tile.svg', 'http://host:8082/adapter/demo/wc/tile.js'),
            'http://host:8082/adapter/demo/wc/tile.svg',
        );
        assert.equal(resolveManifestUrl('data:image/svg+xml,x', 'http://host/a.js'), 'data:image/svg+xml,x');
        assert.equal(resolveManifestUrl(undefined, 'http://host/a.js'), undefined);
    });
});

describe('getSettingTypes / getDefaultSettings', () => {
    it('lists the settings that carry a value, without headers and dividers', () => {
        assert.deepEqual(getSettingTypes(MANIFEST), {
            oid: 'objectId',
            decimals: 'number',
            variant: 'select',
            toggle: 'checkbox',
            textTrue: 'text',
        });
    });

    it('collects the defaults', () => {
        assert.deepEqual(getDefaultSettings(MANIFEST), { decimals: 1, variant: 'tile', toggle: true });
    });
});

describe('toSettingValue / toSettings', () => {
    it('gives every setting the type its manifest declares', () => {
        assert.equal(toSettingValue('number', '2'), 2);
        assert.equal(toSettingValue('number', '2,5'), 2.5);
        assert.equal(toSettingValue('number', ' '), undefined);
        assert.equal(toSettingValue('number', '2abc'), undefined);
        assert.equal(toSettingValue('number', Number.NaN), undefined);
        assert.equal(toSettingValue('slider', 7), 7);
        assert.equal(toSettingValue('checkbox', 'true'), true);
        assert.equal(toSettingValue('checkbox', 'false'), false);
        assert.equal(toSettingValue('checkbox', 0), false);
        assert.equal(toSettingValue('text', 5), '5');
        assert.equal(toSettingValue('select', true), 'true');
        assert.equal(toSettingValue('text', null), undefined);
    });

    it('takes only the settings of the manifest and leaves out the empty ones', () => {
        assert.deepEqual(
            toSettings(getSettingTypes(MANIFEST), { oid: 'a.0.b', decimals: '', toggle: 'true', other: 1 }),
            { oid: 'a.0.b', toggle: true },
        );
    });
});

describe('getWebComponentSources', () => {
    const instance = (id, webComponents) => ({ _id: id, common: { version: '1.2.3', webComponents } });

    it('resolves the modules against the admin folder of the adapter', () => {
        assert.deepEqual(
            getWebComponentSources(
                [
                    instance('system.adapter.demo.0', ['webcomponents/tile.js', 'https://cdn.example/x.js']),
                    instance('system.adapter.other.0'),
                    instance('system.adapter.broken.0', 'tile.js'),
                ],
                'http://host:8082/vis-2/index.html',
            ),
            [
                { url: 'http://host:8082/adapter/demo/webcomponents/tile.js', adapter: 'demo', version: '1.2.3' },
                { url: 'https://cdn.example/x.js', adapter: 'demo', version: '1.2.3' },
            ],
        );
    });

    it('finds the folder from a host at the root of the server too', () => {
        assert.deepEqual(getWebComponentSources([instance('system.adapter.demo.0', ['tile.js'])], 'http://host/'), [
            { url: 'http://host/adapter/demo/tile.js', adapter: 'demo', version: '1.2.3' },
        ]);
    });

    it('finds the folder from an admin tab, also behind a reverse proxy', () => {
        const demo = [instance('system.adapter.demo.0', ['tile.js'])];
        assert.equal(
            getWebComponentSources(demo, 'http://host:8081/adapter/devices/tab.html?0')[0].url,
            'http://host:8081/adapter/demo/tile.js',
        );
        assert.equal(
            getWebComponentSources(demo, 'https://proxy/iob/adapter/devices/tab.html')[0].url,
            'https://proxy/iob/adapter/demo/tile.js',
        );
        assert.equal(
            getWebComponentSources(demo, 'https://proxy/iob/vis-2/edit.html')[0].url,
            'https://proxy/iob/adapter/demo/tile.js',
        );
    });

    it('takes manifest files and modules alike', () => {
        assert.deepEqual(
            getWebComponentSources(
                [instance('system.adapter.demo.0', ['wc/tile.json', 'old.js'])],
                'http://host/vis-2/',
            ).map(source => source.url),
            ['http://host/adapter/demo/wc/tile.json', 'http://host/adapter/demo/old.js'],
        );
        assert.equal(isManifestFile('http://host/adapter/demo/wc/tile.json'), true);
        assert.equal(isManifestFile('http://host/adapter/demo/wc/tile.JSON?v=1'), true);
        assert.equal(isManifestFile('http://host/adapter/demo/old.js'), false);
        assert.equal(isManifestFile('http://host/adapter/demo/json.js#x.json'), false);
    });

    it('lists a module of several instances of one adapter once', () => {
        assert.equal(
            getWebComponentSources(
                [instance('system.adapter.demo.0', ['tile.js']), instance('system.adapter.demo.1', ['tile.js'])],
                'http://localhost:3000/edit.html',
            ).length,
            1,
        );
    });
});

describe('getWebComponentFiles / readWebComponentManifests', () => {
    const instance = (id, webComponents) => ({ _id: id, common: { version: '1.2.3', webComponents } });

    it('finds the manifest files in the file storage of the admin folder', () => {
        assert.deepEqual(
            getWebComponentFiles([
                instance('system.adapter.demo.0', ['webcomponents/tile.json', './other.json', 'old.js']),
                instance('system.adapter.demo.1', ['webcomponents/tile.json']),
                instance('system.adapter.evil.0', ['../../demo.admin/x.json', 'https://cdn.example/x.json']),
                instance('system.adapter.none.0'),
            ]),
            [
                { adapter: 'demo', version: '1.2.3', id: 'demo.admin', fileName: 'webcomponents/tile.json' },
                { adapter: 'demo', version: '1.2.3', id: 'demo.admin', fileName: 'other.json' },
            ],
        );
    });

    it('reads them without a browser', async () => {
        const errors = [];
        const files = getWebComponentFiles([instance('system.adapter.demo.0', ['a.json', 'b.json', 'c.json'])]);
        const content = {
            'a.json': JSON.stringify({ ...MANIFEST, module: 'a.js' }),
            'b.json': '{ broken',
            'c.json': JSON.stringify({ ...MANIFEST, tag: 'nodash' }),
        };
        const read = [];
        const manifests = await readWebComponentManifests(
            files,
            async (id, fileName) => {
                read.push(`${id}/${fileName}`);
                return content[fileName];
            },
            { error: message => errors.push(message) },
        );
        assert.deepEqual(read, ['demo.admin/a.json', 'demo.admin/b.json', 'demo.admin/c.json']);
        assert.equal(manifests.length, 1);
        assert.equal(manifests[0].manifest.module, 'a.js');
        assert.equal(manifests[0].file.fileName, 'a.json');
        assert.equal(errors.length, 2);
        assert.match(errors[0], /demo.admin\/b.json/);
        assert.match(errors[1], /custom element/);
    });
});
