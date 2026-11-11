# Chat shortcuts

The chat binds these keys in its own key context only: they work while the
chat pane has the keyboard, never in a terminal pane, and none of them is one
of Herdr's keys or a key in the shipped `keys.json`. The one exception is
`switch`, which install also binds for terminals (see below). The same actions work for
every agent. An action the agent can't do (permission modes for Pi, effort for
a model without levels) says so in the hint line under the composer.

| Action | macOS | Linux, Windows | What it does |
|---|---|---|---|
| `steer` | ↩ (`enter`) | Enter (`enter`) | Sends the message. While the agent works, it **steers**: the message joins the blue "Steer: next turn" lane and reaches the agent at its next step. |
| `followUp` | ⌥↩ (`alt-enter`) | Alt+Enter (`alt-enter`) | Sends the message. While the agent works, it **queues a follow-up**: the message waits in the yellow "Follow-up: after this run" lane and is sent when the run ends, one per run. |
| `model` | ⇧⌘M (`cmd-shift-m`) | Ctrl+Shift+M (`ctrl-shift-m`) | Opens the model picker. Press it again to close the picker. |
| `effort` | ⇧⌘T (`cmd-shift-t`) | Ctrl+Alt+Shift+T (`ctrl-alt-shift-t`) | Opens the thinking-level (effort) picker. |
| `cycleEffort` | none | none | Switches to the next thinking level the model allows, wrapping around, and says it in the hint line ("Thinking: high"). It works only in the composer, and not while a menu is open. |
| `mode` | ⇧⌘A (`cmd-shift-a`) | Ctrl+Shift+A (`ctrl-shift-a`) | Opens the permission-mode picker (Claude Code, Codex). |
| `cycleMode` | ⇧⇥ (`shift-tab`) | Shift+Tab (`shift-tab`) | Switches to the next permission mode. For an agent with no permission modes (Pi), it switches to the next thinking level. It works only in the composer, and not while a menu is open. |
| `stop` | ⌃C (`ctrl-c`) | Ctrl+C (`ctrl-c`) | Stops the agent's run. Esc stops it too. |
| `tui` | ⌥⌘T (`cmd-alt-t`) | Ctrl+Alt+T (`ctrl-alt-t`) | Continues the chat in the agent's own terminal UI (`/tui`). |
| `switch` | ⇧⌘I (`cmd-shift-i`) | Ctrl+Shift+I (`ctrl-shift-i`) | One key for both ways. In the chat it is `/tui`. In a terminal it is Herdr's key (see [The switch key](#the-switch-key)). |
| `resume` | ⇧⌘R (`cmd-shift-r`) | Ctrl+Shift+R (`ctrl-shift-r`) | Opens the sessions picker (`/resume`). |
| `latest` | ⇧⌘B (`cmd-shift-b`) | Ctrl+Alt+Shift+B (`ctrl-alt-shift-b`) | Scrolls to the latest message. |
| `focusComposer` | ⌘L (`cmd-l`) | Ctrl+L (`ctrl-l`) | Puts the keyboard back in the composer and closes an open picker. |
| `newChat` | ⇧⌘N (`cmd-shift-n`) | Ctrl+Alt+Shift+N (`ctrl-alt-shift-n`) | Opens a new chat tab with the same agent in the same folder. |

`steer` and `followUp` work in the composer only. In a menu Enter picks, and
on an approval card with nothing typed it answers. Shift+Enter is always a new
line. If you unbind `steer` (or move it to another chord), Enter in the composer
types a new line.

## The switch key

`switch` is a chat key and a terminal key with one chord. In the chat it
does what `tui` does. `./install.sh` also binds the chord in the `terminal`
section of Herdr's `keys.json` to `new-chat.switch`, so the same chord works
when a terminal has the keyboard:

- In a terminal that runs Pi, Claude Code or Codex (idle or done): Continue
  as chat. The chat takes the terminal's place, on the same session.
- In a chat's own `/tui` terminal (the dialog over the chat): the terminal
  UI closes and the chat continues the session. While the agent works, it
  says to wait for the run to end.
