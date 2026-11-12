// The composer's side of dictation (herdr-app/mods/chat/dictation.js): where
// the text went, the spaces around it, and what a click on the microphone does.
import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error: a mod module, plain JS without types
import { dictationOp, dictationSpaces, editEnd } from "../../herdr-app/mods/chat/dictation.js";

/** The composer's flow: the text goes in at `at`, then a space where a word touches either end. */
function dictate(draft: string, at: number, text: string): string {
  const after = draft.slice(0, at) + text + draft.slice(at);
  const end = editEnd(draft, after);
  const start = end - text.length;
  const { lead, trail } = dictationSpaces(after, start, end);
  return after.slice(0, start) + (lead ? " " : "") + text + (trail ? " " : "") + after.slice(end);
}

test("dictated text: no space in an empty composer, after a space or a newline", () => {
  assert.equal(dictate("", 0, "hello"), "hello");
  assert.equal(dictate("fix this ", 9, "now"), "fix this now");
  assert.equal(dictate("line one\n", 9, "line two"), "line one\nline two");
});

test("dictated text: a space where a word touches either end", () => {
  assert.equal(dictate("fix this", 8, "now"), "fix this now");
  assert.equal(dictate("please", 0, "hello"), "hello please");
  assert.equal(dictate("ab", 1, "x"), "a x b");
  assert.equal(dictate("a  b", 2, "x"), "a x b");
});

test("dictated text: the edit says where it went, even when it repeats the text around it", () => {
  assert.equal(dictate("go go", 2, "go"), "go go go");
  assert.equal(dictate("hello", 5, "hello"), "hello hello");
});

test("the microphone: starts when idle or after an error, stops while recording, waits while transcribing", () => {
  assert.equal(dictationOp(null), null);
  assert.equal(dictationOp({ tool: "voxtype", state: "idle" }), "voice_start");
  assert.equal(dictationOp({ tool: "voxtype", state: "error", error: "busy" }), "voice_start");
  assert.equal(dictationOp({ tool: "voxtype", state: "recording" }), "voice_stop");
  assert.equal(dictationOp({ tool: "voxtype", state: "transcribing" }), null);
});
