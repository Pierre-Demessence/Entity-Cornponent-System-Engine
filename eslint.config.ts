import antfu from '@antfu/eslint-config';
import * as pluginImportX from 'eslint-plugin-import-x';

export default antfu(
  {
    ignores: ['docs/**', 'coverage/**', 'examples/**/dist/**', 'examples/assets/**'],
    markdown: false,
    typescript: true,
    stylistic: {
      indent: 2,
      quotes: 'single',
      semi: true,
    },
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
    },
  },
  {
    plugins: {
      'import-x': pluginImportX,
    },
    rules: {
      'import-x/no-unresolved': 'error',
    },
    settings: {
      'import-x/resolver': {
        typescript: {
          noWarnOnMultipleProjects: true,
          project: ['./tsconfig.json', './examples/*/tsconfig.json'],
        },
      },
    },
  },
  {
    rules: {
      'ts/no-redeclare': 'off',
    },
  },
  {
    rules: {
      'perfectionist/sort-classes': ['error', {
        groups: ['top', 'property', 'constructor', 'method', 'unknown'],
        order: 'asc',
        type: 'natural',
        customGroups: [
          { elementNamePattern: '^(?:id|name)$', groupName: 'top' },
        ],
      }],
      'perfectionist/sort-exports': ['error', {
        groups: ['type-export', 'value-export'],
        newlinesBetween: 1,
        order: 'asc',
        type: 'natural',
      }],
      'perfectionist/sort-imports': ['error', {
        newlinesBetween: 1,
        order: 'asc',
        type: 'natural',
        groups: [
          'type-import',
          ['type-parent', 'type-sibling', 'type-index', 'type-internal'],
          'value-builtin',
          'value-external',
          'value-internal',
          ['value-parent', 'value-sibling', 'value-index'],
          'side-effect',
          'ts-equals-import',
          'unknown',
        ],
      }],
      'perfectionist/sort-interfaces': ['error', {
        groups: ['top', 'member', 'multiline-member', 'unknown', 'method', 'multiline-method'],
        order: 'asc',
        type: 'natural',
        customGroups: [
          { elementNamePattern: '^(?:id|name)$', groupName: 'top' },
        ],
      }],
      'perfectionist/sort-objects': ['error', {
        groups: ['top', 'member', 'multiline-member', 'unknown', 'method', 'multiline-method'],
        order: 'asc',
        type: 'natural',
        customGroups: [
          { elementNamePattern: '^(?:id|name)$', groupName: 'top' },
        ],
      }],
    },
  },
);
