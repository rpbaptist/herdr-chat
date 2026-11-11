// new-chat: the "New chat with…" launcher, and the commands that open chats.
//
// As an overlay (`mod.open:new-chat`, the "open" key: cmd-i): Pi, Claude
// Code or Codex, then a new tab with the chat (mod chat, props {chat, cwd,
// provider}) for the focused terminal's folder (else the space's). Keys:
// p / c / x pick (only an agent that is installed; the launcher has no text
// field, so letters are always picks), 1/2/3 too, ↑↓ move, Enter opens the
// selected one (the last choice, kept in <appHome>/data/herdr-chat/launcher.json),
// Esc closes. Its commands: `new-chat.pick:<provider>`, `new-chat.enter`.
//
// As the layout's empty floating block (props {role: "commands"},
// install/layout.ts): always on screen at no size, so it takes the commands a
// key or another mod runs while no launcher is open:
// - `new-chat.open`: the launcher (as mod.open:new-chat; again: closes it);
// - `new-chat.pi`, `new-chat.claude`, `new-chat.codex`: that agent's chat, in a new tab;
// - `new-chat.continue:<terminal>`: chat-menu's Continue as chat (an agent's
//   TUI handed over to a chat on its session, see continueAsChat);
//   `new-chat.continue`: the same on the focused terminal (the "continue" key);
// - `new-chat.switch`: the "switch" key in a terminal (see switchToChat);
// - `new-chat.show:<terminal>`: a chat's TUI (label herdr-chat.tui=<chat>)
//   shown in the chat's place (showInPlace). The block also watches those TUIs:
//   once one ends, its chat shows again (reconcile).

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { appHome, closeOverlay, exec, focused, hc, knownAgents, nextCommand, notify, openOverlay, panes, props, readTextFile, run, spaces, terminals, theme } from "herdr";
import * as fs from "fs/promises";
import { randomBytes } from "crypto";
import { swapBack, swapIn } from "./standin.js";
import { parentPid, shellIsBack } from "./idle.js";

const CHOICES = [
  { id: "pi", label: "Pi", icon: "pi", tint: true, letter: "p" },
  { id: "claude", label: "Claude Code", icon: "claude", letter: "c" },
  { id: "codex", label: "Codex", icon: "codex", letter: "x" },
];
const PREFS = () => `${appHome()}/data/herdr-chat/launcher.json`;

/** A chat with `provider` in a new tab, in the focused terminal's folder (else the space's). */
async function openChat(provider) {
  const f = focused();
  const space = spaces().find((s) => s.id === f?.space);
  const cwd = f?.cwd || space?.folder || null;
  const chat = `c-${randomBytes(4).toString("hex")}`;
  run("tab.new", { name: provider, mod: "chat", props: { chat, provider, ...(cwd ? { cwd } : {}) } });
  await fs.mkdir(`${appHome()}/data/herdr-chat`, { recursive: true });
  await fs.writeFile(PREFS(), JSON.stringify({ last: provider }));
}

const term = (addr) => terminals().find((t) => t.address === addr);
const word = (s) => (typeof s === "string" ? s : s?.state ?? null);
const base = (p) => String(p ?? "").split("/").pop();
const NAMES = Object.fromEntries(CHOICES.map((c) => [c.id, c.label]));

// Herdr's names for the agents (its status reports Claude Code as claude-code) → ours.
const HERDR_AGENTS = { pi: "pi", claude: "claude", "claude-code": "claude", codex: "codex" };

/** The agent a terminal runs, as Herdr reports it (an id of CHOICES), else null. */
export function agentOf(t) {
  for (const a of [t?.program?.key, t?.app, t?.status?.app, t?.report?.app, t?.agent]) if (HERDR_AGENTS[a]) return HERDR_AGENTS[a];
  return null;
}

/**
 * Why a terminal can't continue as a chat (null: it can): a live agent TUI
 * (Pi, Claude Code, Codex), idle or done. `working: true`: it can once its run
 * ends (chat-menu shows the item disabled). Which session it has open is the
 * host's to find (continueAsChat). Shared with chat-menu (a copy there: mods
 * can't import each other).
 */
export function cantContinue(t) {
  if (!t || t.state !== "live") return { why: "not live" };
  if (t.labels?.["herdr-chat.chat"]) return { why: "already a chat" };
  if (!agentOf(t)) return { why: "not an agent's TUI" };
  const st = word(t.status);
  if (st === "working" || st === "blocked") return { why: "Wait for the run to end", working: true };
  if (!["idle", "done"].includes(st)) return { why: `status ${st}` };
  return null;
}

