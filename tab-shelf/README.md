# Tab Shelf

Save every Chrome tab in one click, so quitting or restarting Chrome never loses them. Sort tabs onto shelves you name ("School", "Inspo", "Read later"), search them, merge duplicates, and reopen a whole session in its original windows.

**Open it:** https://billyl0uis.github.io/30dayassignment/tab-shelf/

It comes in two pieces:

- **The web app** (`index.html`, `style.css`, `app.js`): plain HTML, CSS and JavaScript with no libraries and no build step.
- **The extension** (`extension/`): a tiny Chrome extension with one button, "Save all tabs".

## How to use it

1. **Load the extension once** (steps below), then click its toolbar icon and press **Save all tabs**. Tab Shelf opens with your tabs saved as a session.
2. **Sort them:** drag tabs onto shelves in the sidebar (or use the "Move to" menu on phone), rename sessions by clicking their title, and use **Duplicates** to merge repeats.
3. **Back up:** press **Export** now and then. The `.json` file is your real backup, because browser storage can get cleared. **Import** brings it back.

No extension? Use **Paste URLs** to paste a list of links.

## Load the extension (no Chrome Web Store)

1. In Chrome, go to `chrome://extensions`.
2. Turn on **Developer mode** (switch, top right).
3. Click **Load unpacked** and choose the `tab-shelf/extension` folder in this repo.
4. Click the puzzle-piece icon in the toolbar and pin **Tab Shelf** so its button is always visible.

The extension's ID will be `odimofkaeiedjjpnablahofeoaahfgog`. That's fixed by the public `key` in `manifest.json`, so the web app knows which extension to talk to. If you move the folder later, use **Reload** on that page.

### What the extension can and can't do

- **Permissions:** `tabs` (to read each tab's title, address and icon), `storage` (to keep the last 10 snapshots on this computer) and `alarms` (for auto-save). It has no access to page contents and no `<all_urls>`.
- **Who can talk to it:** only the Tab Shelf page on `billyl0uis.github.io/30dayassignment/` and `localhost` (`externally_connectable` in the manifest).
- **Auto-save:** every 30 minutes, and 30 seconds after Chrome starts (which captures the tabs Chrome restored). Identical snapshots are skipped. You can turn it off in the popup. Chrome has no "about to update" signal for extensions, so the 30-minute saves are the safety net.
- **Skipped tabs:** only `http://` and `https://` pages are saved. `chrome://` pages, files, and incognito windows are left out.
- **Fallback:** **Download .json** in the popup saves all snapshots to a file you can **Import** in the web app.

## Privacy

- Your tabs live only in this browser (`localStorage`) and in `.json` files you export. Nothing is uploaded, and there are no analytics or outside services.
- Export files are named `tabs-….json`, and `.gitignore` blocks `tabs-*.json`, so a backup can't be committed to this public repo by accident.
- Site icons are the ones the extension captured. They load straight from each site (never through Google's favicon service). Turn off **Show site icons** to load nothing at all, and you'll see letter tiles instead.
- Only `http://` and `https://` links can be saved or opened.
- The page has a strict Content Security Policy: no outside scripts, and no network requests from code.

## Run it locally

```bash
python3 -m http.server 5223 --directory tab-shelf
```

Then open http://localhost:5223/. In the extension popup, set **Open in** to "Local test server".

## How it's built

- **Data:** one object with `groups` (shelves), `sessions` (snapshots) and `tabs`. Each tab remembers the session it came from and can sit on one shelf. Everything you import is checked field by field before it's kept.
- **Drag and drop:** the browser's own HTML5 drag and drop, no library. On touch screens, the "Move to" menu does the same job.
- **Duplicates:** two addresses match if they only differ by `www.`, a `#fragment`, a trailing slash or tracking parameters (`utm_…`, `fbclid`, `gclid`). Merging keeps the copy that's already on a shelf, otherwise the newest.
- **Opening tabs:** with the extension, "Open all" on a session reopens it in its original windows. Without it, the browser opens the tabs itself and may ask you to allow pop-ups.
- **Undo:** deletes, merges and imports can be undone from the message at the bottom of the screen.
