// Dictation (host/voice.ts): the host runs voxtype and gives the text to the
// chat in state.voice. A fake voxtype (tests/fake-voxtype) stands in for the
// tool, so no test uses the microphone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startHost, idle, ROOT } from "./harness.ts";
import type { Host } from "./harness.ts";
import { parseVoiceSetting, planVoice } from "../../host/voice.ts";

const FAKE = join(ROOT, "tests", "fake-voxtype", "voxtype");

type Fake = { dir: string; env: Record<string, string>; calls: () => string[]; put: (name: string, text: string) => void };

function fakeVoxtype(): Fake {
  const dir = mkdtempSync(join(tmpdir(), "herdr-chat-voxtype-"));
  return {
    dir,
    env: { HERDR_CHAT_VOICE_BIN: FAKE, FAKE_VOXTYPE_DIR: dir },
    calls: () => (existsSync(join(dir, "calls.log")) ? readFileSync(join(dir, "calls.log"), "utf8").trim().split("\n") : []),
    put: (name, text) => writeFileSync(join(dir, name), text),
  };
}

async function withHost(name: string, settings: object, env: Record<string, string>, fn: (h: Host) => Promise<void>): Promise<void> {
  const h = await startHost({ name, settings, env });
  try {
    await h.client.waitFor(idle, 10_000);
    await fn(h);
  } finally {
    await h.stop();
  }
}

/** A PATH with node (for the fake agent) and no voxtype. */
function noTools(): Record<string, string> {
  const bin = mkdtempSync(join(tmpdir(), "herdr-chat-nobin-"));
  symlinkSync(process.execPath, join(bin, "node"));
  return { PATH: bin };
}

const voice = (h: Host) => h.client.state.voice;
const voiceFiles = (h: Host) => (existsSync(join(h.stateDir, "voice")) ? readdirSync(join(h.stateDir, "voice")) : []);
const builtinNames = (h: Host) => h.client.state.commands.filter((c: any) => c.source === "builtin").map((c: any) => c.name);

test("dictation: start, stop, and the text comes in state.voice until the client takes it", async () => {
  const fake = fakeVoxtype();
  fake.put("text", "hello from the microphone\n");
  await withHost("voice-text", { voice: { tool: "auto" } }, fake.env, async (h) => {
    assert.deepEqual(voice(h), { tool: "voxtype", state: "idle" });
    assert.ok(builtinNames(h).includes("voice"), "the /voice built-in");

    await h.client.req("voice_start");
    await h.client.waitFor((x) => x.state.voice?.state === "recording", 3000);
    const start = fake.calls().find((c) => c.startsWith("record start"));
    assert.match(start ?? "", /^record start --file=.+\/voice\/voice-\d+-1\.txt$/);

    await h.client.req("voice_stop");
    await h.client.waitFor((x) => x.state.voice?.text === "hello from the microphone", 5000);
    assert.deepEqual(voice(h), { tool: "voxtype", state: "idle", text: "hello from the microphone" });
    assert.deepEqual(voiceFiles(h), [], "the text files are gone");

    await h.client.req("voice_ack");
    await h.client.waitFor((x) => x.state.voice && !("text" in x.state.voice), 3000);
    assert.deepEqual(fake.calls().filter((c) => c.startsWith("record")), [start, "record stop"]);
  });
});

test("dictation: cancel stops the tool and gives no text", async () => {
  const fake = fakeVoxtype();
  fake.put("text", "never seen");
  await withHost("voice-cancel", { voice: { tool: "voxtype" } }, fake.env, async (h) => {
    await h.client.req("voice_start");
    await h.client.waitFor((x) => x.state.voice?.state === "recording", 3000);
    await h.client.req("voice_cancel");
    await h.client.waitFor((x) => x.state.voice?.state === "idle", 3000);
    assert.ok(fake.calls().includes("record cancel"));
    await new Promise((r) => setTimeout(r, 600));
    assert.deepEqual(voice(h), { tool: "voxtype", state: "idle" });
    assert.deepEqual(voiceFiles(h), []);
  });
});

test("dictation: the tool going idle with no result (its own cancel key, no words) ends with no text", async () => {
  const fake = fakeVoxtype();
  await withHost("voice-idle", { voice: { tool: "auto" } }, fake.env, async (h) => {
    await h.client.req("voice_start");
    await h.client.waitFor((x) => x.state.voice?.state === "recording", 3000);
    fake.put("state", "idle");
    await h.client.waitFor((x) => x.state.voice?.state === "idle", 5000);
    assert.deepEqual(voice(h), { tool: "voxtype", state: "idle" });
  });
});

