const js = require('@eslint/js')
const tseslint = require('typescript-eslint')
const react = require('eslint-plugin-react')
const reactHooks = require('eslint-plugin-react-hooks')
const prettier = require('eslint-plugin-prettier')
const prettierConfig = require('eslint-config-prettier')
const globals = require('globals')

module.exports = tseslint.config(
    { ignores: ['public', 'dist', 'src/tauri/bindings.ts'] },
    js.configs.recommended,
    react.configs.flat.recommended,
    tseslint.configs.recommended,
    prettierConfig,
    {
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
        },
        plugins: {
            'react-hooks': reactHooks,
            prettier,
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
        rules: {
            'react/react-in-jsx-scope': 'off',
            'camelcase': 'error',
            'eqeqeq': ['error', 'always'],
            'no-duplicate-imports': 'error',
            'prettier/prettier': 'error',
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'error',
            'spaced-comment': ['error', 'always', { markers: ['/'] }],
        },
    },
    {
        // Playwright fixtures receive a `use` callback that is not React's `use`.
        files: ['e2e/**'],
        rules: {
            'react-hooks/rules-of-hooks': 'off',
        },
    },
    {
        // This file is CommonJS because package.json does not set "type": "module".
        files: ['eslint.config.js'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    }
)
