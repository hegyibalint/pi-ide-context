import * as vscode from 'vscode';
import { SOCKET_ENV, startBridge } from '../../protocol/index.js';
import { editorSnapshot } from './snapshot.js';

let bridge;

export async function activate(context) {
  const output = vscode.window.createOutputChannel('Pi IDE Context');
  context.subscriptions.push(output);
  const env = context.environmentVariableCollection;
  env.persistent = false;
  env.delete(SOCKET_ENV);

  let unavailable;
  if (vscode.env.remoteName || !['darwin', 'linux'].includes(process.platform)) {
    unavailable = 'Pi IDE Context supports local macOS and Linux windows only.';
  } else {
    try {
      bridge = await startBridge(() => editorSnapshot(vscode), (error) => output.appendLine(String(error)));
      env.replace(SOCKET_ENV, bridge.path);
      output.appendLine('Editor context is available to new integrated terminals in this window.');
    } catch (error) {
      await deactivate();
      output.appendLine(String(error));
      unavailable = 'Pi IDE Context could not start. See the Pi IDE Context output channel.';
    }
  }

  context.subscriptions.push(vscode.commands.registerCommand('piIdeContext.openTerminal', () => {
    if (!bridge) {
      void vscode.window.showWarningMessage(unavailable);
      return;
    }
    vscode.window.createTerminal({ name: 'Pi IDE Context', env: { [SOCKET_ENV]: bridge.path } }).show();
  }));
}

export async function deactivate() {
  const current = bridge;
  bridge = undefined;
  await current?.close();
}
