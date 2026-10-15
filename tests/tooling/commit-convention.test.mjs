import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

function lint(message) {
  return spawnSync(process.execPath, ['node_modules/@commitlint/cli/cli.js'], { input: message, encoding: 'utf8' });
}

test('accepts scoped, concise conventional commits and documented breaking changes', () => {
  for (const message of [
    'feat(characters): add character discovery',
    'test(frontend): verify catalog recovery',
    'build(dependencies): add commit validation',
    'feat(api)!: replace collection response\n\nBREAKING CHANGE: Consumers must use the new envelope.',
  ]) assert.equal(lint(message).status, 0, message);
});

test('rejects unscoped, unknown, empty and overly long commit messages', () => {
  for (const [message, rule] of [
    ['fix: repair pagination', 'scope-empty'], ['fix(unknown): repair pagination', 'scope-enum'],
    ['style(frontend): reformat everything', 'type-enum'], ['fix(characters):', 'subject-empty'],
    [`feat(characters): ${'a'.repeat(80)}`, 'header-max-length'],
    ['feat(api)!: replace collection response', 'breaking-change-exclamation-mark'],
  ]) {
    const result = lint(message);
    assert.notEqual(result.status, 0, message);
    assert.ok(`${result.stdout}${result.stderr}`.includes(rule), `${message}: expected ${rule}`);
  }
});

test('the installed hook rejects invalid messages without creating a commit', () => {
  const directory = mkdtempSync(join(tmpdir(), 'marvel-commit-'));
  const path = join(directory, 'message with spaces.txt');
  const head = () => spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const before = head();
  try {
    writeFileSync(path, 'test(api): verify catalog contract\n');
    const accepted = spawnSync('git', ['hook', 'run', 'commit-msg', '--', path], { encoding: 'utf8' });
    assert.equal(accepted.status, 0, accepted.stderr);
    writeFileSync(path, 'unscoped change\n');
    assert.notEqual(spawnSync('git', ['hook', 'run', 'commit-msg', '--', path]).status, 0);
    assert.equal(head(), before);
  } finally {
    rmSync(path, { force: true });
    rmdirSync(directory);
  }
});
