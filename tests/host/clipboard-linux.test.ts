import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { startHost, idle } from "./harness.ts";

// A fake wl-paste and xclip on PATH stand in for the clipboard, so the test never reads or
// overwrites the user's. FAKE_CLIP_TYPES lists the offered types; FAKE_CLIP_FILE holds the bytes.
const PNG = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), Buffer.from("rest of a png")]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("rest of a jpeg")]);

function fakeClipboard(types: string[], bytes: Buffer): Record<string, string> {
  const bin = mkdtempSync(join(tmpdir(), "herdr-chat-clip-"));
  const file = join(bin, "clip.bin");
  writeFileSync(file, bytes);
  const script = `#!/bin/sh
for a in "$@"; do
  case "$a" in
    --list-types|TARGETS) printf '%s\\n' $FAKE_CLIP_TYPES; exit 0 ;;
  esac
done
cat "$FAKE_CLIP_FILE"
`;
  for (const tool of ["wl-paste", "xclip"]) {
    writeFileSync(join(bin, tool), script);
    chmodSync(join(bin, tool), 0o755);
  }
  return { PATH: `${bin}:${process.env.PATH}`, FAKE_CLIP_TYPES: types.join(" "), FAKE_CLIP_FILE: file };
}

async function paste(name: string, env: Record<string, string>): Promise<string | null> {
  const h = await startHost({ name, env });
  try {
    await h.client.waitFor(idle, 10_000);
    return (await h.client.req("clipboard_image")).path;
  } finally {
    await h.stop();
  }
}

const linuxOnly = { skip: process.platform !== "linux" && "the Linux clipboard tools" };
const wayland = { WAYLAND_DISPLAY: "wayland-test", DISPLAY: "" };
const x11 = { WAYLAND_DISPLAY: "", DISPLAY: ":99" };

test("linux: a copied screenshot pastes as a PNG file (Wayland)", linuxOnly, async () => {
  const path = await paste("clip-wayland-png", { ...wayland, ...fakeClipboard(["text/plain", "image/png"], PNG) });
  assert.ok(path && existsSync(path), `a file: ${path}`);
  assert.equal(extname(path!), ".png");
  assert.deepEqual(readFileSync(path!), PNG);
});

test("linux: copied text pastes no image", linuxOnly, async () => {
  assert.equal(await paste("clip-wayland-text", { ...wayland, ...fakeClipboard(["text/plain", "UTF8_STRING"], Buffer.from("hello")) }), null);
});

test("linux: bytes that are not the offered type paste no image", linuxOnly, async () => {
  assert.equal(await paste("clip-wayland-bad", { ...wayland, ...fakeClipboard(["image/png"], Buffer.from("not a png")) }), null);
});

test("linux: without Wayland, xclip pastes a JPEG", linuxOnly, async () => {
  const path = await paste("clip-x11-jpeg", { ...x11, ...fakeClipboard(["TARGETS", "image/jpeg"], JPEG) });
  assert.ok(path && existsSync(path), `a file: ${path}`);
  assert.equal(extname(path!), ".jpg");
  assert.deepEqual(readFileSync(path!), JPEG);
});

test("linux: no display, no paste", linuxOnly, async () => {
  assert.equal(await paste("clip-none", { WAYLAND_DISPLAY: "", DISPLAY: "", ...fakeClipboard(["image/png"], PNG) }), null);
});
