import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./harness.ts";
// @ts-expect-error: a mod module, plain JS without types
import { keyLabel, platformDefaults } from "../../herdr-app/mods/chat/chords.js";

const raw = JSON.parse(readFileSync(join(ROOT, "herdr-app", "mods", "chat", "keys.default.json"), "utf8"));
const chordsOf = (d: Record<string, unknown>) =>
  Object.entries(d).flatMap(([a, v]) => (typeof v === "string" ? [v] : Array.isArray(v) ? v : []).map((k) => [a, k] as [string, string]));

// Herdr 0.1.15's global keys with Ctrl, as it ships keys.json. A chat default must not take one of them.
const HERDR_CTRL = [
  "ctrl-+", "ctrl-,", "ctrl--", "ctrl-0", "ctrl-1", "ctrl-2", "ctrl-3", "ctrl-4", "ctrl-5", "ctrl-6", "ctrl-7", "ctrl-8", "ctrl-9", "ctrl-=", "ctrl-?",
  "ctrl-alt-e", "ctrl-alt-i", "ctrl-alt-n", "ctrl-alt-u", "ctrl-pagedown", "ctrl-pageup", "ctrl-shift-/", "ctrl-shift-?", "ctrl-shift-b", "ctrl-shift-e",
  "ctrl-shift-k", "ctrl-shift-l", "ctrl-shift-n", "ctrl-shift-o", "ctrl-shift-p", "ctrl-shift-pagedown", "ctrl-shift-pageup", "ctrl-shift-t",
  "ctrl-shift-tab", "ctrl-shift-w", "ctrl-shift-x", "ctrl-shift-z", "ctrl-tab",
];
// The launcher, which install puts in Herdr's keys.json off macOS (install/keys.ts).
const LAUNCHER = "ctrl-alt-shift-p";

test("keys on macOS: the shipped cmd chords, no notMacos section", () => {
  const mac = platformDefaults(raw, true);
  assert.equal(mac.model, "cmd-shift-m");
  assert.equal(mac.newChat, "cmd-shift-n");
  assert.ok(!("notMacos" in mac));
  assert.equal(keyLabel("cmd-shift-m", true), "⇧⌘M");
  assert.equal(keyLabel("cmd-alt-t", true), "⌥⌘T");
});

test("keys on Linux: Ctrl instead of Super, none of Herdr's keys, labels in words", () => {
  const linux = platformDefaults(raw, false);
  const all = chordsOf(linux);
  assert.ok(!("notMacos" in linux));
  assert.deepEqual(all.filter(([, k]) => /(^|[- ])cmd-/.test(k)), [], "no default uses cmd (the Super key, which the window manager takes)");
  for (const [action, k] of chordsOf(raw).filter(([, k]) => k.includes("cmd-"))) assert.ok(linux[action] !== k, `${action} has a Linux chord`);
  assert.deepEqual(all.filter(([, k]) => HERDR_CTRL.includes(k) || k === LAUNCHER), [], "no default is one of Herdr's keys");
  const used = all.map(([, k]) => k);
  assert.equal(new Set(used).size, used.length, "no chord is the default of two actions");
  assert.equal(linux.model, "ctrl-shift-m");
  assert.equal(linux.stop, "ctrl-c");
  assert.equal(keyLabel("ctrl-shift-m", false), "Ctrl+Shift+M");
  assert.equal(keyLabel("ctrl-alt-shift-t", false), "Ctrl+Alt+Shift+T");
  assert.equal(keyLabel("alt-enter", false), "Alt+Enter");
});
