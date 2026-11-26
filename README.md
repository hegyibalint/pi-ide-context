# Pi IDE Context

This VS Code extension gives [Pi](https://pi.dev/) the editor context from the window where you launched it, without running Codex. Supports local desktop VS Code on macOS and Linux. Requires VS Code 1.90 or newer. The Pi client lives in [pi-extensions](https://github.com/hegyibalint/pi-extensions), not in this repo.

## Install

1. Download the `.vsix` from the [latest GitHub release](https://github.com/hegyibalint/pi-ide-context/releases/latest). In VS Code, run **Extensions: Install from VSIX…** from the Command Palette.
2. On the Pi side, install the full Pi package once:

   ```sh
   pi install git:github.com/hegyibalint/pi-extensions
   ```

   If it's already installed, run `pi update git:github.com/hegyibalint/pi-extensions` instead. If you installed the old standalone Pi companion from this repo at `v0.1.0`, remove it to avoid duplicate context.
3. Open a **new** VS Code integrated terminal and start `pi`. Run `/ide` to see exactly what the editor is sharing. If an early or restored terminal missed the variable, use **Pi IDE Context: Open Integrated Terminal** from the Command Palette.

## What gets shared

Pi pulls a snapshot before an ordinary prompt starts an agent run. It includes the active local file path, cursor and primary selection coordinates, and up to 24 local file tabs. Coordinates are one-based; columns are UTF-16 offsets plus one. There are no editor-change subscriptions, background polling, or network calls by the bridge.

The **Pi IDE Context: Share Selected Text** setting is off by default. Turn it on in your user settings to include up to 4,000 UTF-16 code units from the primary selection in an unmodified saved file. Unsaved buffers and text from dirty editors are never sent. **Attached context is part of the Pi session and can be sent to your model provider**; Pi displays a compact attachment just below your prompt, for example `IDE · src/file.c:12:5–42:9`. `/ide off` or `/ide on` changes auto-attachment for the current Pi session. `/ide` itself previews context locally without sending it to the model.

Each VS Code window uses its own Unix socket in a user-private directory and passes `PI_VSCODE_SOCKET` to newly launched integrated shells. Opening the same folder twice or running `cd` doesn’t change which window a shell points to. Existing shells can’t be updated in place. After reloading the VS Code window or restarting its extension host, open a new terminal if the old one points to a stale socket. External terminals without the variable keep working normally. Remote SSH, WSL, Dev Containers, browser VS Code, and Windows are not supported in this release.

## Development

```sh
npm test --prefix vscode
npm ci --prefix vscode --ignore-scripts
npm run package --prefix vscode
```

The `.vsix` is generated under `vscode/`. See [the protocol](protocol/README.md) for the socket contract with the Pi client. GitHub Actions tests and packages changes, and publishes the VSIX on `v*` tags that match `vscode/package.json`.

### Two-window smoke test

1. Open the same folder in two trusted VS Code windows. Open a different file in each.
2. Open a new integrated terminal in each and run `printenv PI_VSCODE_SOCKET`. Both values should be set and different.
3. Start Pi in each shell. Run `/ide` and verify the active file matches the window, then send a prompt and check that the attachment is visible.
4. Start Pi from an external terminal. `/ide` should report no connection and ordinary prompts should still work.
