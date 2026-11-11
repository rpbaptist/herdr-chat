// A Claude Code TUI's session: Claude Code registers each live process in
// <config>/sessions/<pid>.json ({pid, sessionId, cwd}); the transcript is
// written once the session has a message. Before that there is nothing to
// take over: session null, and the chat starts a new one in the TUI's place.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { configDir, sessionPath } from "./sessions.ts";
import { processTree, type TuiQuery, type TuiSession } from "../tui.ts";

export function claudeTuiSession(q: TuiQuery): TuiSession {
  for (const pid of processTree(q.pid)) {
    let r: Record<string, any>;
    try {
      r = JSON.parse(readFileSync(join(configDir(), "sessions", `${pid}.json`), "utf8"));
    } catch {
      continue;
    }
    if (typeof r?.sessionId !== "string") continue;
    const file = sessionPath(typeof r.cwd === "string" ? r.cwd : q.cwd, r.sessionId);
    return { session: existsSync(file) ? file : null };
  }
  throw new Error("Claude Code didn't register this process (no ~/.claude/sessions/<pid>.json)");
}
