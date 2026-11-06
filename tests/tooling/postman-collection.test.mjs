import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Script } from 'node:vm';

const read = (path) => JSON.parse(readFileSync(new URL(`../../docs/postman/${path}`, import.meta.url), 'utf8'));
const collection = read('marvel-heroes.postman_collection.json');
const environment = read('local.postman_environment.json');
const requests = collection.item.flatMap(folder => folder.item);

test('uses portable URLs and only synthetic public examples', () => {
  assert.match(collection.info.schema, /collection\/v2\.1\.0/);
  assert.equal(collection.variable.find(variable => variable.key === 'base_url').value, 'https://api.example.test');
  assert.equal(environment.values.find(variable => variable.key === 'base_url').value, 'http://localhost:8080');
  assert.equal(collection.variable.find(variable => variable.key === 'allow_identity_writes').value, 'false');
  assert.equal(environment.values.find(variable => variable.key === 'allow_identity_writes').value, 'false');
  for (const { request, response = [] } of requests) {
    assert.match(request.url.raw, /^\{\{base_url\}\}\//);
    for (const example of response) {
      assert.match(example.originalRequest.url.raw, /^\{\{base_url\}\}\//);
      assert.ok(!example.header.some(header => /^(set-cookie|cookie|authorization)$/i.test(header.key)));
      assert.ok(!example.body.includes('127.0.0.1'));
    }
  }
});

test('all requests are executable and the identity folder is opt-in', () => {
  const identity = collection.item.find(folder => folder.name.startsWith('Identity'));
  assert.ok(identity.event[0].script.exec.some(line => line.includes('pm.execution.skipRequest')));
  const paths = requests.map(({ request }) => request.url.raw.split('?')[0]);
  assert.ok(paths.includes('{{base_url}}/sanctum/csrf-cookie'));
  assert.ok(paths.includes('{{base_url}}/api/v1/auth/register'));
  assert.ok(paths.includes('{{base_url}}/api/v1/auth/login'));
  assert.ok(paths.includes('{{base_url}}/api/v1/auth/logout'));
  for (const item of [...collection.item, ...requests]) {
    for (const event of item.event ?? []) {
      assert.doesNotThrow(() => new Script(event.script.exec.join('\n')));
    }
  }
});
