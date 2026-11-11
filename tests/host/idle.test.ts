// Continue as chat closes the TUI's pane once the shell that started the agent is back
// at its prompt (herdr-app/mods/new-chat/idle.js).
import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error: a mod module, plain JS without types
import { parentPid, shellIsBack } from "../../herdr-app/mods/new-chat/idle.js";

const live = (pid: number, fg: number) => ({ pid, state: "live", foreground: { pid: fg, argv: ["zsh"] } });

test("continue as chat: a nested shell (bash that started zsh) back at its prompt counts as idle", () => {
  assert.equal(shellIsBack(live(100, 200), 200), true, "zsh, the agent's parent, is in front again");
  assert.equal(shellIsBack(live(100, 100), 200), true, "the terminal's own shell is in front");
});

test("continue as chat: another program in front keeps the pane", () => {
  assert.equal(shellIsBack(live(100, 300), 200), false, "a program the shell started after the agent");
  assert.equal(shellIsBack(live(100, 200), null), false, "without the agent's parent, only the terminal's shell counts");
});

test("continue as chat: a terminal that ended or can't be read counts as idle", () => {
  assert.equal(shellIsBack(null, 200), true);
  assert.equal(shellIsBack({ pid: 100, state: "finished" }, 200), true);
  assert.equal(shellIsBack({ pid: 100, state: "live", foreground: null }, 200), true);
});

test("ps output to a parent pid", () => {
  assert.equal(parentPid(" 1425884\n"), 1425884);
  assert.equal(parentPid(""), null);
  assert.equal(parentPid("1"), null, "init is no shell");
  assert.equal(parentPid(undefined), null);
});
