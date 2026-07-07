module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'test', 'refactor', 'chore', 'perf', 'ci'],
    ],
    'subject-min-length': [2, 'always', 5],
  },
}
