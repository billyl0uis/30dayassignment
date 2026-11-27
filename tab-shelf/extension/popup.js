/* Tab Shelf popup: one big button, plus a fallback download and two settings. */
const PAGES = {
  live: 'https://billyl0uis.github.io/30dayassignment/tab-shelf/',
  local: 'http://localhost:5223/',
};
const $ = (s) => document.querySelector(s);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

async function refresh() {
  const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const n = wins.reduce((a, w) => a + (w.tabs?.length || 0), 0);
  $('#count').textContent = `${plural(n, 'tab')} · ${plural(wins.length, 'window')}`;
  const { snapshots = [], auto = true, target = 'live' } = await chrome.storage.local.get(['snapshots', 'auto', 'target']);
  $('#auto').checked = auto;
  $('#target').value = target;
  $('#kept').textContent = snapshots.length
    ? `${snapshots.length} of 10 snapshots kept. Last: ${new Date(snapshots[0].createdAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.`
    : 'No snapshots yet.';
}

/** Show Tab Shelf: reuse a tab that already has it open, otherwise open a new one. */
async function openShelf(fromSave) {
  const { target = 'live' } = await chrome.storage.local.get('target');
  const base = PAGES[target] || PAGES.live;
  const url = fromSave ? base + '?from=extension' : base;
  const [existing] = await chrome.tabs.query({ url: base + '*' });
  if (existing) {
    await chrome.tabs.update(existing.id, { url, active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
  window.close();
}

$('#save').addEventListener('click', async () => {
  $('#save').disabled = true;
  $('#status').textContent = 'Saving…';
  const { snapshot } = await chrome.runtime.sendMessage({ type: 'saveNow' });
  if (!snapshot?.tabs.length) { $('#status').textContent = 'No web pages open to save.'; $('#save').disabled = false; return; }
  $('#status').textContent = `Saved ${plural(snapshot.tabs.length, 'tab')}${snapshot.skipped ? ` (skipped ${snapshot.skipped} Chrome pages)` : ''}. Opening Tab Shelf…`;
  setTimeout(() => openShelf(true), 600);
});

$('#open').addEventListener('click', () => openShelf(false));

$('#download').addEventListener('click', async () => {
  const { snapshots = [] } = await chrome.storage.local.get('snapshots');
  const data = { app: 'tab-shelf', kind: 'extension-snapshots', version: 1, exportedAt: new Date().toISOString(), snapshots };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `tabs-extension-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  $('#status').textContent = snapshots.length ? `Downloaded ${plural(snapshots.length, 'snapshot')}. Import it in Tab Shelf.` : 'Nothing saved yet. Click “Save all tabs” first.';
});

$('#auto').addEventListener('change', (e) => chrome.storage.local.set({ auto: e.target.checked }));
$('#target').addEventListener('change', (e) => chrome.storage.local.set({ target: e.target.value }));

refresh();
