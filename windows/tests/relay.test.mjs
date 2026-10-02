import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const relay = fileURLToPath(new URL('../target/release/karbs-hook.exe',import.meta.url));
const pipe = `\\\\.\\pipe\\karbs-${process.env.COUCOU_TEST_SID}`;
async function run(provider, input) {
  const child = spawn(relay, ['--provider', provider, input.hook_event_name || 'Stop'], { windowsHide: true });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', bytes => stdout += bytes);
  child.stderr.on('data', bytes => stderr += bytes);
  const exit = once(child, 'close');
  child.stdin.end(JSON.stringify(input));
  const [code] = await exit;
  assert.equal(code, 0, stderr);
  return stdout;
}
async function withPipe(provider, input, answer) {
  let received;
  const connections = new Set();
  const server = createServer(socket => {
    connections.add(socket);
    socket.on('error', () => {});
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk;
      if (buffer.includes('\n')) {
        received = JSON.parse(buffer.split('\n')[0]);
        if (answer !== undefined) socket.end(answer ? answer + '\n' : undefined);
      }
    });
    socket.on('close', () => connections.delete(socket));
  });
  server.listen(pipe);
  await once(server, 'listening');
  try {
    const stdout = await run(provider, input);
    // Delivery is asynchronous relative to a fire-and-forget relay exiting.
    await new Promise(resolve => setTimeout(resolve, 30));
    return { stdout, received };
  } finally {
    for (const socket of connections) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
}
test('closed app does not block either provider or add a permission decision', { timeout: 5000 }, async () => {
  const started = performance.now();
  assert.equal(await run('codex', { hook_event_name: 'PermissionRequest', tool_input: { command: 'echo hi' } }), '');
  assert.deepEqual(JSON.parse(await run('gemini', { hook_event_name: 'BeforeTool' })), {});
  assert.ok(performance.now() - started < 2500);
});
test('real Windows pipe forwards sanitized Gemini events with valid empty output', { timeout: 5000 }, async () => {
  const { received, stdout } = await withPipe('gemini', { hook_event_name: 'BeforeTool', session_id: 'gemini-one',
    tool_name: 'write_file', tool_input: { file_path: 'E:/example.txt', content: 'private contents' }, tool_response: 'secret' });
  assert.equal(received.provider, 'gemini');
  assert.equal(received.hook_event_name, 'PreToolUse');
  assert.equal(received.session_id, 'gemini-one');
  assert.equal(received.tool_input.content, undefined);
  assert.equal(received.tool_response, undefined);
  assert.deepEqual(JSON.parse(stdout), {});
});
test('Codex allow and deny use the official PermissionRequest output schema', { timeout: 5000 }, async () => {
  for (const answer of ['allow', 'deny']) {
    const { received, stdout } = await withPipe('codex', { hook_event_name: 'PermissionRequest', session_id: 'codex-one',
      tool_name: 'Bash', tool_input: { command: 'echo hello' } }, answer);
    assert.equal(received.provider, 'codex');
    const result = JSON.parse(stdout).hookSpecificOutput;
    assert.equal(result.hookEventName, 'PermissionRequest');
    assert.equal(result.decision.behavior, answer);
  }
});
test('permission pipe closing without a decision falls back to the terminal', { timeout: 5000 }, async () => {
  const { stdout } = await withPipe('codex', { hook_event_name: 'PermissionRequest', tool_input: { command: 'echo hi' } }, '');
  assert.equal(stdout, '');
});