/** The agent's process in a terminal (`hc get --json`): its foreground program when that's the agent (started from a shell), else the terminal's own. */
export function agentPid(info, agent) {
  const is = (p) => p?.pid && (base(p.argv?.[0]) === agent || base(p.argv?.[1]) === agent);
  if (is(info?.foreground)) return info.foreground.pid;
  if (is(info)) return info.pid;
  return null;
}

async function chatConfig() {
  let cfg = {};
  try { cfg = JSON.parse((await readTextFile(`${appHome()}/mods/chat/config.json`)) ?? "{}"); } catch {}
  if (!cfg.host) throw new Error("mods/chat/config.json names no host (install again)");
  return cfg;
}

/** The session the TUI has open, from the host (each agent's way: host/providers/<agent>/tui.ts): {session, model, thinking, args}. */
async function tuiSession(cfg, agent, pid, cwd, label) {
  const r = await exec("/usr/bin/env", [...(cfg.node ? [`HERDR_CHAT_NODE=${cfg.node}`] : []), cfg.host, "tui-session",
    "--provider", agent, "--pid", String(pid), "--cwd", cwd, ...(label ? ["--label", label] : [])]);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().replace(/^herdr-chat-host: /, "") || "the host couldn't tell the TUI's session");
  return JSON.parse(r.stdout);
}

const alive = async (pid) => (await exec("kill", ["-0", String(pid)])).code === 0;

/**
 * Continue as chat (research subagent-chat.md §F): an agent's TUI becomes a
 * chat on the same session (and model and thinking, where the agent records
 * them), whichever agent it is.
 * - A sub-agent (a parent): a core terminal runs one program, so the TUI ends
 *   (`hc kill`), and a host starts in its place with the same parent, name and
 *   folder (`hc run --parent <p> --name <n>`, bin/herdr-chat-subagent --session
 *   <file>): the parent sees one exit note, then its `hc send/wait <name>`
 *   reach the host. Then the chat dialog.
 * - A top-level TUI (continueInPlace): the chat takes its pane's place.
 * `addr` empty: the focused terminal (the "continue" key).
 */
export async function continueAsChat(addr, cx) {
  const t = term(addr || focused()?.terminal);
  const no = cantContinue(t);
  if (no) throw new Error(no.working ? "Wait for the run to end, then Continue as chat." : `Not an agent's TUI that can continue as a chat: ${no.why}.`);
  const agent = agentOf(t);
  const g = await hc(["get", t.address, "--json"]);
  if (g.code !== 0) throw new Error(`hc get ${t.address}: ${g.stderr.trim()}`);
  const info = JSON.parse(g.stdout);
  const pid = agentPid(info, agent);
  if (!pid) throw new Error(`no ${NAMES[agent]} process in ${t.address} (its foreground is ${info.foreground?.argv?.[0] ?? "unknown"})`);
  const cwd = info.foreground?.cwd || t.cwd || "/";
  const cfg = await chatConfig();
  const found = await tuiSession(cfg, agent, pid, cwd, t.labels?.["herdr-chat.session"] ?? null);
  if (!t.parent) return continueInPlace(t, agent, pid, cwd, found, cx);
  const launcher = cfg.host.replace(/herdr-chat-host$/, "herdr-chat-subagent");
  const kill = await hc(["kill", t.address]);
  if (kill.code !== 0) throw new Error(`hc kill ${t.address}: ${kill.stderr.trim()}`);
  // Its name is free once the old terminal has ended.
  for (let i = 0; i < 50 && term(t.address)?.state === "live"; i++) await cx.sleep(100);
  // The model and thinking as the agent's own arguments: a sub-agent's host isn't restarted by a chat later.
  const args = found.args ?? [];
  const r = await hc(["run", "--bg", "--json", "--parent", t.parent, ...(t.name ? ["--name", t.name] : []), "--cwd", cwd,
    "--", launcher, "--provider", agent, "--session", found.session, ...(args.length ? ["--", ...args] : [])]);
  if (r.code !== 0) throw new Error(`hc run: ${r.stderr.trim() || r.stdout.trim()}`);
  const next = JSON.parse(r.stdout).address;
  // The launcher labels its terminal with the chat id once it starts.
  let chat = null;
  for (let i = 0; i < 100 && !chat; i++) { chat = term(next)?.labels?.["herdr-chat.chat"] ?? null; if (!chat) await cx.sleep(100); }
  if (!chat) throw new Error(`the chat host ${next} didn't label itself (herdr-chat.chat)`);
  run("overlay.close", { id: "terminal-peek" });
  openOverlay({ mod: "chat", kind: "dialog", width: 0.8, height: 0.8, props: { chat, peek: next, provider: agent } });
  return next;
}

