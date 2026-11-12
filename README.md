# herdr-chat

[![CI](https://github.com/ChmaraX/herdr-chat/actions/workflows/ci.yml/badge.svg)](https://github.com/ChmaraX/herdr-chat/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ChmaraX/herdr-chat)](https://github.com/ChmaraX/herdr-chat/releases/latest)
[![License](https://img.shields.io/github/license/ChmaraX/herdr-chat)](LICENSE)

<p align="center">
  <a href="#features">features</a> · <a href="#install">install</a> · <a href="#quick-start">quick start</a> · <a href="#keys">keys</a> · <a href="#configuration">configuration</a> · <a href="#limitations">limitations</a> · <a href="CHANGELOG.md">changelog</a>
</p>

A native chat for **Pi, Claude Code and Codex** in the
[Herdr](https://herdr.dev) desktop app, in place of their terminal UIs. Each
agent is the CLI you already use, with your login, settings, extensions,
skills and sessions. The chat only draws it.

https://github.com/user-attachments/assets/cefe4c53-19f6-4c3b-8188-f8480f4c2816

> **Pairs well with**
> - [herdr-gitview](https://github.com/ChmaraX/herdr-gitview): review, stage, and commit agent changes
> - [herdr-nvim](https://github.com/ChmaraX/herdr-nvim): a persistent nvim sidebar, one key away

## Features

- **One chat for three agents** - the same timeline, keys and pickers for Pi,
  Claude Code and Codex. Each control shows only where the agent supports it.
- **Readable answers** - streaming markdown, highlighted code, Mermaid
  diagrams you can zoom, and tool cards with diffs and exit codes.
- **Approvals** - allow once, always, or deny with a reason, by key.
- **Steer or queue** - while the agent works, Enter steers it and ⌥Enter
  queues a follow-up. Queued messages can be edited, moved or removed.
- **Pickers** - model, thinking effort and permission mode, from the chips
  under the composer or by key.
- **Slash commands and skills** - your commands, prompt templates and
  skills, plus the built-ins (`/model`, `/compact`, `/resume`, `/fork`,
  `/tui`…). A skill becomes a pill in your message.
- **The agent's own screens** - `/login`, `/settings` and the commands that
  only exist in the agent's terminal UI open in the chat's place in its tab.
  `/tui` continues the session there. When the terminal UI ends, the chat
  shows again in the same place and resumes the session.
- **`/fork`** - a new session up to any earlier message, with that message
  back in the composer.
- **Dictation** - speak your message: the microphone in the composer, the
  dictate key or `/voice`. voxtype transcribes on your machine
  ([Dictation](#dictation)).
- **Continue as chat** - right-click a running Pi, Claude Code or Codex
  terminal → **Continue as chat**: the chat takes over its session. The
  switch key (Ctrl+Shift+I, ⇧⌘I on macOS) does it too. In the chat, the same
  key puts the terminal UI in the chat's place; in that terminal UI, it puts
  the chat back. One view shows at a time, in one place in the tab.
- **Sub-agent chats** - your agents start their helpers as chats. Click a
  helper's row in the agents list to read along or type to it.
- **A normal Herdr agent** - each chat has a status in the agents list and
  tab bar, `hc send` reaches it and `hc read` prints its transcript.

## Requirements

- The **Herdr desktop app** (0.1.12 or later), and herdr-core (`hc`) on
  `PATH`.
- **Node 20** or later.
- At least one agent on `PATH`, signed in: `pi` (1.5 or later), `claude` or
  `codex`.
- **macOS or Linux.** On Linux, also:
  - `wl-paste` (Wayland) or `xclip` (X11), to paste a copied image;
  - ImageMagick (`magick`, or `identify` and `convert`), to downscale a large
    image before it goes to the agent. Without it, the image goes as it is.

  The keys differ: Linux has its own chords, with Ctrl in place of ⌘ and
  often Alt added ([Keys](#keys)).

## Install

With the Herdr app open:

```sh
curl -fsSL https://raw.githubusercontent.com/ChmaraX/herdr-chat/main/install.sh | sh -s -- --app
```

It downloads the release, checks it, adds its mods, binds the launcher key (⌘I
on macOS, Ctrl+Alt+Shift+P on Linux) where it's free, and points the agents
list and the right-click menu at the chat. No clone, no npm install. Or ask
the agent in your Herdr window to "add the mod at
github.com/ChmaraX/herdr-chat".

- **Update:** run the same command again. Open chats keep the old version
  until you reopen them.
- **Uninstall:** the same command with `--uninstall`. It puts back exactly
  what install changed.
- **Options:** `--no-subagents` (no sub-agent templates or notes),
  `--no-layout` (leave your layout alone). The full list of what install
  changes is in [herdr-app/RECIPE.md](herdr-app/RECIPE.md).

## Quick start

1. **Open a chat.** ⌘I (Ctrl+Alt+Shift+P on Linux), then **P**i, **C**laude
   Code or Code**X**. It opens in a new tab, in the focused terminal's folder.
2. **Talk to it.** Enter sends. `@` finds files; paste or drop an image to
   attach it. While it works, Enter steers and ⌥Enter (Alt+Enter) queues;
   Esc stops.
3. **Pick a model or effort.** Click the chips under the composer, or
   `/model` and `/thinking`.
4. **Approve.** An approval card takes 1, 2 or 3: allow once, always, deny.
5. **Go further.** `/fork` from an earlier message, `/resume` another
   session, `/tui` for the agent's own terminal UI on the same session.

## Keys

| macOS | Linux, Windows | Where | What |
|---|---|---|---|
| ⌘I | Ctrl+Alt+Shift+P | anywhere | The launcher (⌘J A when ⌘I is taken) |
| Enter / ⌥Enter | Enter / Alt+Enter | composer | Send; while the agent works, steer / queue a follow-up |
| Esc, ⌃C | Esc, Ctrl+C | chat | Stop the run (Esc also closes a menu or dialog) |
| ⇧⌘M / ⇧⌘T / ⇧⌘A | Ctrl+Shift+M / Ctrl+Alt+Shift+T / Ctrl+Shift+A | chat | Model, effort, permission-mode picker |
| ⇧Tab | Shift+Tab | composer | Next permission mode (next thinking level for Pi) |
| ⌥⌘T | Ctrl+Alt+T | chat | `/tui` |
| ⇧⌘I | Ctrl+Shift+I | chat, agent terminal | Switch: in the chat, `/tui`; in a Pi, Claude Code or Codex terminal, Continue as chat; in a chat's `/tui` terminal, back to the chat |
| ⇧⌘R | Ctrl+Shift+R | chat | Resume another session |
| ⇧⌘N | Ctrl+Alt+Shift+N | chat | A new chat with the same agent, same folder |
| ⇧⌘D | Ctrl+Shift+D | chat | Dictate: start, or stop and transcribe ([Dictation](#dictation)) |

Change them, or bind a key per agent, in
`~/.config/herdr-app/data/herdr-chat/keys.json`:
[herdr-app/mods/chat/KEYS.md](herdr-app/mods/chat/KEYS.md).

## Configuration

The model, effort, permissions, MCP servers and the rest stay in each
agent's own settings: the chat runs the same CLI you use in a terminal.
What the chat itself takes goes in
`~/.config/herdr-app/data/herdr-chat/settings.json` (install never writes
it; every key is optional):

```json
{
  "env": { "KEY": "value" },
  "pi":     { "command": "/path/to/pi", "args": ["--model", "anthropic/claude-sonnet-4-5"] },
  "claude": { "env": { "CLAUDE_CONFIG_DIR": "/path/to/config" } },
  "codex":  { "tui": ["my-wrapper", "codex"] },
  "voice":  { "tool": "auto" }
}
```

`env` is for every agent. Per agent: `command` (instead of the one install
found), `args` (added to the agent's), `env`, and `tui` (the program `/tui`
runs). `voice` sets dictation ([Dictation](#dictation)). A new chat picks
up a change.

## Dictation

You can speak a message instead of typing it. A dictation tool on your
machine records and transcribes. No audio goes to the agent or to a server.
The chat supports [voxtype](https://voxtype.io) (Linux).

### Set it up

1. Install voxtype and make sure that `voxtype` is on your `PATH`.
2. Start its daemon (`voxtype` or its systemd service). `voxtype status` must
   print `idle`.
3. Open a new chat. When the chat finds voxtype, a microphone button shows
   next to the send button.

### Dictate a message

1. Click the microphone, press the dictate key (⇧⌘D on macOS, Ctrl+Shift+D
   on Linux), or type `/voice`. The button turns red: voxtype records.
2. Speak.
3. Click the microphone again, or press the dictate key again (or type
   `/voice` again). The button shows a spinner while voxtype transcribes.
4. The text goes into the composer at the cursor. When a word touches the
   text, the chat adds a space. Edit the text, then send it as usual.

Press Esc while voxtype records or transcribes to cancel. The chat inserts no
text, and Esc does not stop the agent. When no dictation runs, Esc stops the
agent as before.

When you stop the recording with voxtype's own hotkey, the text also comes
into the chat that started it.

### When it does not work

| What you see | Why | What to do |
|---|---|---|
| No microphone button | `voice.tool` is `"off"`, or voxtype is not on `PATH` | Install voxtype, then open a new chat |
| A red alert icon in place of the microphone | The setting is wrong, or `"tool": "voxtype"` but voxtype is not on `PATH` | Hover over it to see the reason. Correct `settings.json` |
| "voxtype can't record: stopped" | The voxtype daemon does not run | Start the daemon |
| "voxtype is busy (recording)" | Another program records with voxtype | Stop that recording, then try again |

### Settings

In `settings.json` ([Configuration](#configuration)):

```json
{ "voice": { "tool": "auto" } }
```

| `tool` | What it does |
|---|---|
| `"auto"` (the default) | Uses voxtype when it is on `PATH`. If it is not, the chat shows no button |
| `"voxtype"` | Uses voxtype. If it is not on `PATH`, the button shows the reason |
| `"off"` | No dictation: no button, no `/voice` |

The chat reads the setting when it starts. To change the dictate key, set
`dictate` in `keys.json` ([KEYS.md](herdr-app/mods/chat/KEYS.md)).

## Limitations

- **Not tested on Windows.**
- **A space on another machine** opens the agent's TUI, not a chat.
- **Run the install again after a Herdr update.** The agents list and the
  right-click menu are copies of Herdr's, made at install time.
- **Continue as chat on Codex guesses the session** when Codex runs on its
  shared daemon (the default): the newest session in that folder. With
  `codex --no-daemon` it's exact.
- **Codex reports no cost**, so its meter shows tokens only.
- **Not in the command palette.** Use the keys.

## Development

```sh
git clone https://github.com/ChmaraX/herdr-chat
cd herdr-chat && npm ci            # Node 24: a checkout runs the TypeScript itself
./install.sh --app                 # installs this checkout into the running app
```

`npm test` runs the host's tests (fake agents; `LIVE=1` for the real ones),
`npm run e2e` drives a private Herdr app. How it's built:
[docs/dev/](docs/dev/), [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
