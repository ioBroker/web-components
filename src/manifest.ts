/**
 * Reading the manifest of a web component
 */
import type {
    WebComponentManifest,
    WebComponentSettingsPanel,
    WebComponentSettingType,
    WebComponentText,
} from './types.js';

/** Settings that only show something and carry no value */
export const DECORATION_TYPES: readonly WebComponentSettingType[] = ['header', 'staticText', 'divider'];

/**
 * What is wrong with the manifest a module exports, or null if it can be used
 *
 * @param manifest what the module exports as `manifest`
 */
export function checkManifest(manifest: unknown): string | null {
    if (!manifest || typeof manifest !== 'object') {
        return 'the module exports no manifest';
    }
    const m = manifest as Partial<WebComponentManifest>;
    if (m.manifestVersion !== 1) {
        return `unknown manifestVersion ${String(m.manifestVersion)}`;
    }
    if (typeof m.tag !== 'string' || !/^[a-z][a-z0-9._]*-[a-z0-9._-]*$/.test(m.tag)) {
        return `"${String(m.tag)}" is no valid name of a custom element`;
    }
    if (!m.name) {
        return 'name is missing';
    }
    const settings = m.settings as { type?: string; items?: unknown } | undefined;
    if (!settings || (settings.type !== 'panel' && settings.type !== 'tabs')) {
        return 'settings must be a JSON-Config panel or tabs';
    }
    if (!settings.items || typeof settings.items !== 'object') {
        return 'settings have no items';
    }
    return null;
}

/** One panel of the settings and where it comes from */
export interface WebComponentSettingsGroup {
    /** `common` for a plain panel, the key of the tab otherwise */
    name: string;
    label?: WebComponentText;
    panel: WebComponentSettingsPanel;
}

/**
 * The panels of the settings: one for a plain panel, one per tab for tabs
 *
 * @param manifest the manifest of the component
 */
export function getSettingsGroups(manifest: WebComponentManifest): WebComponentSettingsGroup[] {
    const settings = manifest.settings;
    if (!settings || typeof settings !== 'object') {
        return [];
    }
    if (settings.type === 'tabs') {
        return Object.keys(settings.items || {}).map(name => ({
            name,
            label: settings.items[name].label,
            panel: settings.items[name],
        }));
    }
    return [{ name: 'common', label: settings.label, panel: settings }];
}

/**
 * A text in the given language; a missing language falls back to English, then to any
 *
 * @param text a string or `{ en, de, ... }`
 * @param lang the language wanted
 */
export function getText(text: WebComponentText | undefined | null, lang: ioBroker.Languages): string {
    if (text === undefined || text === null) {
        return '';
    }
    if (typeof text === 'object') {
        return text[lang] || text.en || Object.values(text).find(value => !!value) || '';
    }
    return String(text);
}

/**
 * Resolve a URL the manifest gives relative to the module, like `icon`
 *
 * @param url as written in the manifest
 * @param moduleUrl absolute URL of the module
 */
export function resolveManifestUrl(url: string | undefined, moduleUrl: string): string | undefined {
    if (!url) {
        return undefined;
    }
    try {
        return new URL(url, moduleUrl).href;
    } catch {
        return url;
    }
}
