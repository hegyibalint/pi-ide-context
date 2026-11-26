import assert from 'node:assert/strict';
import { chmod, lstat } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { dirname } from 'node:path';
import { test } from 'node:test';
import { fetchSnapshot, startBridge } from '../protocol/index.js';

function snapshot(path) {
  return { activeFile: { path, cursor: { line: 2, column: 3 }, selection: null }, openTabs: [path] };
}

async function request(path, chunks) {
  const socket = createConnection(path);
  socket.once('connect', async () => {
    for (const chunk of chunks) {
      socket.write(chunk);
      await new Promise((resolve) => setImmediate(resolve));
    }
  });
  const reply = [];
  for await (const chunk of socket) reply.push(chunk);
  return Buffer.concat(reply).toString('utf8');
}

test('two windows in the same folder use distinct sockets and only snapshot on demand', async (t) => {
  let current = snapshot('/same-repo/left.js');
  let pulls = 0;
  const left = await startBridge(() => { pulls++; return current; });
  t.after(left.close);
  const right = await startBridge(() => snapshot('/same-repo/right.js'));
  t.after(right.close);
  assert.notEqual(left.path, right.path);
  assert.equal(pulls, 0);
  assert.deepEqual(await fetchSnapshot(left.path), current);
  assert.deepEqual(await fetchSnapshot(right.path), snapshot('/same-repo/right.js'));
  current = snapshot('/same-repo/new-active.js');
  assert.deepEqual(await fetchSnapshot(left.path), current);
  assert.equal(pulls, 2);
});

test('sockets are private and removed on close; missing and stale paths are unavailable', async (t) => {
  const bridge = await startBridge(() => snapshot('/repo/file.js'));
  t.after(bridge.close);
  const directory = dirname(bridge.path);
  assert.equal((await lstat(directory)).mode & 0o777, 0o700);
  assert.equal((await lstat(bridge.path)).mode & 0o777, 0o600);
  await chmod(bridge.path, 0o666);
  await assert.rejects(fetchSnapshot(bridge.path), /not private/);
  await chmod(bridge.path, 0o600);
  await chmod(directory, 0o755);
  await assert.rejects(fetchSnapshot(bridge.path), /not private/);
  await chmod(directory, 0o700);
  await assert.rejects(fetchSnapshot(undefined), /PI_VSCODE_SOCKET/);
  await bridge.close();
  await assert.rejects(lstat(directory), { code: 'ENOENT' });
  await assert.rejects(fetchSnapshot(bridge.path), { code: 'ENOENT' });
});

test('fragmented requests work; invalid, oversized, and incompatible requests do not invoke the snapshot', async (t) => {
  let pulls = 0;
  const current = snapshot('/repo/file.js');
  const bridge = await startBridge(() => { pulls++; return current; });
  t.after(bridge.close);
  assert.deepEqual(JSON.parse(await request(bridge.path, ['{"ver', 'sion":1,"method":"snapshot"}', '\n'])).context, current);
  assert.equal(await request(bridge.path, ['{not json}\n']), '');
  assert.equal(await request(bridge.path, ['x'.repeat(257)]), '');
  const incompatible = await request(bridge.path, ['{"version":9,"method":"snapshot"}\n']);
  assert.match(JSON.parse(incompatible).error, /Unsupported/);
  assert.equal(pulls, 1);
});

test('invalid snapshots fail closed', async (t) => {
  const errors = [];
  const bridge = await startBridge(() => ({ activeFile: null, openTabs: ['relative.js'] }), (error) => errors.push(error));
  t.after(bridge.close);
  await assert.rejects(fetchSnapshot(bridge.path), /Invalid or incompatible/);
  assert.match(errors[0].message, /Invalid editor snapshot/);
});
