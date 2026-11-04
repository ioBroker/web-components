/**
 * `@iobroker/web-components` - for hosts: the contract, and reading, checking and loading components.
 *
 * Nothing here touches the DOM while it is imported, so a host may also use it in Node (tests, a backend that
 * checks manifests). The base class for components is in `@iobroker/web-components/element`.
 */
export type * from './types.js';
export {
    checkManifest,
    DECORATION_TYPES,
    getSettingsGroups,
    getText,
    resolveManifestUrl,
    type WebComponentSettingsGroup,
} from './manifest.js';
export { getDefaultSettings, getPanelSettingTypes, getSettingTypes, toSettings, toSettingValue } from './settings.js';
export { DIALOG_CLOSE_EVENT, isFormDialog, NAVIGATE_EVENT } from './dialog.js';
export { getWebComponentFiles, getWebComponentSources, type WebComponentInstance } from './sources.js';
export { getReactImportPath, REACT_18_URL, REACT_19_URL, REACT_SPECIFIERS } from './react.js';
export {
    importWebComponent,
    isManifestFile,
    loadWebComponent,
    loadWebComponents,
    readWebComponentManifests,
    type LoadWebComponentOptions,
    type WebComponentImporter,
    type WebComponentManifestReader,
} from './loader.js';
