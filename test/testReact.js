// build/esm/react-19.js and react-18.js: one module each with React, react-dom, react-dom/client and the JSX runtime
import assert from 'node:assert/strict';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

import { REACT_18_URL, REACT_19_URL, REACT_SPECIFIERS } from '../build/index.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 10));

describe('React modules', () => {
    before(() => {
        GlobalRegistrator.register();
    });

    after(async () => {
        document.body.innerHTML = '';
        await GlobalRegistrator.unregister();
    });

    for (const major of [19, 18]) {
        describe(`react-${major}.js`, () => {
            let R;

            before(async () => {
                R = await import(`../build/esm/react-${major}.js`);
            });

            it(`is React ${major}`, () => {
                assert.match(R.version, new RegExp(`^${major}\\.`));
            });

            it('brings the names of all four modules', () => {
                // react
                for (const name of ['createElement', 'useState', 'useEffect', 'createContext', 'Fragment', 'memo']) {
                    assert.equal(typeof R[name] !== 'undefined', true, name);
                }
                // react/jsx-runtime
                assert.equal(typeof R.jsx, 'function');
                assert.equal(typeof R.jsxs, 'function');
                // react-dom and react-dom/client
                for (const name of ['createPortal', 'flushSync', 'createRoot', 'hydrateRoot']) {
                    assert.equal(typeof R[name], 'function', name);
                }
            });

            it('carries every name in the default export too', () => {
                // `import React from 'react'` and `import ReactDOM from 'react-dom/client'` map onto the same default
                assert.equal(R.default.createElement, R.createElement);
                assert.equal(R.default.createRoot, R.createRoot);
                assert.equal(R.default.useState, R.useState);
            });

            it('renders with hooks - JSX runtime, hooks and the renderer are one instance', async () => {
                const { jsx, jsxs, useState, createRoot, flushSync } = R;
                function Counter() {
                    const [count, setCount] = useState(0);
                    return jsxs('button', { onClick: () => setCount(c => c + 1), children: ['Count: ', count] });
                }
                const container = document.createElement('div');
                document.body.appendChild(container);
                const root = createRoot(container);
                flushSync(() => root.render(jsx(Counter, {})));
                assert.equal(container.textContent, 'Count: 0');

                container.querySelector('button').click();
                await tick();
                assert.equal(container.textContent, 'Count: 1');
                root.unmount();
            });
        });
    }

    describe('React URLs', () => {
        it('names the URLs and the imports to map onto them', () => {
            assert.equal(REACT_19_URL, '/lib/esm/react-19.js');
            assert.equal(REACT_18_URL, '/lib/esm/react-18.js');
            assert.deepEqual([...REACT_SPECIFIERS].sort(), [
                'react',
                'react-dom',
                'react-dom/client',
                'react/jsx-runtime',
            ]);
        });

        it('keeps the two majors apart', async () => {
            const r18 = await import('../build/esm/react-18.js');
            const r19 = await import('../build/esm/react-19.js');
            assert.notEqual(r18.useState, r19.useState);
            assert.match(r18.version, /^18\./);
            assert.match(r19.version, /^19\./);
        });
    });
});
