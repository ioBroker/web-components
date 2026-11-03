/**
 * Builds `build/esm/react-19.js`: React 19, react-dom, react-dom/client and react/jsx-runtime as ONE ES module.
 *
 * web and admin serve it as `/lib/esm/react-19.js`. A React web component maps the four specifiers onto that URL
 * instead of bundling React, and every component on a page gets the same instance.
 *
 * One file instead of four: a component needs all of them anyway (`createRoot` to render, the JSX runtime for its
 * elements), and one module can never end up with two copies of React. The default export carries all names too,
 * so `import React from 'react'` and `import ReactDOM from 'react-dom/client'` both work.
 */
import { createRequire } from 'node:module';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

process.env.NODE_ENV = 'production';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));

/** In the order of precedence: a later module wins a name (only `version` and `Fragment` overlap, same values) */
const MODULES = ['react/jsx-runtime', 'react-dom', 'react-dom/client', 'react'];

const reactVersion = require('react/package.json').version;
const reactDomVersion = require('react-dom/package.json').version;
if (reactVersion !== reactDomVersion || !reactVersion.startsWith('19.')) {
    throw new Error(`react ${reactVersion} and react-dom ${reactDomVersion} must be the same 19.x`);
}

// the names come from the modules themselves, so a new export of a React minor is never forgotten
const names = new Set();
for (const module of MODULES) {
    for (const name of Object.keys(require(module))) {
        if (/^[A-Za-z_$][\w$]*$/.test(name) && name !== 'default') {
            names.add(name);
        }
    }
}

const imports = MODULES.map((module, i) => `import * as m${i} from '${module}';`).join('\n');
const contents = `${imports}
const all = Object.assign({}, ${MODULES.map((_, i) => `m${i}`).join(', ')});
delete all.default;
export default all;
export const { ${[...names].sort().join(', ')} } = all;
`;

const outfile = join(root, 'build', 'esm', 'react-19.js');
mkdirSync(dirname(outfile), { recursive: true });

await build({
    stdin: { contents, resolveDir: root, sourcefile: 'react-19-entry.js', loader: 'js' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'eof',
    banner: {
        js: `/* React ${reactVersion} with react-dom, react-dom/client and react/jsx-runtime as one ES module - built by @iobroker/web-components for /lib/esm/react-19.js */`,
    },
    outfile,
    logLevel: 'warning',
});

console.log(
    `build/esm/react-19.js: React ${reactVersion}, ${names.size} names, ${Math.round(statSync(outfile).size / 1024)} KB`,
);