test("dictation: a busy tool, a stopped daemon, a failing command and a failed transcription show their reason, and the next start works", async () => {
  const fake = fakeVoxtype();
  await withHost("voice-errors", { voice: { tool: "auto" } }, fake.env, async (h) => {
    const failsWith = async (re: RegExp) => {
      await assert.rejects(h.client.req("voice_start"), re);
      await h.client.waitFor((x) => x.state.voice?.state === "error", 3000);
      assert.match(voice(h).error, re);
    };

    fake.put("state", "recording");
    await failsWith(/voxtype is busy \(recording\)/);
    fake.put("state", "idle");

    fake.put("stopped", "");
    await failsWith(/voxtype can't record: stopped/);
    rmSync(join(fake.dir, "stopped"));

    fake.put("fail", "no microphone\n");
    await failsWith(/no microphone/);
    rmSync(join(fake.dir, "fail"));

    fake.put("done", '{"status":"error","error":"model not loaded"}');
    await h.client.req("voice_start");
    await h.client.waitFor((x) => x.state.voice?.state === "recording", 3000);
    await h.client.req("voice_stop");
    await h.client.waitFor((x) => x.state.voice?.state === "error", 5000);
    assert.equal(voice(h).error, "voxtype: model not loaded");
    assert.deepEqual(voiceFiles(h), []);
    rmSync(join(fake.dir, "done"));

    fake.put("text", "works again");
    await h.client.req("voice_start");
    await h.client.waitFor((x) => x.state.voice?.state === "recording" && !x.state.voice.error, 3000);
    await h.client.req("voice_stop");
    await h.client.waitFor((x) => x.state.voice?.text === "works again", 5000);
  });
});

test("dictation off, or auto with no tool on PATH: no voice state, no /voice", async () => {
  const fake = fakeVoxtype();
  await withHost("voice-off", { voice: { tool: "off" } }, fake.env, async (h) => {
    assert.equal(voice(h), null);
    assert.ok(!builtinNames(h).includes("voice"));
    await assert.rejects(h.client.req("voice_start"), /Dictation is off/);
  });
  await withHost("voice-none", {}, noTools(), async (h) => {
    assert.equal(voice(h), null);
    assert.ok(!builtinNames(h).includes("voice"));
  });
});

test("dictation set up wrong: the state says why, and the ops refuse with that reason", async () => {
  await withHost("voice-invalid", { voice: { tool: "whisper" } }, {}, async (h) => {
    assert.deepEqual(voice(h), { tool: null, state: "error", error: 'settings.json: voice.tool must be "auto", "off", "voxtype"' });
    await assert.rejects(h.client.req("voice_start"), /voice\.tool must be/);
  });
  await withHost("voice-missing", { voice: { tool: "voxtype" } }, noTools(), async (h) => {
    assert.equal(voice(h).tool, null);
    assert.match(voice(h).error, /^Dictation needs voxtype on PATH/);
  });
});

test("the voice setting: auto, off, a tool, and what is wrong with a bad one", () => {
  assert.deepEqual(parseVoiceSetting(undefined), { setting: "auto" });
  assert.deepEqual(parseVoiceSetting({}), { setting: "auto" });
  assert.deepEqual(parseVoiceSetting({ tool: "off" }), { setting: "off" });
  assert.deepEqual(parseVoiceSetting({ tool: "voxtype" }), { setting: "voxtype" });
  assert.deepEqual(parseVoiceSetting({ tool: "whisper" }), { error: 'settings.json: voice.tool must be "auto", "off", "voxtype"' });
  assert.deepEqual(parseVoiceSetting({ tool: "auto", lang: "en" }), { error: "settings.json: unknown key voice.lang" });
  assert.match((parseVoiceSetting("voxtype") as { error: string }).error, /voice must be an object/);
});

test("the tool on this machine: found on PATH, absent, named but absent, or a binary given", () => {
  const found = (bin: string) => (bin === "voxtype" ? "/opt/bin/voxtype" : null);
  const none = () => null;
  assert.deepEqual(planVoice({ setting: "auto" }, found), { tool: "voxtype", bin: "/opt/bin/voxtype" });
  assert.deepEqual(planVoice({ setting: "voxtype" }, found), { tool: "voxtype", bin: "/opt/bin/voxtype" });
  assert.equal(planVoice({ setting: "auto" }, none), null);
  assert.equal(planVoice({ setting: "off" }, found), null);
  assert.match((planVoice({ setting: "voxtype" }, none) as { error: string }).error, /^Dictation needs voxtype on PATH/);
  assert.deepEqual(planVoice({ setting: "auto" }, none, "/tmp/fake"), { tool: "voxtype", bin: "/tmp/fake" });
  assert.deepEqual(planVoice({ error: "bad" }, found), { error: "bad" });
});
