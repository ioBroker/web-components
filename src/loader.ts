/**
 * Loading web components in a host
 */
import { checkManifest } from './manifest.js';
import type { LoadedWebComponent, WebComponentModule, WebComponentSource } from './types.js';

/** Loads a module; replaceable for tests and for hosts that load differently */
export type WebComponentImporter = (url: string) => Promise<WebComponentModule>;

/**
 * The native `import()`. `@vite-ignore`, because the URL is only known at runtime; and the URL must be absolute:
 * a relative one would be resolved against this file, not against the document.
 *
 * @param url absolute URL of the module
 */
const nativeImport: WebComponentImporter = url => import(/* @vite-ignore */ url) as Promise<WebComponentModule>;

export interface LoadWebComponentOptions {
    /** How to load a module, the native `import()` if not given */
    importer?: WebComponentImporter;
    /** Where problems are reported, `console` if not given */
    log?: Pick<Console, 'error' | 'warn'>;
}

/**
 * Import one module and check what it exports
 *
 * @param source where the module is
 * @param options how to load and where to report
 * @returns the component, or null if it cannot be used - the reason went to the log
 */
export async function loadWebComponent(
    source: WebComponentSource,
    options: LoadWebComponentOptions = {},
): Promise<LoadedWebComponent | null> {
    const log = options.log || console;
    try {
        const module = await (options.importer || nativeImport)(source.url);
        const problem = checkManifest(module?.manifest);
        if (problem || !module.manifest) {
            log.error(`Web component ${source.url} ignored: ${problem}`);
            return null;
        }
        if (!customElements.get(module.manifest.tag)) {
            log.error(`Web component ${source.url} ignored: it does not define <${module.manifest.tag}>`);
            return null;
        }
        return { ...source, manifest: module.manifest };
    } catch (e) {
        log.error(`Cannot load web component ${source.url}: ${(e as Error)?.message || String(e)}`);
        return null;
    }
}

/**
 * Load several modules side by side; a tag that two modules bring is taken from the first one only
 *
 * @param sources where the modules are, in the order of preference
 * @param options how to load and where to report
 */
export async function loadWebComponents(
    sources: WebComponentSource[],
    options: LoadWebComponentOptions = {},
): Promise<LoadedWebComponent[]> {
    const log = options.log || console;
    const loaded = await Promise.all(sources.map(source => loadWebComponent(source, options)));
    const result: LoadedWebComponent[] = [];
    for (const component of loaded) {
        if (!component) {
            continue;
        }
        if (result.some(other => other.manifest.tag === component.manifest.tag)) {
            log.warn(`Web component <${component.manifest.tag}> of ${component.url} ignored: already loaded`);
            continue;
        }
        result.push(component);
    }
    return result;
}