/**
 * A top-level TUI (its own pane in a tab): the chat opens beside it
 * (pane.split with the chat mod, focused), then the agent gets SIGTERM (it
 * saves its session; the host waits for that pid: --after-pid). The agent may
 * be a shell's foreground program (`claude` typed in zsh): only that pid is
 * signalled, never the terminal. Once it is gone the TUI's pane closes, so the
 * chat takes its place, unless its shell runs something else then (it stays, and says so).
 */
export async function continueInPlace(t, agent, pid, cwd, found, cx) {
  const pane = panes().find((p) => p.terminal === t.address);
  if (!pane) throw new Error(`${t.address} has no pane in a tab`);
  const before = new Set(panes().map((p) => p.pane));
  const chat = `c-${randomBytes(4).toString("hex")}`;
  run("pane.split", { direction: "right", pane: pane.pane, mod: "chat",
    props: { chat, provider: agent, session: found.session, afterPid: pid, cwd, ...(found.model ? { model: found.model } : {}), ...(found.thinking ? { thinking: found.thinking } : {}) } });
  let mine = null;
  for (let i = 0; i < 50 && !mine; i++) { mine = panes().find((p) => !before.has(p.pane) && p.mod === "chat" && p.tab === pane.tab); if (!mine) await cx.sleep(100); }
  if (!mine) throw new Error("the chat's pane didn't appear beside the TUI");
  run("pane.focus", { pane: mine.pane });
  const shellPid = parentPid((await exec("ps", ["-o", "ppid=", "-p", String(pid)])).stdout);
  const k = await exec("kill", ["-TERM", String(pid)]);
  if (k.code !== 0) throw new Error(`kill -TERM ${pid}: ${k.stderr.trim()}`);
  for (let i = 0; i < 100 && (await alive(pid)); i++) await cx.sleep(100);
  if (await alive(pid)) {
    notify({ title: "Continue as chat", body: `${NAMES[agent]} (pid ${pid}) didn't quit in 10 s: the chat waits for it (resume there once it's gone).`, level: "warning" });
    return mine.pane;
  }
  // A shell left with its prompt: nothing else runs in it, so it goes. A program
  // that ended with the agent: the pane shows its exit, so it goes too. A prompt's own
  // commands (git status, an rc file) come and go: up to 3 s for the shell that
  // started the agent to be back in front (idle.js).
  let a = null, idleShell = false;
  for (let i = 0; i < 15 && !idleShell; i++) {
    await cx.sleep(200);
    const after = await hc(["get", t.address, "--json"]);
    a = after.code === 0 ? JSON.parse(after.stdout) : null;
    idleShell = shellIsBack(a, shellPid);
  }
  if (!idleShell) {
    notify({ title: "Continue as chat", body: `The TUI's terminal now runs ${a.foreground?.argv?.[0] ?? "something"}: its pane stays.`, level: "info" });
    return mine.pane;
  }
  if (panes().some((p) => p.pane === pane.pane)) run("pane.close", { pane: pane.pane });
  run("pane.focus", { pane: mine.pane });
  return mine.pane;
}

/**
 * The "switch" key in a terminal (KEYS.md; the chat binds the same chord to
 * /tui, so one key goes both ways). A chat's own TUI (label herdr-chat.tui):
 * the chat shows again in its place, then the TUI ends and the chat resumes
 * the session (chat main.js, finishHandoff). An agent's TUI continues as a
 * chat. Any other terminal: the error says why.
 */
export async function switchToChat(cx) {
  const t = term(focused()?.terminal);
  if (!tuiOf(t)) return continueAsChat(t?.address, cx);
  if (["working", "blocked"].includes(word(t.status))) throw new Error("Wait for the run to end, then switch back to the chat.");
  try {
    await reconcile(cx, tuiOf(t));
  } finally {
    run("terminal.kill", { terminal: t.address });
  }
}

