/**
 * Settings whose options come from the adapter: `selectSendTo` and `autocompleteSendTo` of JSON-Config
 *
 * The host asks an instance with `sendTo(instance, command, data)` and shows the answer as the options of the field:
 *
 * ```json
 * "location": {
 *     "type": "selectSendTo",
 *     "label": { "en": "Location", "de": "Ort" },
 *     "command": "getLocations",
 *     "jsonData": "{ \"instance\": \"${data.instance}\" }",
 *     "instance": "${data.instance}"
 * }
 * ```
 *
 * As in JSON-Config: `data` is sent as it is, `jsonData` is a pattern over `data` (the values of all settings) that
 * gives JSON; `instance` is a pattern too, and `alsoDependsOn` names settings whose change asks again. Unlike in
 * JSON-Config, where the request goes to the instance being configured, a component has none: without `instance` it
 * goes to the first instance of the adapter that brings the component, `<adapter>.0`.
 */
import type {
    WebComponentSetting,
    WebComponentSettingOption,
    WebComponentSettingType,
    WebComponentText,
} from './types.js';

/** The types of settings whose options the host asks an instance for */
export const SEND_TO_TYPES: readonly WebComponentSettingType[] = ['selectSendTo', 'autocompleteSendTo'];

/** What the host sends for a `selectSendTo` or `autocompleteSendTo` */
export interface WebComponentSendToRequest {
    /** Like `my-adapter.0` */
    instance: string;
    command: string;
    /** The message: `data` or the parsed `jsonData`, null if neither */
    data: unknown;
    /** Changes whenever the host has to ask again: compare it with the key of the last request */
    key: string;
}

/**
 * A text with `${data.x}` in it, filled with the values of the settings - as patterns of JSON-Config
 *
 * @param pattern the text
 * @param data the values of all settings
 */
export function fillPattern(pattern: string, data: Record<string, unknown>): string {
    if (!pattern.includes('${')) {
        return pattern;
    }

    const fn = new Function('data', `return \`${pattern.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\`;`) as (
        data: Record<string, unknown>,
    ) => string;
    return fn(data);
}

/**
 * The request for the options of a setting, or null if the setting asks no instance or the request cannot be made
 * yet (e.g. `instance` is `${data.instance}` and no instance is chosen)
 *
 * @param setting the setting from the manifest
 * @param data the values of all settings, as the host holds them
 * @param adapter the adapter that brings the component - the instance asked when the setting names none
 */
export function getSendToRequest(
    setting: WebComponentSetting,
    data: Record<string, unknown>,
    adapter: string,
): WebComponentSendToRequest | null {
    if (!setting || !SEND_TO_TYPES.includes(setting.type)) {
        return null;
    }
    const values = data || {};
    try {
        const instance = (setting.instance ? fillPattern(setting.instance, values) : `${adapter}.0`)
            .trim()
            .replace(/^system\.adapter\./, '');
        if (!/^[a-z0-9][a-z0-9._-]*\.\d+$/i.test(instance)) {
            return null;
        }
        let message: unknown = null;
        if (setting.jsonData) {
            message = JSON.parse(fillPattern(setting.jsonData, values));
        } else if (setting.data !== undefined) {
            message = setting.data;
        }
        const command = setting.command || 'send';
        const depends = (setting.alsoDependsOn || []).map(name => values[name] ?? null);
        return { instance, command, data: message, key: JSON.stringify([instance, command, message, depends]) };
    } catch {
        // a pattern that does not evaluate, or jsonData that is no JSON
        return null;
    }
}

/**
 * The options in the answer of the instance: `[{ value, label }]` as in JSON-Config; a plain value is its own label.
 * Anything else gives no options.
 *
 * @param answer what `sendTo` returned
 */
export function toSendToOptions(answer: unknown): WebComponentSettingOption[] {
    if (!Array.isArray(answer)) {
        return [];
    }
    const options: WebComponentSettingOption[] = [];
    for (const item of answer as unknown[]) {
        if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
            options.push({ value: item, label: String(item) });
        } else if (item && typeof item === 'object') {
            const { value, label } = item as { value?: unknown; label?: unknown };
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                const text =
                    typeof label === 'string' || (label && typeof label === 'object')
                        ? (label as WebComponentText)
                        : String(value);
                options.push({ value, label: text });
            }
        }
    }
    return options;
}
