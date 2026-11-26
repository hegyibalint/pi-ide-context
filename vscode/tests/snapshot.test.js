import assert from 'node:assert/strict';
import { test } from 'node:test';
import { editorSnapshot } from '../src/snapshot.js';

const at = (character) => ({ line: 0, character });
const uri = (fsPath, scheme = 'file') => ({ fsPath, scheme });
const text = 'x'.repeat(3999) + '😀tail';

function editor({ share = false, dirty = false, scheme = 'file' } = {}) {
  class TabInputText {
    constructor(uri) { this.uri = uri; }
  }
  class Range {
    constructor(start, end) { Object.assign(this, { start, end }); }
  }
  const tabs = ['/repo/active.js', '/repo/active.js', '/repo/extra.js'].map((path) => ({ input: new TabInputText(uri(path)) }));
  tabs.push({ input: new TabInputText(uri('/virtual', 'untitled')) });
  return {
    Range,
    TabInputText,
    window: {
      activeTextEditor: {
        document: {
          uri: uri('/repo/active.js', scheme),
          isDirty: dirty,
          offsetAt: ({ character }) => character,
          positionAt: at,
          getText({ start, end }) {
            assert.ok(share && !dirty, 'must not read buffer text without opt-in and a clean file');
            return text.slice(start.character, end.character);
          },
        },
        selection: { start: at(0), end: at(text.length), active: at(0), isEmpty: false },
      },
      tabGroups: { all: [{ tabs }] },
    },
    workspace: { getConfiguration: () => ({ get: () => share }) },
  };
}

test('default snapshot includes only editor metadata and deduplicates local tabs', () => {
  assert.deepEqual(editorSnapshot(editor()), {
    activeFile: {
      path: '/repo/active.js',
      cursor: { line: 1, column: 1 },
      selection: { start: { line: 1, column: 1 }, end: { line: 1, column: text.length + 1 } },
    },
    openTabs: ['/repo/active.js', '/repo/extra.js'],
  });
});

test('selected text requires opt-in and a clean local file; truncation does not split a surrogate pair', () => {
  const result = editorSnapshot(editor({ share: true }));
  assert.equal(result.activeFile.selectedText, 'x'.repeat(3999));
  assert.equal(result.activeFile.selectionTruncated, true);
  assert.equal(editorSnapshot(editor({ share: true, dirty: true })).activeFile.selectedText, undefined);
  assert.equal(editorSnapshot(editor({ share: true, scheme: 'untitled' })).activeFile, null);
});

test('missing active editor and more than 24 tabs', () => {
  const vscode = editor();
  vscode.window.activeTextEditor = undefined;
  vscode.window.tabGroups.all[0].tabs = Array.from({ length: 30 }, (_, i) => ({ input: new vscode.TabInputText(uri(`/repo/tab-${i}`)) }));
  const result = editorSnapshot(vscode);
  assert.equal(result.activeFile, null);
  assert.equal(result.openTabs.length, 24);
});
