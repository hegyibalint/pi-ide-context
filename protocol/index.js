import { lstat, mkdtemp, chmod, rmdir } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { isAbsolute, dirname, join } from 'node:path';

export const SOCKET_ENV = 'PI_VSCODE_SOCKET';
export const PROTOCOL_VERSION = 1;
export const MAX_TABS = 24;
export const MAX_PATH_CHARS = 2048;
export const MAX_SELECTION_CHARS = 4000;
const MAX_REQUEST_BYTES = 256;
const MAX_RESPONSE_BYTES = 384 * 1024;
const REQUEST = { version: PROTOCOL_VERSION, method: 'snapshot' };

function encode(value) {
  return JSON.stringify(value) + '\n';
}

// Each connection carries exactly one bounded JSON line in each direction.
function readFrame(socket, maxBytes, receive, invalid) {
  let size = 0;
  const chunks = [];
  function onData(chunk) {
    const newline = chunk.indexOf(10);
    size += newline === -1 ? chunk.length : newline;
    if (size > maxBytes || (newline !== -1 && newline !== chunk.length - 1)) {
      socket.off('data', onData);
      invalid();
      return;
    }
    chunks.push(newline === -1 ? chunk : chunk.subarray(0, newline));
    if (newline === -1) return;
    socket.off('data', onData);
    let value;
    try {
      value = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
    } catch {
      invalid();
      return;
    }
    receive(value);
  }
  socket.on('data', onData);
}

export function isLocalFilePath(path) {
  return typeof path === 'string' && path.length <= MAX_PATH_CHARS && isAbsolute(path) && !path.includes('\0');
}

function isPosition(position) {
  return Number.isSafeInteger(position?.line) && position.line >= 1 &&
    Number.isSafeInteger(position?.column) && position.column >= 1;
}

function isSnapshot(snapshot) {
  if (!Array.isArray(snapshot?.openTabs) || snapshot.openTabs.length > MAX_TABS ||
      !snapshot.openTabs.every(isLocalFilePath)) return false;
  const editor = snapshot.activeFile;
  if (editor === null) return true;
  return isLocalFilePath(editor?.path) && isPosition(editor.cursor) &&
    (editor.selection === null || (isPosition(editor.selection?.start) && isPosition(editor.selection.end))) &&
    (editor.selectedText === undefined || (editor.selection !== null && typeof editor.selectedText === 'string' &&
      editor.selectedText.length <= MAX_SELECTION_CHARS && typeof editor.selectionTruncated === 'boolean'));
}

export async function startBridge(snapshot, onError = () => {}) {
  // Keep the path short: Darwin's Unix socket path limit is only 104 bytes.
  const directory = await mkdtemp('/tmp/pi-ide-');
  const path = join(directory, 'context.sock');
  const connections = new Set();
  const server = createServer((socket) => {
    connections.add(socket);
    const deadline = setTimeout(() => socket.destroy(), 1000);
    deadline.unref();
    socket.on('error', () => socket.destroy());
    socket.once('close', () => {
      clearTimeout(deadline);
      connections.delete(socket);
    });
    readFrame(socket, MAX_REQUEST_BYTES, (request) => {
      if (request?.version !== PROTOCOL_VERSION || request.method !== REQUEST.method) {
        socket.end(encode({ version: PROTOCOL_VERSION, error: 'Unsupported request' }));
        return;
      }
      try {
        const context = snapshot();
        if (!isSnapshot(context)) throw new Error('Invalid editor snapshot');
        const frame = encode({ version: PROTOCOL_VERSION, context });
        if (Buffer.byteLength(frame) - 1 > MAX_RESPONSE_BYTES) throw new Error('Editor snapshot too large');
        socket.end(frame);
      } catch (error) {
        onError(error);
        socket.end(encode({ version: PROTOCOL_VERSION, error: 'Could not read editor context' }));
      }
    }, () => socket.destroy());
  });
  server.maxConnections = 16;
  let closing;
  function close() {
    return closing ??= (async () => {
      for (const socket of connections) socket.destroy();
      if (server.listening) await new Promise((resolve) => server.close(() => resolve()));
      await rmdir(directory).catch(onError);
    })();
  }
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(path, () => {
        server.off('error', reject);
        server.on('error', onError);
        resolve();
      });
    });
    await chmod(path, 0o600);
    return { path, close };
  } catch (error) {
    await close();
    throw error;
  }
}

export async function fetchSnapshot(path, timeoutMs = 200) {
  if (!path) throw new Error(`${SOCKET_ENV} is not set. Open a new VS Code integrated terminal.`);
  const uid = process.getuid?.();
  if (uid === undefined || !isLocalFilePath(path)) throw new Error('Invalid socket path');
  const directory = await lstat(dirname(path));
  if (!directory.isDirectory() || directory.uid !== uid || (directory.mode & 0o077) !== 0) {
    throw new Error('Socket directory is not private to the current user');
  }
  const entry = await lstat(path);
  if (!entry.isSocket() || entry.uid !== uid || (entry.mode & 0o077) !== 0) {
    throw new Error('Socket is not private to the current user');
  }
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    function finish(error, context) {
      clearTimeout(deadline);
      socket.destroy();
      if (error) reject(error);
      else resolve(context);
    }
    const deadline = setTimeout(() => finish(new Error('Timed out waiting for VS Code')), timeoutMs);
    socket.once('error', (error) => finish(error));
    socket.once('close', () => finish(new Error('VS Code closed the connection without a snapshot')));
    socket.once('connect', () => socket.write(encode(REQUEST)));
    readFrame(socket, MAX_RESPONSE_BYTES, (response) => {
      if (response?.version !== PROTOCOL_VERSION || !isSnapshot(response.context)) {
        finish(new Error('Invalid or incompatible VS Code response'));
      } else {
        finish(undefined, response.context);
      }
    }, () => finish(new Error('Invalid VS Code response frame')));
  });
}
