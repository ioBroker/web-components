// The short form of the manifests in common.webComponents, and the program that writes it
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
    checkWebComponentEntries,
    getWebComponentEntryFile,
    getWebComponentFiles,
    getWebComponentSources,
    syncWebComponentEntries,
    toWebComponentEntry,
} from '../build/index.js';
import { main } from '../build/cli.js';

const MANIFEST = {
    manifestVersion: 1,
    tag: 'iob-test-tile',
    name: { en: 'Test tile', de: 'Testkachel' },
    description: { en: 'A long description', de: 'Eine lange Beschreibung' },
    icon: '../icons/tile.svg',
    module: 'tile.js',
    size: { width: 360, height: 420 },
    editsValue: true,
    settings: { type: 'panel', items: { oid: { type: 'objectId', label: 'State' } } },
};
const SHORT = {
    manifest: 'webcomponents/tile.json',
    tag: 'iob-test-tile',
    name: { en: 'Test tile', de: 'Testkachel' },
    icon: '../icons/tile.svg',
    size: { width: 360, height: 420 },
};

/** A reader over a map of files, as the build or the repochecker hands it in */
const reader = files => async file => {
    if (!(file in files)) {
        throw new Error(`ENOENT ${file}`);
    }
    return files[file];
};

describe('getWebComponentEntryFile / toWebComponentEntry', () => {
    it('finds the file of a path and of a short form', () => {
        assert.equal(getWebComponentEntryFile('webcomponents/tile.json'), 'webcomponents/tile.json');
        assert.equal(getWebComponentEntryFile(SHORT), 'webcomponents/tile.json');
        for (const entry of ['', null, 1, [], {}, { manifest: '' }, { manifest: 5 }]) {
            assert.equal(getWebComponentEntryFile(entry), null, JSON.stringify(entry));
        }
    });

    it('takes tag, name, icon and size - not settings, description, module or editsValue', () => {
        assert.deepEqual(toWebComponentEntry('webcomponents/tile.json', MANIFEST), SHORT);
    });

    it('keeps noResize, leaves out a data: icon and a missing size', () => {
        assert.deepEqual(
            toWebComponentEntry('a.json', {
                ...MANIFEST,
                icon: 'data:image/svg+xml;base64,AAAA',
                size: { width: 100, height: 50, noResize: false },
            }),
            {
                manifest: 'a.json',
                tag: 'iob-test-tile',
                name: MANIFEST.name,
                size: { width: 100, height: 50, noResize: false },
            },
        );
        const { size: _size, icon: _icon, ...bare } = MANIFEST;
        assert.deepEqual(toWebComponentEntry('a.json', bare), {
            manifest: 'a.json',
            tag: 'iob-test-tile',
            name: MANIFEST.name,
        });
    });
});

