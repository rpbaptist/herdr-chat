// Chords for people and per platform. Pure (no herdr import), so the host tests load it.
//
// keys.default.json holds the macOS chords. Off macOS, cmd is the Super key, which the
// window manager takes first, so its "notMacos" section replaces the chords that use cmd.

/** keys.default.json for this platform: action → chord(s); the notMacos section applied off macOS. */
export function platformDefaults(raw, macos) {
  const { notMacos, ...defaults } = raw ?? {};
  return macos ? defaults : { ...defaults, ...(notMacos ?? {}) };
}

const MAC_GLYPH = { cmd: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧" };
const MAC_ORDER = ["ctrl", "alt", "shift", "cmd"];
const MAC_NAMES = { tab: "⇥", enter: "↩", escape: "Esc", up: "↑", down: "↓", left: "←", right: "→", space: "Space", backspace: "⌫" };
// The same words install/keys.ts pretty() uses off macOS: "Ctrl+Alt+Shift+P".
const PC_WORD = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Super" };
const PC_ORDER = ["ctrl", "alt", "shift", "cmd"];
const PC_NAMES = { tab: "Tab", enter: "Enter", escape: "Esc", up: "↑", down: "↓", left: "←", right: "→", space: "Space", backspace: "Backspace" };

/** "cmd-shift-m" → "⇧⌘M" on macOS; "ctrl-shift-m" → "Ctrl+Shift+M" elsewhere. */
export function keyLabel(chord, macos) {
  return chord.split(" ").map((step) => {
    const parts = step.split("-");
    // "cmd--" (minus) splits into an empty last part
    const key = parts[parts.length - 1] === "" ? "-" : parts.pop();
    const mods = parts.filter(Boolean);
    const names = macos ? MAC_NAMES : PC_NAMES;
    const name = names[key] ?? (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1));
    if (macos) return MAC_ORDER.filter((x) => mods.includes(x)).map((x) => MAC_GLYPH[x]).join("") + name;
    return [...PC_ORDER.filter((x) => mods.includes(x)).map((x) => PC_WORD[x]), name].join("+");
  }).join(" ");
}