- In any other terminal: a notice says that it is not an agent's TUI. The
  program does not get the key.

Set it at the top level, like the other chat keys. `null` unbinds it in the
chat and in terminals. Run `./install.sh` again after a change:

```json
{ "switch": "ctrl-alt-s" }
```

If the default chord already has an action in Herdr's `keys.json` (in its
`terminal` or `global` section), install leaves it there and says so: the
switch then works in the chat only. A chord you choose replaces what had it in
a terminal, and uninstall puts that back. With `--no-layout`, the terminal
side is not bound (it needs the layout's new-chat copy).

The unsent draft does not move between the chat and the terminal UI. The
chat's composer keeps its text while the terminal UI is open, so it is still
there when you come back. Text typed in a terminal UI stays there.

## The queue

The lanes above the composer hold what you sent while the agent works, oldest
first. On each row you can:
- click it: the text (and its images) goes back into the composer and leaves
  the queue. Sending puts it back: a follow-up back with the follow-ups, a
  steer as a steer;
- ⇄: a follow-up steers now; a steer waits for the run's end instead;
- ×: remove it.

Esc while the agent works stops it, and both lanes come back into the composer.

A steer that the agent already has can't always be taken back. Pi and Claude
Code let it go until the agent takes it. Codex has no way back, so its steer
rows have no ×, ⇄ or click. Follow-ups always do: the chat holds them, not
the agent.

The keys that open a chat (the launcher, ⌘I by default, and one per agent)
aren't chat keys: they are Herdr's global keys. Set them in the `"global"`
part of the same file, then run `./install.sh` again (it puts them in Herdr's
`keys.json`):

```json
{ "global": { "open": "cmd-i", "pi": "cmd-j p", "claude": null, "codex": null } }
```

`open` is the launcher (`mod.open:new-chat`), `pi`/`claude`/`codex` open that
agent's chat at once (`new-chat.pi`…). Left out: the default (⌘I for `open`,
⌘J A when ⌘I is taken; the others unbound). A chord you choose replaces what
had it, and uninstall puts that back. In the launcher, P, C and X pick.

macOS turns ⌘. into Esc before an app sees it, so `stop` uses ⌃C.

Off macOS, ⌘ is the Super key, which the window manager takes first, so the
defaults use Ctrl there (the `notMacos` section of `keys.default.json`). Where
Herdr already uses the Ctrl chord (Ctrl+Shift+T opens a tab, Ctrl+Shift+B and
Ctrl+Shift+N are Herdr's too), the chat's default adds Alt.

## Your own keys

Put your overrides in `~/.config/herdr-app/data/herdr-chat/keys.json`. It uses the
same shape as `keys.default.json` in this folder:

```json
{
  "model": "cmd-shift-y",
  "stop": null,
  "latest": ["cmd-shift-b", "cmd-shift-down"]
}
```

- A string binds one chord. A list binds several.
- `null` unbinds the action.
- Actions you leave out keep their defaults.
- Chords use Herdr's spelling: `cmd`, `ctrl`, `alt`, `shift`, joined with `-`.
  A space separates the steps of a sequence.
- A chord you give one action leaves the action that has it by default. For
  example `{"cycleEffort": "shift-tab"}` takes Shift+Tab from `cycleMode`, so
  you don't have to unbind `cycleMode` too.
- If a chord is invalid, only its own action loses its binding. The chat's
  debug dump lists the error under `keyErrors`, along with a chord you bound
  to two actions.

Pi's TUI keys, for example:

```json
{
  "model": "ctrl-l",
  "cycleEffort": "shift-tab",
  "cycleMode": null
}
```

Nothing in the composer binds ⌃L, so `ctrl-l` reaches the chat's action.

The chat reads the file when it starts. After you edit it, restart the app.
A mod reload rebinds your keys too, but a key that you removed can stay bound
until the app restarts.

Tooltips (the model, effort and mode chips, the Stop button), picker titles and
the `/` menu (`/model`, `/thinking`, `/resume`, `/tui`) show the key that is
bound now.