// ---- the chat and its TUI in one place --------------------------------------
//
// The chat's /tui (and /mcp, /login…: every terminal a chat hands over to)
// shows where the chat is: a block for the TUI right after the chat's, and the
// chat's own marked hidden (standin.js), in one write of Herdr's layout
// document. A hidden pane stays a pane of its tab, so a split beside the TUI
// leaves the chat hidden, and the chat's host stays in the agents list. No
// command reaches a pane's `hidden` (pane.zoom ends with the next split,
// terminal.show takes terminal panes only, terminal.park drops the agent from
// the list): see docs/dev/architecture.md "The chat and its TUI in one place".

const HELLO = '{"jsonrpc":"2.0","id":1,"method":"hello","params":{"generation":1}}';
const sq = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
const APP_READ_AFTER_ECHO = 380; // as the chat's beforeAppRead (chat main.js)

// One request over `hc connect` (as the chat's hostpane.js): its result, or throws (`kind` from the core).
// `at` (epoch ms): connected first, the request is sent then.
async function rpc(method, params, at = null) {
  const req = JSON.stringify({ jsonrpc: "2.0", id: 2, method, params });
  const wait = at ? `perl -MTime::HiRes=time,sleep -e '$d = $ARGV[0] - time; sleep($d) if $d > 0' ${(at / 1000).toFixed(3)}; ` : "";
  const r = await exec("/bin/sh", ["-c", `{ printf '%s\\n' ${sq(HELLO)}; ${wait}printf '%s\\n' ${sq(req)}; } | hc connect`]);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || `hc connect: exit ${r.code}`);
  const res = r.stdout.trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((x) => x?.id === 2);
  if (!res) throw new Error(`${method}: no answer`);
  if (res.error) throw Object.assign(new Error(res.error.message ?? `${method} failed`), { kind: res.error.data?.kind ?? null });
  return res.result;
}

// Whether the document holds the tabs and panes the app shows now: a write
// before the app wrote its own latest change makes the app drop that change
// (as the chat's hostpane.js inStep).
function inStep(doc) {
  const docTabs = new Set(), docPanes = new Set();
  const leaves = (n) => { if (!n) return; if (!n.children?.length) docPanes.add(n.id); for (const c of n.children ?? []) leaves(c); };
  for (const s of doc?.spaces ?? []) for (const t of s.tabs ?? []) { docTabs.add(t.id); leaves(t.root); }
  const local = (id) => !String(id).includes("/");
  const appTabs = spaces().flatMap((s) => s.tabs.map((t) => t.id)).filter(local);
  const appPanes = panes().map((p) => p.pane).filter(local);
  return appTabs.length === docTabs.size && appTabs.every((t) => docTabs.has(t))
    && appPanes.length === docPanes.size && appPanes.every((p) => docPanes.has(p));
}

// The time to send a write: just before the app's next read of the document
// (a label's echo in terminals() marks the app's loop; as the chat's beforeAppRead).
async function beforeAppRead(address, cx) {
  if (!address) return null;
  const n = String(Date.now());
  const r = await hc(["label", address, `herdr-chat.sync=${n}`]);
  if (r.code !== 0) return null;
  for (const until = Date.now() + 1500; Date.now() < until; await cx.sleep(10))
    if (term(address)?.labels?.["herdr-chat.sync"] === n) return Date.now() + APP_READ_AFTER_ECHO;
  return null;
}

// Read, edit, write with the version read. `edit(doc)`: what it did, or null
// (nothing to do: no write). The app's own change goes first (up to 3 s);
// a conflict reads again. `echo`: a live terminal for beforeAppRead.
async function editDoc(edit, echo, cx) {
  for (let i = 0; ; i++) {
    const r = await rpc("doc.get", { name: "herdr-app" });
    const value = r?.value;
    if (!value?.spaces) throw new Error("no layout document");
    if (!inStep(value) && i < 10) { await cx.sleep(300); continue; }
    const did = edit(value);
    if (!did) return null;
    const at = await beforeAppRead(echo, cx);
    try {
      await rpc("doc.set", { name: "herdr-app", value, version: r.version ?? 0 }, at);
      return did;
    } catch (e) {
      if (e?.kind !== "conflict" || i >= 14) throw e;
    }
  }
}

