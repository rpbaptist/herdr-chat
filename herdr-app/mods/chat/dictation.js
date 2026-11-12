// Dictation in the composer (the host runs the tool: host/voice.ts). Plain
// functions, no Herdr imports, so the tests can load them.

// Where an edit from `a` to `b` ends in `b`: after what was typed or pasted.
export function editEnd(a, b) {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return b.length - s;
}

// Dictated text that now stands at [start, end) of `value`: a space goes
// before it when a word touches its start, and after it when a word touches its end.
export function dictationSpaces(value, start, end) {
  const word = (ch) => ch !== undefined && !/\s/.test(ch);
  return { lead: word(value[start - 1]), trail: word(value[end]) };
}

// What a click on the microphone (or the dictate key, or /voice) does in each state.
export function dictationOp(voice) {
  if (!voice) return null;
  if (voice.state === "recording") return "voice_stop";
  if (voice.state === "transcribing") return null;
  return "voice_start";
}
