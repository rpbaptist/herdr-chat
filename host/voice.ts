// Dictation through a system tool (voxtype). The tool records and transcribes
// on this machine and writes the text to a file; the host gives the text to
// the chat in `state.voice.text`. A mod has no audio, so the host runs it.
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";

export const VOICE_TOOLS = ["voxtype"] as const;
export type VoiceTool = (typeof VOICE_TOOLS)[number];
export type VoiceSetting = "auto" | "off" | VoiceTool;
/** settings.json `voice`, read: the setting, or why it is wrong. */
export type ParsedVoiceSetting = { setting: VoiceSetting } | { error: string };
/** What the tool reports while it works. */
export type ToolState = "idle" | "recording" | "transcribing";
/** What the chat shows: the tool's state, or an error. */
export type VoiceState = ToolState | "error";

/**
 * What the chat shows. null: no dictation (no button, no /voice). `tool: null`:
 * dictation is set up wrong; `error` says why. `text`: a finished dictation
 * the client puts in the composer, then clears with `voice_ack`.
 */
export type Voice = {
  tool: VoiceTool | null;
  state: VoiceState;
  error?: string;
  text?: string;
};

/** How the host runs dictation: a tool and its binary, an error to show, or null (off). */
export type VoicePlan = { tool: VoiceTool; bin: string } | { error: string } | null;

export type Exec = (argv: string[]) => Promise<{ code: number; out: string; err: string }>;

type Result = { text: string } | { error: string };
type Descriptor = {
  bin: string;
  status: string[];
  /** null when the tool can't record now (its daemon doesn't run). */
  readStatus: (out: string) => ToolState | null;
  start: (file: string) => string[];
  stop: string[];
  cancel: string[];
  /** The result once the tool wrote it, null before. */
  result: (file: string) => Result | null;
};

const read = (file: string) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

export const TOOLS: Record<VoiceTool, Descriptor> = {
  // `record start --file=<f>` sends this one recording's text to <f>, then
  // writes "<f>.done" ({"status":"ok","chars":5}). `status` prints idle,
  // recording, transcribing, or stopped when the daemon doesn't run.
  voxtype: {
    bin: "voxtype",
    status: ["status"],
    readStatus: (out) => {
      const s = out.trim();
      return s === "idle" || s === "recording" || s === "transcribing" ? s : null;
    },
    start: (file) => ["record", "start", `--file=${file}`],
    stop: ["record", "stop"],
    cancel: ["record", "cancel"],
    result: (file) => {
      const done = read(`${file}.done`);
      if (done === null) return null;
      let marker: { status?: string; error?: string } = {};
      try {
        marker = JSON.parse(done);
      } catch {}
      if (marker.status !== "ok") return { error: `voxtype: ${marker.error ?? marker.status ?? "no transcription"}` };
      return { text: (read(file) ?? "").trim() };
    },
  },
};

/** settings.json `voice`: {"tool": "auto" | "off" | "voxtype"}. Absent: auto. */
export function parseVoiceSetting(voice: unknown): ParsedVoiceSetting {
  if (voice === undefined || voice === null) return { setting: "auto" };
  const values = ["auto", "off", ...VOICE_TOOLS];
  const must = `settings.json: voice.tool must be ${values.map((v) => `"${v}"`).join(", ")}`;
  if (typeof voice !== "object" || Array.isArray(voice)) return { error: `settings.json: voice must be an object, like {"tool": "auto"}` };
  for (const key of Object.keys(voice)) if (key !== "tool") return { error: `settings.json: unknown key voice.${key}` };
  const tool = (voice as { tool?: unknown }).tool ?? "auto";
  if (!values.includes(tool as string)) return { error: must };
  return { setting: tool as VoiceSetting };
}

/** The path of a program on PATH, or null. */
export function which(bin: string, path = process.env.PATH ?? ""): string | null {
  for (const dir of path.split(delimiter)) {
    if (!dir) continue;
    const p = join(dir, bin);
    try {
      const s = statSync(p);
      if (s.isFile() && s.mode & 0o111) return p;
    } catch {}
  }
  return null;
}

/**
 * What a setting gives on this machine. `auto` with no tool on PATH is off
 * (no button); a tool named in settings that isn't there is an error the
 * chat shows. `bin`: a binary to use in place of the PATH lookup (tests).
 */
export function planVoice(parsed: ParsedVoiceSetting, find: (bin: string) => string | null, bin?: string | null): VoicePlan {
  if ("error" in parsed) return { error: parsed.error };
  const { setting } = parsed;
  if (setting === "off") return null;
  const tools: readonly VoiceTool[] = setting === "auto" ? VOICE_TOOLS : [setting];
  for (const tool of tools) {
    const path = bin || find(TOOLS[tool].bin);
    if (path) return { tool, bin: path };
  }
  if (setting === "auto") return null;
  return { error: `Dictation needs ${TOOLS[setting].bin} on PATH (or set "voice": {"tool": "off"} in settings.json)` };
}

