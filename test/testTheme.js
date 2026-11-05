// The theme helpers belong to the main entry: they must work in plain Node
import assert from 'node:assert/strict';

import {
    getDefaultTheme,
    getThemeCssVariables,
    getWebComponentTheme,
    isSameTheme,
    toWebComponentTheme,
} from '../build/index.js';

describe('Theme', () => {
    it('gives the themes of ioBroker for light, dark and nothing', () => {
        assert.equal(getDefaultTheme('light').primary, '#3399CC');
        assert.equal(getDefaultTheme('dark').primary, '#4DABF5');
        assert.equal(getDefaultTheme('dark').paper, '#121212');
        assert.equal(getDefaultTheme().type, 'light');
        assert.equal(toWebComponentTheme(undefined).type, 'light');
        assert.equal(toWebComponentTheme('dark').type, 'dark');
        assert.equal(toWebComponentTheme('blue').type, 'light');
        // a copy: a component that changes its theme changes no default
        getDefaultTheme('light').primary = '#000';
        assert.equal(getDefaultTheme('light').primary, '#3399CC');
    });

    it('fills what a host left out and drops broken values', () => {
        const theme = toWebComponentTheme({
            type: 'dark',
            primary: ' #ff0000 ',
            paper: '',
            text: 42,
            fontSize: '16px',
            borderRadius: -1,
        });
        assert.equal(theme.type, 'dark');
        assert.equal(theme.primary, '#ff0000');
        assert.equal(theme.paper, '#121212');
        assert.equal(theme.text, '#FFFFFF');
        assert.equal(theme.fontSize, 16);
        assert.equal(theme.borderRadius, 4);
        assert.deepEqual(Object.keys(theme).sort(), Object.keys(getDefaultTheme()).sort());
    });

    it('takes the theme of a host built with MUI', () => {
        const theme = getWebComponentTheme({
            palette: {
                mode: 'dark',
                primary: { main: '#00af78', contrastText: '#000' },
                secondary: { main: '#005a40', contrastText: '#fff' },
                background: { default: '#101010', paper: '#202020' },
                text: { primary: '#eee', secondary: '#aaa' },
                divider: '#333',
                error: { main: '#e00' },
                warning: { main: '#ea0' },
                info: { main: '#0ae' },
                success: { main: '#0a0' },
            },
            typography: { fontFamily: 'Inter, sans-serif', fontSize: 13 },
            shape: { borderRadius: '6px' },
        });
        assert.deepEqual(theme, {
            type: 'dark',
            primary: '#00af78',
            primaryContrast: '#000',
            secondary: '#005a40',
            secondaryContrast: '#fff',
            background: '#101010',
            paper: '#202020',
            text: '#eee',
            textSecondary: '#aaa',
            divider: '#333',
            error: '#e00',
            warning: '#ea0',
            info: '#0ae',
            success: '#0a0',
            fontFamily: 'Inter, sans-serif',
            fontSize: 13,
            borderRadius: 6,
        });
        // a theme without palette, or none at all
        assert.deepEqual(getWebComponentTheme({}), getDefaultTheme('light'));
        assert.deepEqual(getWebComponentTheme(null), getDefaultTheme('light'));
    });

    it('tells themes with the same values', () => {
        assert.equal(isSameTheme(getDefaultTheme('dark'), toWebComponentTheme('dark')), true);
        assert.equal(isSameTheme(getDefaultTheme('dark'), getDefaultTheme('light')), false);
        assert.equal(isSameTheme(getDefaultTheme(), toWebComponentTheme({ borderRadius: 8 })), false);
    });

    it('gives the theme as CSS variables', () => {
        const variables = getThemeCssVariables(toWebComponentTheme({ type: 'dark', fontSize: 16 }));
        assert.equal(variables['--iob-primary'], '#4DABF5');
        assert.equal(variables['--iob-primary-contrast'], 'rgba(0, 0, 0, 0.87)');
        assert.equal(variables['--iob-text-secondary'], 'rgba(255, 255, 255, 0.7)');
        assert.equal(variables['--iob-font-size'], '16px');
        assert.equal(variables['--iob-border-radius'], '4px');
        assert.equal(variables['color-scheme'], 'dark');
        assert.equal(variables['--iob-type'], undefined);
        assert.equal(Object.keys(variables).length, 17);
    });
});