describe('syncWebComponentEntries', () => {
    const files = { 'webcomponents/tile.json': JSON.stringify(MANIFEST) };

    it('turns a path into the short form, from the text or the parsed manifest', async () => {
        for (const read of [reader(files), async () => MANIFEST]) {
            const sync = await syncWebComponentEntries(['webcomponents/tile.json'], read);
            assert.deepEqual(sync, { entries: [SHORT], changed: true, problems: [] });
        }
    });

    it('is unchanged when the short form matches, whatever the order of its keys', async () => {
        const reordered = {
            size: SHORT.size,
            name: SHORT.name,
            manifest: SHORT.manifest,
            icon: SHORT.icon,
            tag: SHORT.tag,
        };
        const sync = await syncWebComponentEntries([reordered], reader(files));
        assert.equal(sync.changed, false);
        assert.deepEqual(sync.entries, [SHORT]);
    });

    it('updates an outdated short form', async () => {
        const sync = await syncWebComponentEntries([{ ...SHORT, name: 'Old name', size: undefined }], reader(files));
        assert.equal(sync.changed, true);
        assert.deepEqual(sync.entries, [SHORT]);
    });

    it('keeps a module as a path, and turns a short form of a module back into one', async () => {
        assert.deepEqual(await syncWebComponentEntries(['old/tile.js'], reader({})), {
            entries: ['old/tile.js'],
            changed: false,
            problems: [],
        });
        const sync = await syncWebComponentEntries([{ ...SHORT, manifest: 'old/tile.js' }], reader({}));
        assert.deepEqual([sync.entries, sync.changed], [['old/tile.js'], true]);
    });

    it('leaves an entry as it was when it or its manifest cannot be used', async () => {
        const entries = [
            'webcomponents/missing.json',
            'webcomponents/broken.json',
            'webcomponents/invalid.json',
            { tag: 'x-y' },
            'webcomponents/tile.json',
        ];
        const sync = await syncWebComponentEntries(
            entries,
            reader({
                ...files,
                'webcomponents/broken.json': '{ no json',
                'webcomponents/invalid.json': JSON.stringify({ ...MANIFEST, tag: 'notag' }),
            }),
        );
        assert.deepEqual(sync.entries, [...entries.slice(0, 4), SHORT]);
        assert.deepEqual(
            sync.problems.map(p => `${p.kind} ${p.file}`),
            [
                'invalid webcomponents/missing.json',
                'invalid webcomponents/broken.json',
                'invalid webcomponents/invalid.json',
                'invalid 3',
            ],
        );
        assert.match(sync.problems[2].message, /no valid name of a custom element/);
    });

    it('reports a list that is none', async () => {
        const sync = await syncWebComponentEntries('webcomponents/tile.json', reader(files));
        assert.deepEqual([sync.entries, sync.problems[0].kind], [[], 'invalid']);
    });
});

describe('checkWebComponentEntries', () => {
    const files = {
        'webcomponents/tile.json': JSON.stringify(MANIFEST),
        'webcomponents/other.json': JSON.stringify({ ...MANIFEST, tag: 'iob-test-other' }),
    };

    it('is empty when every manifest file has its current short form', async () => {
        assert.deepEqual(await checkWebComponentEntries([SHORT, 'old/tile.js'], reader(files)), []);
    });

    it('names a missing, an outdated and an invalid entry', async () => {
        const problems = await checkWebComponentEntries(
            [
                'webcomponents/other.json',
                { ...SHORT, name: 'Old name' },
                { ...SHORT, manifest: 'webcomponents/gone.json' },
                { ...SHORT, manifest: 'old/tile.js' },
            ],
            reader(files),
        );
        assert.deepEqual(
            problems.map(p => `${p.kind} ${p.file}`),
            [
                'invalid webcomponents/gone.json',
                'missing webcomponents/other.json',
                'outdated webcomponents/tile.json',
                'outdated old/tile.js',
            ],
        );
    });
});

describe('getWebComponentSources / getWebComponentFiles with the short form', () => {
    const instances = [
        {
            _id: 'system.adapter.demo.0',
            common: { version: '1.2.3', webComponents: [SHORT, 'old.js', { tag: 'x-y' }] },
        },
    ];

    it('takes the file of a short form like a path', () => {
        assert.deepEqual(
            getWebComponentSources(instances, 'http://host/vis-2/').map(source => source.url),
            ['http://host/adapter/demo/webcomponents/tile.json', 'http://host/adapter/demo/old.js'],
        );
        assert.deepEqual(getWebComponentFiles(instances), [
            { adapter: 'demo', version: '1.2.3', id: 'demo.admin', fileName: 'webcomponents/tile.json' },
        ]);
    });
});

