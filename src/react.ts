/**
 * React for web components that are written with React: web and admin serve one shared copy per major, so a
 * component does not have to bring its own.
 */

/** Where web and admin serve React 19 - react, react-dom, react-dom/client and react/jsx-runtime in one module */
export const REACT_19_URL = '/lib/esm/react-19.js';

/** Where web and admin serve React 18 - the same four modules, for components and hosts still on React 18 */
export const REACT_18_URL = '/lib/esm/react-18.js';

/** The imports a React web component maps onto {@link REACT_19_URL} or {@link REACT_18_URL} instead of bundling them */
export const REACT_SPECIFIERS: readonly string[] = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'];
