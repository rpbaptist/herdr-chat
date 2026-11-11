// The chat and its agent's TUI in one place (herdr-app/mods/new-chat/standin.js):
// the layout document's edits, checked by what the tab shows.
import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error: a mod module, plain JS without types
import { swapBack, swapIn } from "../../herdr-app/mods/new-chat/standin.js";

type Node = { id: string; type?: string; hidden?: boolean; size?: { weight: number }; content?: { terminal?: string; mod?: string; props?: { chat?: string } }; children?: Node[] };
type Doc = { spaces: { id: string; tabs: { id: string; root: Node }[] }[] };

const CHAT = "c-1", HOST = "t2", TUI = "t9";
let ids = 0;
const newId = (prefix: string) => `${prefix}new${++ids}`;

// A chat tab as the chat leaves it: the chat's pane and its host's, hidden.
function chatTab(): Doc {
  return { spaces: [{ id: "s1", tabs: [
    { id: "other", root: { id: "o", type: "row", children: [{ id: "po", type: "block", content: { terminal: "t1" } }] } },
    { id: "tab", root: { id: "r", type: "row", children: [
      { id: "pc", type: "block", size: { weight: 0.5 }, content: { mod: "chat", props: { chat: CHAT } } },
      { id: "ph", type: "block", hidden: true, size: { weight: 0.5 }, content: { terminal: HOST } },
    ] } },
  ] }] };
}

const tabOf = (doc: Doc, id = "tab") => doc.spaces[0]!.tabs.find((t) => t.id === id)!;

// What the person sees in a tab: the leaves that aren't hidden (nor under a hidden container).
function shown(doc: Doc, id = "tab"): string[] {
  const out: string[] = [];
  const visit = (n: Node) => {
    if (n.hidden) return;
    if (n.children?.length) return n.children.forEach(visit);
    out.push(n.content?.terminal ?? `chat:${n.content?.props?.chat}`);
  };
  visit(tabOf(doc, id).root);
  return out;
}

// Every pane of the tab, hidden or not: what keeps a terminal in Herdr's agents list.
function panes(doc: Doc, id = "tab"): string[] {
  const out: string[] = [];
  const visit = (n: Node) => { if (n.content) out.push(n.content.terminal ?? `chat:${n.content.props?.chat}`); n.children?.forEach(visit); };
  visit(tabOf(doc, id).root);
  return out;
}

function parentOf(root: Node, id: string): Node | null {
  for (const c of root.children ?? []) {
    if (c.id === id) return root;
    const p = parentOf(c, id);
    if (p) return p;
  }
  return null;
}

// Herdr's own edits: a split beside a pane, and a closed pane taken out.
function splitBeside(doc: Doc, terminal: string, fresh: string, direction: "row" | "column") {
  const root = tabOf(doc).root;
  const find = (n: Node): Node | null => (n.content?.terminal === terminal ? n : (n.children ?? []).map(find).find(Boolean) ?? null);
  const target = find(root)!;
  const parent = parentOf(root, target.id)!;
  const block: Node = { id: `p-${fresh}`, type: "block", content: { terminal: fresh } };
  if (parent.type === direction) parent.children!.splice(parent.children!.indexOf(target) + 1, 0, block);
  else parent.children![parent.children!.indexOf(target)] = { id: `s-${fresh}`, type: direction, size: target.size, children: [{ ...target, size: undefined }, block] };
}
function splitTabRoot(doc: Doc, fresh: string) {
  const t = tabOf(doc);
  t.root = { id: `s-${fresh}`, type: "row", children: [t.root, { id: `p-${fresh}`, type: "block", content: { terminal: fresh } }] };
}
function removePane(doc: Doc, terminal: string) {
  const visit = (n: Node) => {
    n.children = n.children?.filter((c) => c.content?.terminal !== terminal);
    n.children?.forEach(visit);
  };
  visit(tabOf(doc).root);
}

