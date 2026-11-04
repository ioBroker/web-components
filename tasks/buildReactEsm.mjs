/**
 * Builds `build/esm/react-19.js` and `build/esm/react-18.js`: react, react-dom, react-dom/client and
 * react/jsx-runtime of one React major as ONE ES module each.
 *
 * web and admin serve them as `/lib/esm/react-<major>.js`. A React web component maps the four specifiers onto
 * one of these URLs instead of bundling React, and every component on a page that does so gets the same instance.
 * React 18 is there for hosts and libraries that are still on it (Aura).
 *
 * One file instead of four: a component needs all of them anyway (`createRoot` to render, the JSX runtime for its
 * elements), and one module can never end up with two copies of React. The default export carries all names too,
 * so `import React from 'react'` and `import ReactDOM from 'react-dom/client'` both work.
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

process.env.NODE_ENV = 'production';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Where each major comes from. React 19 is a devDependency of the package; React 18 has a folder of its own,
 * because react-dom 18 must find react 18, and npm cannot install both under the names `react` and `react-dom`.
 */
const MAJORS = [
    { major: 19, dir: root },
    { major: 18, dir: join(root, 'tasks', 'react-18'), install: true },
];

/** In the order of precedence: a later module wins a name (only `version` and `Fragment` overlap, same values) */
const MODULES = ['react/jsx-runtime', 'react-dom', 'react-dom/client', 'react'];

for (const { major, dir, install } of MAJORS) {
    if (install && !existsSync(join(dir, 'node_modules', 'react-dom'))) {
        console.log(`Installing React ${major} in ${dir}`);
        execSync('npm ci --no-audit --no-fund', { cwd: dir, stdio: 'inherit' });
    }
    const require = createRequire(join(dir, 'package.json'));

    const reactVersion = require('react/package.json').version;
    const reactDomVersion = require('react-dom/package.json').version;
    if (reactVersion !== reactDomVersion || !reactVersion.startsWith(`${major}.`)) {
        throw new Error(`react ${reactVersion} and react-dom ${reactDomVersion} must be the same ${major}.x`);
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

    const file = `react-${major}.js`;
    const outfile = join(root, 'build', 'esm', file);
    mkdirSync(dirname(outfile), { recursive: true });

    await build({
        // resolved in the folder of this major, so react-dom finds its own react and scheduler
        stdin: { contents, resolveDir: dir, sourcefile: `react-${major}-entry.js`, loader: 'js' },
        bundle: true,
        format: 'esm',
        platform: 'browser',
        target: 'es2020',
        minify: true,
        define: { 'process.env.NODE_ENV': '"production"' },
        legalComments: 'eof',
        banner: {
            js: `/* React ${reactVersion} with react-dom, react-dom/client and react/jsx-runtime as one ES module - built by @iobroker/web-components for /lib/esm/${file} */`,
        },
        outfile,
        logLevel: 'warning',
    });

    const code = readFileSync(outfile);
    console.log(
        `build/esm/${file}: React ${reactVersion}, ${names.size} names, ${Math.round(code.length / 1024)} KB, ${Math.round(gzipSync(code).length / 1024)} KB gzip`,
    );
}
