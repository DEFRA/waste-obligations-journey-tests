const playwright = require('eslint-plugin-playwright')

// eslint-plugin-playwright's recommended rules, every one as an error. Conditional skips
// (`test.skip(condition, reason)`) stay allowed: specs skip at runtime when an environment can't run a case.
const playwrightRules = Object.fromEntries(
  Object.entries(playwright.configs.recommended.rules).map(([rule, level]) => [
    rule,
    level === 'warn' ? 'error' : level
  ])
)
playwrightRules['playwright/no-skipped-test'] = [
  'error',
  { allowConditional: true }
]
// Calls that assert: page-object `expect…` methods, `assert…` helpers, and journey helpers whose bodies assert.
playwrightRules['playwright/expect-expect'] = [
  'error',
  {
    assertFunctionPatterns: ['(^|\\.)expect[A-Z]', '^assert[A-Z]'],
    assertFunctionNames: ['walkCsocJourney']
  }
]

module.exports = {
  env: {
    es2022: true,
    node: true,
    jest: true
  },
  globals: {
    before: true,
    after: true
  },
  extends: ['standard', 'prettier', 'eslint:recommended'],
  overrides: [
    {
      // `page.evaluate()` callbacks in specs run in the browser, not Node;
      // `window`/`document` are already tolerated by eslint-config-standard,
      // but storage globals aren't.
      files: ['tests/**/*.js'],
      globals: {
        sessionStorage: true,
        localStorage: true
      },
      rules: {
        'no-unused-vars': 'off'
      }
    },
    {
      files: [
        'tests/**/*.js',
        'pages/**/*.js',
        'fixtures/**/*.js',
        'auth/**/*.js'
      ],
      plugins: ['playwright'],
      rules: playwrightRules
    }
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: ['prettier'],
  rules: {
    'prettier/prettier': 'error',
    'no-console': 'error'
  }
}
