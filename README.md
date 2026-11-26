# Pi IDE Context

Give [Pi](https://pi.dev/) the editor context from the VS Code window where you launched it, without running Codex. Supports local desktop VS Code on macOS and Linux. Tested against Pi 1.6.0; requires VS Code 1.90 or newer.

## Install

1. Download `pi-ide-context-0.1.0.vsix` from the [GitHub release](https://github.com/hegyibalint/pi-ide-context/releases/tag/v0.1.0). In VS Code, run **Extensions: Install from VSIX…** from the Command Palette, or run `code --install-extension path/to/pi-ide-context-0.1.0.vsix`.
2. Install the Pi companion directly from GitHub:

   ```sh
   pi install git:github.com/hegyibalint/pi-ide-context@v0.1.0
   ```

3. Open a **new** VS Code integrated terminal and start `pi`. Run `/pi-ide` to see exactly what the editor is sharing. If an early or restored terminal missed the variable, use **Pi IDE Context: Open Integrated Terminal** from the Command Palette.

If you already use a Codex-backed Pi context extension, disable that extension to avoid attaching context twice.

## What gets shared

Pi pulls a snapshot before an ordinary prompt starts an agent run. It includes the active local file path, cursor and primary selection coordinates, and up to 24 local file tabs. Coordinates are one-based; columns are UTF-16 offsets plus one. There are no editor-change subscriptions, background polling, or network calls by the bridge.

The **Pi IDE Context: Share Selected Text** setting is off by default. Turn it on in your user settings to include up to 4,000 UTF-16 code units from the primary selection in an unmodified saved file. Unsaved buffers and text from dirty editors are never sent. **Attached context is part of the Pi session and can be sent to your model provider**; Pi displays a “VS Code context attached” entry with expandable details. `/pi-ide off` or `/pi-ide on` changes auto-attachment for the current Pi session. `/pi-ide` itself previews context locally without sending it to the model.

Each VS Code window uses its own Unix socket in a user-private directory and passes `PI_VSCODE_SOCKET` to newly launched integrated shells. Opening the same folder twice or running `cd` doesn’t change which window a shell points to. Existing shells can’t be updated in place. After reloading the VS Code window or restarting its extension host, open a new terminal if the old one points to a stale socket. External terminals without the variable keep working normally. Remote SSH, WSL, Dev Containers, browser VS Code, and Windows are not supported in this release.

## Development

```sh
npm test
npm ci --prefix vscode
npm run package --prefix vscode
pi -e "$PWD"
```

The `.vsix` is generated under `vscode/`. Pi loads the root package directly; the VS Code bundle is built separately. See [the protocol](protocol/README.md) for the socket contract. GitHub Actions tests and packages changes, and publishes the VSIX on matching `v*` tags. Keep the two manifest versions in sync before tagging.

### Two-window smoke test

1. Open the same folder in two trusted VS Code windows. Open a different file in each.
2. Open a new integrated terminal in each and run `printenv PI_VSCODE_SOCKET`. Both values should be set and different.
3. Start Pi in each shell. Run `/pi-ide` and verify the active file matches the window, then send a prompt and check that the attachment is visible.
4. Start Pi from an external terminal. `/pi-ide` should report no connection and ordinary prompts should still work.
