// A chat and its agent's terminal UI share one place in their tab: the edits
// to Herdr's layout document ("herdr-app") that swap them. Pure (no "herdr"
// import), so tests load it; main.js reads and writes the document.
//
// Herdr doesn't draw a node marked `hidden: true` and gives it no room, but a
// hidden pane is still a pane of its tab: its terminal stays in the agents
// list, and a split next to the shown one leaves it hidden
// (docs/dev/research/split-glitch.md). So the TUI gets a block right after the
// chat's, with the chat's size, and the chat is hidden: the TUI shows where the
// chat was. Back: the chat shows again and the TUI's block is hidden until its
// terminal ends and Herdr removes it.

function walk(n, f, parent = null) {
  if (!n) return;
  f(n, parent);
  for (const c of n.children ?? []) walk(c, f, n);
}

// The chat's node (a mod pane whose props name `chat`), its parent and tab;
// the node that shows `terminal`. {chat: {node, parent, tab} | null, tui: node | null}
export function find(doc, chat, terminal) {
  let mine = null, tui = null;
  for (const s of doc?.spaces ?? []) for (const t of s.tabs ?? []) walk(t.root, (n, parent) => {
    if (!mine && n.content?.mod && n.content.props?.chat === chat) mine = { node: n, parent, tab: t };
    if (!tui && terminal && n.content?.terminal === terminal) tui = n;
  });
  return { chat: mine, tui };
}

// Chat → TUI. Returns {pane, tab} (the TUI's node), or null when there is no
// such chat, or the TUI already shows in its place. `newId(prefix)`: a node id.
export function swapIn(doc, chat, terminal, newId) {
  const at = find(doc, chat, terminal);
  if (!at.chat) return null;
  const { node, tab } = at.chat;
  if (at.tui && !at.tui.hidden && node.hidden) return null;
  if (at.tui) delete at.tui.hidden;
  else {
    const block = { id: newId("p"), type: "block", content: { terminal }, ...(node.size ? { size: { ...node.size } } : {}) };
    let parent = at.chat.parent;
    // A tab's root is a container; a lone block (another client's shape) is wrapped in a row.
    if (!parent) parent = tab.root = { id: newId("s"), type: "row", children: [node] };
    parent.children.splice(parent.children.indexOf(node) + 1, 0, block);
    at.tui = block;
  }
  node.hidden = true;
  return { pane: at.tui.id, tab: tab.id };
}

// TUI → chat: the chat shows, the TUI's node (if it still has one) is hidden.
// Returns {pane, tab} (the chat's node), or null when there's nothing to do.
export function swapBack(doc, chat, terminal) {
  const at = find(doc, chat, terminal);
  if (!at.chat) return null;
  const { node, tab } = at.chat;
  if (!node.hidden && (!at.tui || at.tui.hidden)) return null;
  delete node.hidden;
  if (at.tui) at.tui.hidden = true;
  return { pane: node.id, tab: tab.id };
}