export const execTool: Exec = (argv) =>
  new Promise((resolve) => {
    execFile(argv[0]!, argv.slice(1), { timeout: 10_000 }, (err, out, errOut) => {
      const code = err ? (typeof (err as { code?: unknown }).code === "number" ? (err as { code: number }).code : 1) : 0;
      resolve({ code, out: String(out), err: String(errOut || (err && !errOut ? err.message : "")) });
    });
  });

/** A dictation's text file and its "<file>.done" marker. */
function removeResult(file: string): void {
  rmSync(file, { force: true });
  rmSync(`${file}.done`, { force: true });
}

/** Polls in a row that see the tool idle with no result before a dictation ends with no text (the tool's own cancel key, or no words). */
const IDLE_POLLS = 4;

export type DictationOptions = {
  tool: VoiceTool;
  bin: string;
  /** A private directory for the text files. */
  dir: string;
  exec?: Exec;
  pollMs?: number;
  onChange: (v: Voice) => void;
  log?: (msg: string) => void;
};

/** One chat's dictation: start, stop, cancel, and the text when the tool is done. */
export class Dictation {
  voice: Voice;
  private opts: DictationOptions;
  private exec: Exec;
  private tool: Descriptor;
  private file: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  /** Polls in a row that saw the tool idle with no result. */
  private idle = 0;
  /** Dictations so far: each gets its own text file. */
  private count = 0;
  private polling = false;

  constructor(o: DictationOptions) {
    this.opts = o;
    this.exec = o.exec ?? execTool;
    this.tool = TOOLS[o.tool];
    this.voice = { tool: o.tool, state: "idle" };
  }

  get active(): boolean {
    return this.voice.state === "recording" || this.voice.state === "transcribing";
  }

  private set(v: Partial<Voice>, keepText = true): void {
    const next: Voice = { tool: this.opts.tool, state: v.state ?? this.voice.state };
    if (v.error) next.error = v.error;
    const text = "text" in v ? v.text : keepText ? this.voice.text : undefined;
    if (text) next.text = text;
    this.voice = next;
    this.opts.onChange(next);
  }

  private async run(args: string[]): Promise<string> {
    const r = await this.exec([this.opts.bin, ...args]);
    if (r.code !== 0) throw new Error((r.err || r.out).trim().split("\n")[0] || `${this.tool.bin} ${args.join(" ")} failed (${r.code})`);
    return r.out;
  }

  private async status(): Promise<ToolState> {
    const out = await this.run(this.tool.status);
    const s = this.tool.readStatus(out);
    if (!s) throw new Error(`${this.tool.bin} can't record: ${out.trim() || "no status"} (is its daemon running?)`);
    return s;
  }

  private clean(): void {
    if (this.file) removeResult(this.file);
    this.file = null;
  }

  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private fail(e: unknown): void {
    this.stopPolling();
    this.clean();
    const error = e instanceof Error ? e.message : String(e);
    this.opts.log?.(`dictation: ${error}`);
    this.set({ state: "error", error });
  }

  async start(): Promise<void> {
    if (this.active) return;
    try {
      const now = await this.status();
      if (now !== "idle") throw new Error(`${this.tool.bin} is busy (${now})`);
      mkdirSync(this.opts.dir, { recursive: true, mode: 0o700 });
      this.file = join(this.opts.dir, `voice-${process.pid}-${++this.count}.txt`);
      removeResult(this.file);
      await this.run(this.tool.start(this.file));
    } catch (e) {
      this.fail(e);
      throw e;
    }
    this.idle = 0;
    this.set({ state: "recording" });
    this.timer = setInterval(() => void this.poll(), this.opts.pollMs ?? 250);
  }

  async stop(): Promise<void> {
    if (this.voice.state !== "recording") return;
    try {
      await this.run(this.tool.stop);
    } catch (e) {
      this.fail(e);
      throw e;
    }
    if (this.voice.state === "recording") this.set({ state: "transcribing" });
  }

  async cancel(): Promise<void> {
    if (!this.active) return;
    this.stopPolling();
    try {
      await this.run(this.tool.cancel);
    } catch (e) {
      this.opts.log?.(`dictation cancel: ${e instanceof Error ? e.message : e}`);
    } finally {
      this.clean();
      this.set({ state: "idle" });
    }
  }

  /** The client took the text. */
  ack(): void {
    if (this.voice.text) this.set({ text: undefined });
  }

  private async poll(): Promise<void> {
    if (this.polling || !this.file || !this.active) return;
    this.polling = true;
    try {
      const r = this.tool.result(this.file);
      if (r) {
        this.stopPolling();
        this.clean();
        if ("error" in r) return this.fail(new Error(r.error));
        return this.set(r.text ? { state: "idle", text: r.text } : { state: "idle" });
      }
      const s = await this.status();
      if (!this.active) return;
      if (s !== "idle") {
        this.idle = 0;
        if (s !== this.voice.state) this.set({ state: s });
        return;
      }
      if (++this.idle < IDLE_POLLS) return;
      this.stopPolling();
      this.clean();
      this.set({ state: "idle" });
    } catch (e) {
      if (this.active) this.fail(e);
    } finally {
      this.polling = false;
    }
  }

  dispose(): void {
    this.stopPolling();
    if (this.active) void this.cancel();
  }
}
