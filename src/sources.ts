/**
 * Where the web components of the installed adapters are
 *
 * An adapter lists its components in `common.webComponents` of its io-package.json, as URLs of ES modules
 * relative to its admin folder. Admin and web both serve that folder as `/adapter/<name>/`, so every host loads
 * them from the same place:
 *
 * ```json
 * "common": { "webComponents": ["webcomponents/my-tile.js"] }
 * ```
 */
import type { WebComponentSource } from './types.js';

/** The part of an instance object this module reads */
export interface WebComponentInstance {
    _id: string;
    common: { version?: string; webComponents?: unknown };
}

/**
 * The adapter of an instance ID
 *
 * @param id like `system.adapter.my-adapter.0`
 */
function getAdapterName(id: string): string {
    return id.replace(/^system\.adapter\./, '').replace(/\.\d+$/, '');
}

/**
 * Where the web components of the instances are
 *
 * @param instances the instance objects, e.g. of `getObjectViewSystem('instance', ...)`
 * @param baseUrl URL of the document; `../adapter/<name>/` is resolved against it, so a host under a path of its
 *   own (`/vis-2/`) and one at the root of the server both find the folder
 */
export function getWebComponentSources(instances: WebComponentInstance[], baseUrl: string): WebComponentSource[] {
    const sources: WebComponentSource[] = [];
    for (const instance of instances) {
        const list = instance?.common?.webComponents;
        if (!Array.isArray(list)) {
            continue;
        }
        const adapter = getAdapterName(instance._id);
        const adapterBase = new URL(`../adapter/${adapter}/`, baseUrl);
        for (const entry of list) {
            if (typeof entry !== 'string' || !entry) {
                continue;
            }
            const url = new URL(entry, adapterBase).href;
            // every instance of an adapter lists the same files
            if (!sources.some(source => source.url === url)) {
                sources.push({ url, adapter, version: instance.common.version || '' });
            }
        }
    }
    return sources;
}
