/* Tab Shelf extension: background worker.
 * - Captures every tab in every window (title, URL, icon, window number). Nothing else.
 * - Keeps the last 10 snapshots in chrome.storage.local (on this computer only).
 * - Auto-saves every 30 minutes and when Chrome starts, if that setting is on.
 * - Answers the Tab Shelf web page, which is the only page allowed to talk to it
 *   (see "externally_connectable" in manifest.json).
 * It never reads page contents and never makes network requests.
 */
const KEEP = 10;
const ALARM = 'tabshelf-autosave';
const MAX_OPEN = 60;
const isWeb = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);

/** Icons: keep https icons or small inline images; skip chrome:// and huge data. */
const cleanIcon = (u) => (typeof u === 'string' && (/^https:\/\//i.test(u) || (/^data:image\//i.test(u) && u.length < 24000)) ? u : '');

async function capture(reason) {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  const tabs = [];
  let skipped = 0;
  windows.filter((w) => !w.incognito).forEach((w, i) => {
    for (const t of w.tabs || []) {
      const url = t.pendingUrl || t.url;
      if (!isWeb(url)) { skipped++; continue; } // chrome://, file://, extensions etc. are left out
      tabs.push({ url, title: t.title || url, favIconUrl: cleanIcon(t.favIconUrl), windowIndex: i + 1, pinned: !!t.pinned });
    }
  });
  return { id: 'snap-' + Date.now().toString(36), createdAt: new Date().toISOString(), reason, tabs, skipped };
}

const sameTabs = (a, b) => a && b && a.tabs.length === b.tabs.length && a.tabs.every((t, i) => t.url === b.tabs[i].url);

async function store(snap) {
  const { snapshots = [] } = await chrome.storage.local.get('snapshots');
  // an auto-save that matches the last snapshot exactly adds nothing, so skip it
  if (snap.reason !== 'manual' && sameTabs(snap, snapshots[0])) return snapshots[0];
  snapshots.unshift(snap);
  await chrome.storage.local.set({ snapshots: snapshots.slice(0, KEEP), lastSave: snap.createdAt });
  return snap;
}

async function saveNow(reason = 'manual') {
  const snap = await capture(reason);
  if (!snap.tabs.length) return snap;
  return store(snap);
}

async function syncAlarm() {
  const { auto = true } = await chrome.storage.local.get('auto');
  if (auto) chrome.alarms.create(ALARM, { periodInMinutes: 30 });
  else chrome.alarms.clear(ALARM);
}

chrome.runtime.onInstalled.addListener(syncAlarm);
chrome.runtime.onStartup.addListener(async () => {
  await syncAlarm();
  const { auto = true } = await chrome.storage.local.get('auto');
  // give Chrome a moment to restore last session's tabs before capturing them
  if (auto) chrome.alarms.create(ALARM + '-startup', { delayInMinutes: 0.5 });
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) saveNow('auto');
  if (a.name === ALARM + '-startup') saveNow('startup');
});
chrome.storage.onChanged.addListener((c) => { if (c.auto) syncAlarm(); });

/* Messages from the popup */
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg?.type === 'saveNow') { saveNow('manual').then((snapshot) => reply({ snapshot })); return true; }
});

/* Messages from the Tab Shelf web page */
chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  const type = msg?.type;
  if (type === 'ping') { reply({ ok: true, version: chrome.runtime.getManifest().version }); return; }
  if (type === 'getSnapshots') { chrome.storage.local.get('snapshots').then(({ snapshots = [] }) => reply({ snapshots })); return true; }
  if (type === 'saveNow') { saveNow('manual').then((snapshot) => reply({ snapshot })); return true; }
  if (type === 'openTabs' && Array.isArray(msg.windows)) {
    // only ever open http(s) links, and never more than MAX_OPEN at once
    const wins = msg.windows.map((w) => (Array.isArray(w) ? w.filter(isWeb) : [])).filter((w) => w.length);
    const total = wins.reduce((n, w) => n + w.length, 0);
    if (!total || total > MAX_OPEN) { reply({ ok: false }); return; }
    Promise.all(wins.map((url) => chrome.windows.create({ url, focused: true })))
      .then(() => reply({ ok: true, opened: total }), () => reply({ ok: false }));
    return true;
  }
  reply({ ok: false, error: 'unknown message' });
});
