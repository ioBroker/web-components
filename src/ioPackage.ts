/**
 * The short form of the manifests in `common.webComponents`
 *
 * The repository of ioBroker carries `common` of every adapter, but not its files. So that a host can list a
 * component whose adapter is not installed - greyed out, with its name and picture instead of a file name - an entry
 * may carry a short form of its manifest next to the path:
 *
 * ```json
 * "webComponents": [
 *     { "manifest": "webcomponents/my-tile.json", "tag": "my-tile", "name": { "en": "My tile" }, "size": { "width": 360, "height": 420 } }
 * ]
 * ```
 *
 * The manifest stays the only source: the adapter's build writes the short form from it (`syncWebComponentEntries`,
 * CLI `iob-web-components sync-io-package`), and the repochecker compares both (`checkWebComponentEntries`). Nothing
 * here reads files - the caller hands in how a manifest is read.
 */
import { checkManifest } from './manifest.js';
import type { WebComponentEntry, WebComponentIoPackageEntry, WebComponentManifest } from './types.js';

/** Reads a manifest file named in `common.webComponents`: its text or its parsed content */
export type WebComponentEntryReader = (file: string) => Promise<unknown>;

/** What is wrong with an entry of `common.webComponents` */
export interface WebComponentEntryProblem {
    /** The path of the entry, or its index if it has none */
    file: string;
    /**
     * - `missing`: a manifest file without the short form - valid, but a host cannot list it from the repository;
     * - `outdated`: the short form differs from the manifest;
     * - `invalid`: the entry or its manifest cannot be used.
     */
    kind: 'missing' | 'outdated' | 'invalid';
    message: string;
}

/** The entries of `common.webComponents` after `syncWebComponentEntries` */
export interface WebComponentEntriesSync {
    entries: WebComponentIoPackageEntry[];
    /** Whether an entry changed */
    changed: boolean;
    /** Entries that were left as they were, because they or their manifest cannot be used */
    problems: WebComponentEntryProblem[];
}

/**
 * The manifest file (or module) an entry of `common.webComponents` names, or null if it names none
 *
 * @param entry a path, or an object with the path in `manifest`
 */
export function getWebComponentEntryFile(entry: unknown): string | null {
    if (typeof entry === 'string') {
        return entry || null;
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const file = (entry as Partial<WebComponentEntry>).manifest;
        return typeof file === 'string' && file ? file : null;
    }
    return null;
}

/**
 * The short form of a manifest
 *
 * @param file the path of the manifest file, as in `common.webComponents`
 * @param manifest the manifest
 */
export function toWebComponentEntry(file: string, manifest: WebComponentManifest): WebComponentEntry {
    const entry: WebComponentEntry = { manifest: file, tag: manifest.tag, name: manifest.name };
    // a data: URL can be kilobytes - in every instance object
    if (typeof manifest.icon === 'string' && manifest.icon && !manifest.icon.startsWith('data:')) {
        entry.icon = manifest.icon;
    }
    if (manifest.size) {
        entry.size = { width: manifest.size.width, height: manifest.size.height };
        if (manifest.size.noResize !== undefined) {
            entry.size.noResize = manifest.size.noResize;
        }
    }
    return entry;
}

/** JSON with sorted keys, to compare two values without the order of their keys */
function sortedJson(value: unknown): string {
    return JSON.stringify(value, (_key, val: unknown) =>
        val && typeof val === 'object' && !Array.isArray(val)
            ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
            : val,
    );
}

/** Whether an entry names a manifest file, which has a short form - a module (`.js`) exports its manifest */
function isManifestEntry(file: string): boolean {
    return /\.json$/i.test(file.replace(/[?#].*$/, ''));
}

/**
 * Read the manifest of an entry and check it
 *
 * @param file the path of the manifest file
 * @param read reads it
 */
async function readEntryManifest(
    file: string,
    read: WebComponentEntryReader,
): Promise<{ manifest: WebComponentManifest } | { problem: string }> {
    let manifest: unknown;
    try {
        const content = await read(file);
        manifest = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (e) {
        return { problem: `cannot read the manifest: ${(e as Error)?.message || String(e)}` };
    }
    const problem = checkManifest(manifest);
    return problem
        ? { problem: `the manifest cannot be used: ${problem}` }
        : { manifest: manifest as WebComponentManifest };
}

/**
 * The entries of `common.webComponents` with the short form of their manifests, for the build of an adapter: run it
 * after the manifests are written, and store the entries in `io-package.json`. A module that exports its manifest
 * (`.js`) stays a plain path, and an entry whose manifest cannot be read or used stays as it was.
 *
 * @param entries `common.webComponents` of the io-package.json
 * @param read reads a manifest file, e.g. `file => readFile(join('admin', file), 'utf8')`
 */
export async function syncWebComponentEntries(
    entries: unknown,
    read: WebComponentEntryReader,
): Promise<WebComponentEntriesSync> {
    if (!Array.isArray(entries)) {
        return {
            entries: [],
            changed: false,
            problems: [{ file: '', kind: 'invalid', message: 'common.webComponents is no list' }],
        };
    }
    const result: WebComponentEntriesSync = { entries: [], changed: false, problems: [] };
    for (let i = 0; i < entries.length; i++) {
        const entry: unknown = entries[i];
        const file = getWebComponentEntryFile(entry);
        if (!file) {
            result.problems.push({ file: String(i), kind: 'invalid', message: `entry ${i} names no manifest file` });
            result.entries.push(entry as WebComponentIoPackageEntry);
            continue;
        }
        if (!isManifestEntry(file)) {
            result.entries.push(file);
            result.changed ||= entry !== file;
            continue;
        }
        const loaded = await readEntryManifest(file, read);
        if ('problem' in loaded) {
            result.problems.push({ file, kind: 'invalid', message: loaded.problem });
            result.entries.push(entry as WebComponentIoPackageEntry);
            continue;
        }
        const short = toWebComponentEntry(file, loaded.manifest);
        result.entries.push(short);
        result.changed ||= sortedJson(entry) !== sortedJson(short);
    }
    return result;
}

/**
 * What differs between `common.webComponents` and the manifests, for the repochecker or a test of an adapter: an
 * entry without the short form (`missing`), a short form that differs from its manifest (`outdated`), and an entry
 * or manifest that cannot be used (`invalid`). Empty if all is well.
 *
 * @param entries `common.webComponents` of the io-package.json
 * @param read reads a manifest file, e.g. from the npm package of the adapter
 */
export async function checkWebComponentEntries(
    entries: unknown,
    read: WebComponentEntryReader,
): Promise<WebComponentEntryProblem[]> {
    const sync = await syncWebComponentEntries(entries, read);
    if (!Array.isArray(entries)) {
        return sync.problems;
    }
    const problems = [...sync.problems];
    entries.forEach((entry: unknown, i) => {
        const file = getWebComponentEntryFile(entry);
        const short = sync.entries[i];
        if (!file || problems.some(p => p.file === file)) {
            return;
        }
        if (typeof short === 'string') {
            if (typeof entry !== 'string') {
                problems.push({ file, kind: 'outdated', message: `${file} is a module, which has no short form` });
            }
            return;
        }
        if (typeof entry === 'string') {
            problems.push({
                file,
                kind: 'missing',
                message: `${file} has no short form - run "iob-web-components sync-io-package" in the build`,
            });
        } else if (sortedJson(entry) !== sortedJson(short)) {
            problems.push({
                file,
                kind: 'outdated',
                message: `the short form of ${file} differs from its manifest - run "iob-web-components sync-io-package" in the build`,
            });
        }
    });
    return problems;
}
