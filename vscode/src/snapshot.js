import { isLocalFilePath, MAX_SELECTION_CHARS, MAX_TABS } from '../../protocol/index.js';

function filePath(uri) {
  return uri?.scheme === 'file' && isLocalFilePath(uri.fsPath) ? uri.fsPath : undefined;
}

function position(value) {
  return { line: value.line + 1, column: value.character + 1 };
}

export function editorSnapshot(vscode) {
  const editor = vscode.window.activeTextEditor;
  const path = filePath(editor?.document.uri);
  let activeFile = null;
  if (path) {
    const { document, selection } = editor;
    activeFile = {
      path,
      cursor: position(selection.active),
      selection: selection.isEmpty ? null : { start: position(selection.start), end: position(selection.end) },
    };
    if (activeFile.selection && !document.isDirty &&
        vscode.workspace.getConfiguration('piIdeContext').get('shareSelectedText', false)) {
      const start = document.offsetAt(selection.start);
      const end = document.offsetAt(selection.end);
      const capped = Math.min(end, start + MAX_SELECTION_CHARS);
      activeFile.selectedText = document.getText(new vscode.Range(selection.start, document.positionAt(capped)))
        .replace(/[\uD800-\uDBFF]$/u, '');
      activeFile.selectionTruncated = capped < end;
    }
  }

  const openTabs = new Set();
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (!(tab.input instanceof vscode.TabInputText)) continue;
      const path = filePath(tab.input.uri);
      if (path) openTabs.add(path);
      if (openTabs.size >= MAX_TABS) break;
    }
    if (openTabs.size >= MAX_TABS) break;
  }
  return { activeFile, openTabs: [...openTabs] };
}
