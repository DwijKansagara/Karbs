import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mergeHooks, prepare, apply } from '../scripts/connect-project.mjs';
import { resolveSessionTask } from '../src/island/session-routing.ts';

const relay = fileURLToPath(new URL('../target/release/karbs-hook.exe',import.meta.url));
test('merge preserves unrelated settings and handlers in mixed groups', () => {
  const existing = { model: 'original', apiKey: 'do-not-print', hooks: { BeforeTool: [{ matcher: 'read_file',
    hooks: [{ command: 'other-hook' }, { command: `"${relay}" --provider gemini BeforeTool` }] }] } };
  const merged = mergeHooks(existing, 'gemini', relay);
  assert.equal(merged.model, 'original');
  assert.equal(merged.apiKey, 'do-not-print');
  assert.equal(merged.hooks.BeforeTool[0].hooks[0].command, 'other-hook');
  assert.deepEqual(mergeHooks(merged, 'gemini', relay), merged);
  const removed = mergeHooks(merged, 'gemini', relay, true);
  assert.deepEqual(removed.hooks.BeforeTool, [{ matcher: 'read_file', hooks: [{ command: 'other-hook' }] }]);
});
test('timeout units and supported hooks differ by provider', () => {
  const codex = mergeHooks({}, 'codex', relay);
  const gemini = mergeHooks({}, 'gemini', relay);
  assert.equal(codex.hooks.PermissionRequest[0].hooks[0].timeout, 120);
  assert.equal(gemini.hooks.BeforeTool[0].hooks[0].timeout, 3000);
  assert.equal(gemini.hooks.BeforeTool[0].matcher, '.*');
  assert.equal(gemini.hooks.PermissionRequest, undefined);
});
test('invalid existing hook structure is refused', () => {
  for (const value of [[], { hooks: [] }, { hooks: { Stop: {} } }, { hooks: { Stop: [{}] } }]) {
    assert.throws(() => mergeHooks(value, 'codex', relay));
  }
});
test('reconnecting an unchanged project preserves bytes and creates no backup', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'idempotent-test-'));
  await mkdir(join(dir, '.codex'));
  const file = join(dir, '.codex/hooks.json');
  const original = JSON.stringify(mergeHooks({}, 'codex', relay), null, 4);
  await writeFile(file, original);
  assert.deepEqual(await apply(await prepare(dir, relay, false, ['codex'])), []);
  assert.equal(await readFile(file, 'utf8'), original);
});
test('concurrent sessions and providers never share task state', () => {
  const tasks = [];
  const one = resolveSessionTask(tasks, { provider: 'codex', session_id: 'same', cwd: 'E:/One' });
  one.steps.push('private step');
  const two = resolveSessionTask(tasks, { provider: 'gemini', session_id: 'same', cwd: 'E:/Two' });
  const three = resolveSessionTask(tasks, { provider: 'codex', session_id: 'another', cwd: 'E:/Three' });
  assert.equal(new Set([one.id, two.id, three.id]).size, 3);
  assert.deepEqual(two.steps, []);
  assert.equal(resolveSessionTask(tasks, { provider: 'codex', session_id: 'same' }), one);
  assert.equal(one.revision, 2);
});
test('website sessions show their source and never open a terminal target', () => {
  const task = resolveSessionTask([], { provider: 'gemini', client_name: 'Gemini Website', session_id: 'web-one', cwd: 'Gemini website' });
  assert.equal(task.surface, 'web');
  assert.equal(task.name, 'Gemini Website');
});
test('changed files abort before either provider is written', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'connect-test-'));
  await mkdir(join(dir, '.gemini'));
  const file = join(dir, '.gemini/settings.json');
  await writeFile(file, '\uFEFF{"model":"original"}');
  const plan = await prepare(dir, relay, true);
  await writeFile(file, '{"model":"changed"}');
  await assert.rejects(apply(plan), /changed after preview/);
  await assert.rejects(readFile(join(dir, '.codex/hooks.json')), { code: 'ENOENT' });
  assert.equal(JSON.parse(await readFile(file, 'utf8')).model, 'changed');
});
test('apply preserves existing bytes in a backup and unrelated configuration', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'backup-test-'));
  await mkdir(join(dir, '.gemini'));
  const original = '\uFEFF' + JSON.stringify({model: 'original', hooks: {Notification: [{hooks: [
    {command: 'other'}, {type: 'command', command: `"${relay}" --provider gemini Notification`, timeout: 3000}
  ]}]}});
  const file = join(dir, '.gemini/settings.json');
  await writeFile(file, original);
  const backups = await apply(await prepare(dir, relay, true));
  assert.equal(await readFile(backups[0], 'utf8'), original);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).model, 'original');
});
