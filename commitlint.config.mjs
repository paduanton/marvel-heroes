export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'refactor', 'test', 'docs', 'build', 'chore', 'perf', 'ci', 'revert']],
    'scope-empty': [2, 'never'],
    'scope-enum': [2, 'always', ['characters', 'stories', 'comics', 'marvel-client', 'cache', 'api', 'frontend', 'docker', 'docs', 'agents', 'dependencies']],
    'header-max-length': [2, 'always', 72],
    'breaking-change-exclamation-mark': [2, 'always'],
  },
};
