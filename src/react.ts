/**
 * React for web components that are written with React: web and admin serve one shared copy, so a component does
 * not have to bring its own.
 */

/** Where web and admin serve React 19 - react, react-dom, react-dom/client and react/jsx-runtime in one module */
export const REACT_19_URL = '/lib/esm/react-19.js';

/** The imports a React web component maps onto {@link REACT_19_URL} instead of bundling them */
export const REACT_SPECIFIERS: readonly string[] = ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'];