const newId = (prefix) => `${prefix}${randomBytes(16).toString("hex")}`;
const tuiOf = (t) => t?.labels?.["herdr-chat.tui"] ?? null; // the chat whose TUI a terminal is
const isHost = (t) => t.state === "live" && t.labels?.["herdr-chat.role"] === "host" && t.labels?.["herdr-chat.chat"];
const hostOf = (chat) => terminals().find((t) => isHost(t) && t.labels["herdr-chat.chat"] === chat);

/**
 * `new-chat.show:<terminal>` (chat main.js startHandoff): a chat's TUI, which
 * has no pane yet, shows in the chat's place and takes the keyboard. Its
 * herdr.space/tab labels follow the write, so every client agrees where it is.
 */
export async function showInPlace(address, cx) {
  let t = null;
  for (let i = 0; i < 30 && !(t = term(address)); i++) await cx.sleep(100); // terminals() learns of it a moment after hc run
  const chat = tuiOf(t);
  if (!chat || t.state !== "live") throw new Error(`${address} is not a chat's live terminal UI`);
  const did = await editDoc((doc) => swapIn(doc, chat, address, newId), address, cx);
  const tab = did?.tab ?? panes().find((p) => p.terminal === address)?.tab;
  const space = spaces().find((s) => s.tabs.some((x) => x.id === tab))?.id;
  if (tab && space && t.labels?.["herdr.tab"] !== tab) await hc(["label", address, `herdr.space=${space}`, `herdr.tab=${tab}`]);
  let pane = null;
  for (let i = 0; i < 30 && !(pane = panes().find((p) => p.terminal === address)); i++) await cx.sleep(100);
  if (!pane) throw new Error(`the chat's pane wasn't found in the layout, so ${address} has no place to show`);
  run("pane.focus", { pane: pane.pane });
}

/**
 * The chats whose TUI isn't live any more show again (swapBack), each in one
 * write. A chat is hidden only while a TUI of its runs: this rule holds after
 * any end (the switch key, the agent's own quit, a crash, an app restart).
 * `only`: a chat to show now even though its TUI still runs (the switch key).
 */
async function reconcile(cx, only = null) {
  const live = new Map(terminals().filter((t) => t.state === "live" && tuiOf(t)).map((t) => [tuiOf(t), t.address]));
  const shown = [];
  // Only herdr-chat's own terminals take the sync label.
  const echo = (only && live.get(only)) ?? terminals().find(isHost)?.address ?? null;
  await editDoc((doc) => {
    shown.length = 0;
    const hidden = [];
    const visit = (n) => { if (!n) return; if (n.hidden && n.content?.mod === "chat" && n.content.props?.chat) hidden.push(n.content.props.chat); for (const c of n.children ?? []) visit(c); };
    for (const s of doc.spaces ?? []) for (const t of s.tabs ?? []) visit(t.root);
    for (const chat of hidden) {
      if (live.has(chat) && chat !== only) continue;
      const did = swapBack(doc, chat, live.get(chat) ?? null);
      if (did) shown.push({ chat, tui: live.get(chat) ?? null, ...did });
    }
    return shown.length ? shown : null;
  }, echo, cx);
  // The keyboard goes with the view: from the TUI (or a hidden pane of the chat's) to the chat.
  const f = focused();
  for (const s of shown) {
    const stale = !f?.pane || f.pane === s.pane || (s.tui && f.terminal === s.tui) || !panes().some((p) => p.pane === f.pane)
      || hostOf(s.chat)?.address === f.terminal;
    if (f?.tab === s.tab && stale) run("pane.focus", { pane: s.pane });
  }
  return shown;
}

// Every 500 ms: a TUI of a chat that ended (or the block's start: one that ended while the app was closed).
class InPlace {
  constructor(cx) {
    this.live = null;
    this.busy = false;
    cx.timer.every(500, (cx) => this.tick(cx));
  }

  tick(cx) {
    const now = new Set(terminals().filter((t) => t.state === "live" && tuiOf(t)).map((t) => t.address));
    const ended = this.live === null || [...this.live].some((a) => !now.has(a));
    if (!ended || this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        await reconcile(cx);
      } catch (e) {
        console.log(`new-chat: showing a chat again: ${e?.message ?? e}`);
      } finally {
        this.live = now;
        this.busy = false;
      }
    });
  }
}

