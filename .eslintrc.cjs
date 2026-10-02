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
  extends: [
    'standard',
    'prettier',
    'eslint:recommended'
  ],
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
