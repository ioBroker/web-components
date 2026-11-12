/**
 * `iob-web-components` - for the build of an adapter (the program is `bin.ts`)
 *
 * ```
 * iob-web-components sync-io-package [--check] [<adapter folder>]
 * ```
 *
 * `sync-io-package` writes the short form of the manifests into `common.webComponents` of `io-package.json`; the
 * manifests are read from the admin folder, so run it after the build wrote them. Only the list `webComponents` is
 * rewritten, the rest of the file stays as it is. `--check` writes nothing and fails if the list differs from the
 * manifests, e.g. in a test.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { checkWebComponentEntries, syncWebComponentEntries, type WebComponentEntryReader } from './ioPackage.js';
import type { WebComponentIoPackageEntry } from './types.js';

/** The part of io-package.json this program reads */
interface IoPackage {
    common?: { webComponents?: unknown };
}

const USAGE = 'Usage: iob-web-components sync-io-package [--check] [<adapter folder>]';

/**
 * Reads a manifest from the admin folder, never from outside it
 *
 * @param adminDir the admin folder of the adapter
 */
function adminReader(adminDir: string): WebComponentEntryReader {
    return async (file: string): Promise<string> => {
        const path = resolve(adminDir, file.replace(/[?#].*$/, ''));
        const rel = relative(adminDir, path);
        if (!rel || isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
            throw new Error(`${file} is not in the admin folder`);
        }
        return readFile(path, 'utf8');
    };
}

/**
 * The indentation of a JSON text, 4 spaces if it has none
 *
 * @param text the JSON text
 */
function detectIndent(text: string): string {
    return /\n([ \t]+)\S/.exec(text)?.[1] ?? '    ';
}

/**
 * Where the list `"webComponents": [...]` is in a JSON text, or null if it is not there exactly once
 *
 * @param text the JSON text
 */
function findList(text: string): { start: number; end: number; indent: string } | null {
    const keys = [...text.matchAll(/(?<!\\)"webComponents"\s*:\s*\[/g)];
    if (keys.length !== 1) {
        return null;
    }
    const start = keys[0].index + keys[0][0].length - 1;
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i++) {
        const c = text[i];
        if (inString) {
            if (c === '\\') {
                i++;
            } else if (c === '"') {
                inString = false;
            }
        } else if (c === '"') {
            inString = true;
        } else if (c === '[' || c === '{') {
            depth++;
        } else if (c === ']' || c === '}') {
            depth--;
            if (!depth) {
                const lineStart = text.lastIndexOf('\n', keys[0].index) + 1;
                const indent = /^[ \t]*/.exec(text.substring(lineStart))?.[0] ?? '';
                return { start, end: i + 1, indent };
            }
        }
    }
    return null;
}

/**
 * The io-package.json with the new list - only the list is replaced, the rest of the text stays
 *
 * @param text the io-package.json as it is
 * @param ioPackage its content
 * @param entries the new `common.webComponents`
 */
function replaceList(text: string, ioPackage: IoPackage, entries: WebComponentIoPackageEntry[]): string {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const unit = detectIndent(text);
    const list = findList(text);
    if (list) {
        const json = JSON.stringify(entries, null, unit)
            .split('\n')
            .map((line, i) => (i ? list.indent + line : line))
            .join(eol);
        return text.substring(0, list.start) + json + text.substring(list.end);
    }
    // not found once (e.g. "webComponents" also in a text): the whole file, formatted as JSON
    ioPackage.common = { ...ioPackage.common, webComponents: entries };
    const json = JSON.stringify(ioPackage, null, unit).split('\n').join(eol);
    return json + (/\r?\n$/.test(text) ? eol : '');
}

/**
 * Runs `sync-io-package`, returns the exit code
 *
 * @param args the arguments after the command
 */
async function syncIoPackage(args: string[]): Promise<number> {
    const check = args.includes('--check');
    const folders = args.filter(arg => !arg.startsWith('--'));
    if (folders.length > 1 || args.some(arg => arg.startsWith('--') && arg !== '--check')) {
        console.error(USAGE);
        return 2;
    }
    const dir = resolve(folders[0] || '.');
    const file = join(dir, 'io-package.json');
    const text = await readFile(file, 'utf8');
    const ioPackage = JSON.parse(text) as IoPackage;
    const entries = ioPackage.common?.webComponents;
    if (entries === undefined) {
        console.log(`${file}: no common.webComponents - nothing to do`);
        return 0;
    }
    const read = adminReader(join(dir, 'admin'));

    if (check) {
        const problems = await checkWebComponentEntries(entries, read);
        for (const problem of problems) {
            console.error(`${problem.kind}: ${problem.message}`);
        }
        if (!problems.length) {
            console.log(`${file}: common.webComponents matches the manifests`);
        }
        return problems.length ? 1 : 0;
    }

    const sync = await syncWebComponentEntries(entries, read);
    for (const problem of sync.problems) {
        console.error(`${problem.file || 'common.webComponents'}: ${problem.message}`);
    }
    if (sync.changed) {
        await writeFile(file, replaceList(text, ioPackage, sync.entries));
        console.log(`${file}: common.webComponents updated (${sync.entries.length} entries)`);
    } else {
        console.log(`${file}: common.webComponents is up to date`);
    }
    return sync.problems.length ? 1 : 0;
}

/**
 * Runs a command, returns the exit code
 *
 * @param argv the arguments, without node and the script
 */
export async function main(argv: string[]): Promise<number> {
    const [command, ...args] = argv;
    if (command === 'sync-io-package') {
        try {
            return await syncIoPackage(args);
        } catch (e) {
            console.error((e as Error)?.message || String(e));
            return 1;
        }
    }
    console.error(USAGE);
    return 2;
}