describe('iob-web-components sync-io-package', () => {
    let dir;
    let output;
    const original = { log: console.log, error: console.error };

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'iob-wc-'));
        await mkdir(join(dir, 'admin', 'webcomponents'), { recursive: true });
        await writeFile(join(dir, 'admin', 'webcomponents', 'tile.json'), JSON.stringify(MANIFEST));
        output = [];
        console.log = (...args) => output.push(args.join(' '));
        console.error = (...args) => output.push(args.join(' '));
    });

    afterEach(async () => {
        Object.assign(console, original);
        await rm(dir, { recursive: true, force: true });
    });

    /** An io-package.json that JSON.stringify would not write so: only the list may change */
    const ioPackageText = eol =>
        [
            '{',
            '  "common": {',
            '    "name": "demo",',
            '    "keywords": ["a", "b"],',
            '    "news": { "1.0.0": { "en": "now with \\"webComponents\\": [ ] in the news" } },',
            '    "webComponents": ["webcomponents/tile.json", "old/tile.js"],',
            '    "version": "1.0.0"',
            '  },',
            '  "native": {}',
            '}',
            '',
        ].join(eol);

    it('replaces only the list, in the indentation and line ends of the file', async () => {
        for (const eol of ['\n', '\r\n']) {
            await writeFile(join(dir, 'io-package.json'), ioPackageText(eol));
            assert.equal(await main(['sync-io-package', dir]), 0);
            const text = await readFile(join(dir, 'io-package.json'), 'utf8');
            const expected = ioPackageText(eol).replace(
                '"webComponents": ["webcomponents/tile.json", "old/tile.js"]',
                `"webComponents": ${JSON.stringify([SHORT, 'old/tile.js'], null, 2)
                    .split('\n')
                    .map((line, i) => (i ? `    ${line}` : line))
                    .join(eol)}`,
            );
            assert.equal(text, expected);
            assert.deepEqual(JSON.parse(text).common.webComponents, [SHORT, 'old/tile.js']);
        }
    });

    it('writes nothing when the list is current, and --check passes', async () => {
        await writeFile(join(dir, 'io-package.json'), ioPackageText('\n'));
        await main(['sync-io-package', dir]);
        const written = await readFile(join(dir, 'io-package.json'), 'utf8');
        assert.equal(await main(['sync-io-package', dir]), 0);
        assert.equal(await readFile(join(dir, 'io-package.json'), 'utf8'), written);
        assert.equal(await main(['sync-io-package', '--check', dir]), 0);
        assert.match(output.at(-1), /matches the manifests/);
    });

    it('--check fails on a changed manifest and writes nothing', async () => {
        await writeFile(join(dir, 'io-package.json'), ioPackageText('\n'));
        await main(['sync-io-package', dir]);
        const written = await readFile(join(dir, 'io-package.json'), 'utf8');
        await writeFile(
            join(dir, 'admin', 'webcomponents', 'tile.json'),
            JSON.stringify({ ...MANIFEST, name: 'Renamed' }),
        );
        assert.equal(await main(['sync-io-package', '--check', dir]), 1);
        assert.match(output.at(-1), /^outdated: the short form of webcomponents\/tile.json differs/);
        assert.equal(await readFile(join(dir, 'io-package.json'), 'utf8'), written);
    });

    it('reads no manifest from outside the admin folder', async () => {
        await writeFile(join(dir, 'secret.json'), JSON.stringify(MANIFEST));
        await writeFile(
            join(dir, 'io-package.json'),
            JSON.stringify({ common: { webComponents: ['../secret.json', 'webcomponents/tile.json'] } }, null, 4),
        );
        assert.equal(await main(['sync-io-package', dir]), 1);
        const entries = JSON.parse(await readFile(join(dir, 'io-package.json'), 'utf8')).common.webComponents;
        assert.deepEqual(entries, ['../secret.json', SHORT]);
        assert.match(output.join('\n'), /\.\.\/secret\.json: cannot read the manifest: .* is not in the admin folder/);
    });

    it('does nothing without webComponents, and knows only its command', async () => {
        await writeFile(join(dir, 'io-package.json'), '{ "common": { "name": "demo" } }');
        assert.equal(await main(['sync-io-package', dir]), 0);
        assert.equal(await readFile(join(dir, 'io-package.json'), 'utf8'), '{ "common": { "name": "demo" } }');
        assert.equal(await main(['other']), 2);
        assert.equal(await main(['sync-io-package', '--fix', dir]), 2);
    });
});