test("chat → TUI: the TUI shows where the chat was, alone, and the host stays a pane of the tab", () => {
  const doc = chatTab();
  assert.deepEqual(shown(doc), [`chat:${CHAT}`]);
  const did = swapIn(doc, CHAT, TUI, newId);
  assert.deepEqual(did, { pane: did.pane, tab: "tab" });
  assert.deepEqual(shown(doc), [TUI]);
  assert.deepEqual(panes(doc), [`chat:${CHAT}`, TUI, HOST], "the chat and the host stay in the tab (hidden): the host stays in the agents list");
  const tui = tabOf(doc).root.children!.find((n) => n.content?.terminal === TUI)!;
  assert.deepEqual(tui.size, { weight: 0.5 }, "the TUI takes the chat's size");
  assert.deepEqual(shown(doc, "other"), ["t1"], "another tab is untouched");
  assert.equal(swapIn(doc, CHAT, TUI, newId), null, "again: nothing to write");
});

test("a split beside the TUI, or around the whole tab, never shows the chat too", () => {
  for (const split of [
    (d: Doc) => splitBeside(d, TUI, "t5", "row"),
    (d: Doc) => splitBeside(d, TUI, "t5", "column"),
    (d: Doc) => splitTabRoot(d, "t5"),
  ]) {
    const doc = chatTab();
    swapIn(doc, CHAT, TUI, newId);
    split(doc);
    assert.deepEqual(shown(doc), [TUI, "t5"]);
    removePane(doc, "t5");
    assert.deepEqual(shown(doc), [TUI]);
  }
});

test("TUI → chat by the switch key: the chat shows at once, the TUI hidden until Herdr removes its pane", () => {
  const doc = chatTab();
  swapIn(doc, CHAT, TUI, newId);
  const did = swapBack(doc, CHAT, TUI);
  assert.deepEqual(did, { pane: "pc", tab: "tab" });
  assert.deepEqual(shown(doc), [`chat:${CHAT}`]);
  removePane(doc, TUI); // the TUI ended
  assert.deepEqual(shown(doc), [`chat:${CHAT}`]);
  assert.equal(swapBack(doc, CHAT, TUI), null, "again: nothing to write");
});

test("TUI → chat after the TUI ended by itself (its pane already gone): the chat shows again", () => {
  const doc = chatTab();
  swapIn(doc, CHAT, TUI, newId);
  removePane(doc, TUI);
  assert.deepEqual(shown(doc), [], "with the chat still hidden, the tab would show nothing");
  assert.ok(swapBack(doc, CHAT, null));
  assert.deepEqual(shown(doc), [`chat:${CHAT}`]);
});

test("a split made while the TUI showed stays beside the chat when it comes back", () => {
  const doc = chatTab();
  swapIn(doc, CHAT, TUI, newId);
  splitBeside(doc, TUI, "t5", "row");
  swapBack(doc, CHAT, TUI);
  assert.deepEqual(shown(doc), [`chat:${CHAT}`, "t5"]);
});

test("the swap again after a round trip reuses nothing stale, and a lone-block tab root is wrapped", () => {
  const doc = chatTab();
  swapIn(doc, CHAT, TUI, newId);
  swapBack(doc, CHAT, TUI);
  removePane(doc, TUI);
  swapIn(doc, CHAT, "t10", newId);
  assert.deepEqual(shown(doc), ["t10"]);

  const lone: Doc = { spaces: [{ id: "s1", tabs: [{ id: "tab", root: { id: "pc", type: "block", content: { mod: "chat", props: { chat: CHAT } } } }] }] };
  swapIn(lone, CHAT, TUI, newId);
  assert.deepEqual(shown(lone), [TUI]);
  assert.deepEqual(panes(lone), [`chat:${CHAT}`, TUI]);
});

test("no such chat in the document: no edit", () => {
  const doc = chatTab();
  assert.equal(swapIn(doc, "c-other", TUI, newId), null);
  assert.equal(swapBack(doc, "c-other", TUI), null);
  assert.equal(swapBack(doc, CHAT, TUI), null, "a chat that shows: nothing to do");
});