// The floating block: commands only, nothing drawn.
class Commands {
  constructor(cx) {
    this.inPlace = new InPlace(cx);
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        try {
          if (c === "open") run("mod.open", { name: "new-chat" });
          else if (CHOICES.some((x) => x.id === c)) await openChat(c);
          else if (c === "continue" || c.startsWith("continue:")) await continueAsChat(c.slice(9), cx);
          else if (c === "switch") await switchToChat(cx);
          else if (c.startsWith("show:")) await showInPlace(c.slice(5), cx);
        } catch (e) {
          const title = c.startsWith("continue") || c === "switch" ? "Continue as chat" : c.startsWith("show:") ? "Terminal UI" : "New chat";
          notify({ title, body: String(e?.message ?? e), level: "error" });
        }
      }
    });
  }
}

export default class NewChat extends View {
  init(_props, cx) {
    if (props()?.role === "commands") { this.commands = new Commands(cx); return; }
    this.sel = 0;
    this.done = false;
    this.installed = null; // provider id → installed (knownAgents), null until known
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => {
      try {
        const last = JSON.parse((await readTextFile(PREFS())) ?? "{}").last;
        const i = CHOICES.findIndex((c) => c.id === last);
        if (i >= 0) this.sel = i;
      } catch {}
      this.handle.focus();
      cx.notify();
    });
    cx.spawn(async (cx) => {
      try {
        const known = await knownAgents();
        this.installed = Object.fromEntries(CHOICES.map((c) => [c.id, known.find((a) => a.key === c.id)?.installed !== false]));
      } catch {}
      cx.notify();
    });
    cx.timer.after(120, () => this.handle.focus());
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "focus") this.handle.focus();
        else if (c.startsWith("pick:")) this.open(CHOICES.findIndex((x) => x.id === c.slice(5)), cx);
        else if (c === "enter") this.open(this.sel, cx);
        cx.notify();
      }
    });
  }

  // An agent knownAgents() says isn't installed (unknown yet: every one is offered).
  available(c) {
    return this.installed?.[c.id] !== false;
  }

  open(i, cx) {
    if (this.done || i < 0 || i >= CHOICES.length) return;
    this.done = true;
    const provider = CHOICES[i].id;
    const overlay = props()?.overlay;
    cx.spawn(async () => {
      try {
        await openChat(provider);
      } catch (e) {
        notify({ title: "New chat", body: String(e?.message ?? e), level: "error" });
      } finally {
        if (overlay) closeOverlay(overlay);
      }
    });
  }

  key(e, cx) {
    const k = e.keystroke;
    const letter = CHOICES.findIndex((c) => c.letter === k && this.available(c));
    if (letter >= 0) this.open(letter, cx);
    else if (/^[1-9]$/.test(k)) this.open(Number(k) - 1, cx);
    else if (k === "up") this.sel = (this.sel + CHOICES.length - 1) % CHOICES.length;
    else if (k === "down" || k === "tab") this.sel = (this.sel + 1) % CHOICES.length;
    else if (k === "enter") this.open(this.sel, cx);
    else if (k === "escape") { const o = props()?.overlay; if (o) closeOverlay(o); }
    cx.notify();
  }

  render() {
    if (this.commands) return div();
    const t = theme();
    const mark = (c) => {
      const path = `mods/chat/icons/providers/${c.icon}.svg`;
      return (c.tint ? svg(path).text_color(t.foreground) : image(path)).size(18).flex_none();
    };
    const letters = CHOICES.filter((c) => this.available(c)).map((c) => c.letter.toUpperCase()).join(" ");
    return v_flex().id("launcher").size_full().p(8).gap(2).bg(t.popover).text_color(t.foreground)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .child(div().px(8).pt(4).pb(6).text_size(11.5).text_color(t.dim).child("New chat"))
      .children(CHOICES.map((c, i) => h_flex().id(`choice-${c.id}`).h(36).px(10).gap(10).items_center().rounded(8).cursor_pointer()
        .when(i === this.sel, (e) => e.bg(t.selected))
        .hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.open(i, cx))
        .child(mark(c))
        .child(div().flex_1().text_size(13).text_color(this.available(c) ? t.foreground : t.dim).child(this.available(c) ? c.label : `${c.label} (not installed)`))
        .when(this.available(c), (e) => e.child(div().px(5).rounded(4).border_1().border_color(t.border).bg(t.raised).text_size(11).text_color(t.dim).child(c.letter.toUpperCase())))))
      .child(div().px(8).pt(6).text_size(10.5).text_color(t.dim).child(`${letters} or ↑↓ Enter · Esc`));
  }
}
