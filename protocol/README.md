# Local socket protocol (v1)

`PI_VSCODE_SOCKET` is the absolute path to the Unix-domain socket owned by the current user, inside a user-private directory. There is no TCP listener. Other processes running as the same user are not a separate security boundary.

Each connection carries one UTF-8 JSON request and one reply, each terminated by LF. The server closes the connection after the reply. Request bodies are capped at 256 bytes, responses at 384 KiB, excluding LF. A server-side connection deadline is one second; the client waits up to 200 ms after socket validation. Clients ignore incompatible or invalid replies.

Request:

```json
{"version":1,"method":"snapshot"}
```

Success:

```json
{"version":1,"context":{"activeFile":{"path":"/repo/main.js","cursor":{"line":4,"column":7},"selection":null},"openTabs":["/repo/main.js"]}}
```

`activeFile` is null when no local file is active. `selection` is null for a caret or `{ "start": { "line": 1, "column": 1 }, "end": { "line": 2, "column": 3 } }` for the primary selection. Offsets are one-based, with UTF-16 columns. The active file can optionally include `selectedText` and `selectionTruncated`. The server does not accept paths or commands in requests; it only reads its own editor state. Errors use `{ "version": 1, "error": "…" }`.
