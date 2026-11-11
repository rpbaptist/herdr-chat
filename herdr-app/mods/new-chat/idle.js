// When an agent's TUI quits for Continue as chat, is its terminal back to an idle shell?
// Pure (no herdr import), so the host tests load it.

/**
 * `info`: `hc get <terminal> --json` after the agent quit (null when it can't be read).
 * `shellPid`: the agent's parent before it quit, the shell that started it. That shell is
 * often not the terminal's first process (`pid`): a bash that starts zsh, or a nested shell.
 */
export function shellIsBack(info, shellPid) {
  if (!info || info.state !== "live" || !info.foreground?.pid) return true;
  return info.foreground.pid === info.pid || (shellPid != null && info.foreground.pid === shellPid);
}

/** `ps -o ppid= -p <pid>` output → the parent pid, or null. */
export function parentPid(psOut) {
  const n = Number(String(psOut ?? "").trim());
  return Number.isInteger(n) && n > 1 ? n : null;
}
