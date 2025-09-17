# Repository Guidelines

## Project Structure & Module Organization
- Root contains the WebExtension: `manifest.json`, background (`background.js`), content script (`content.js`), popup UI (`popup.html`, `popup.js`).
- Shared utilities live under `modules/` (e.g., `modules/config-manager.js`).
- Assets live in `icons/` (e.g., `icons/icon16.png`).
- Keep feature-specific logic small and colocated (e.g., popup-specific code stays in `popup.js`).

## Build, Test, and Development Commands
- No build step required. Load unpacked in Chrome/Chromium:
  1) Open `chrome://extensions` → enable Developer mode
  2) Click “Load unpacked” → select this repo’s root folder
  3) Use “Reload” after changes; Inspect background/service worker and popup from the Extensions page.
- For Firefox: open `about:debugging#/runtime/this-firefox` → “Load Temporary Add-on” → pick `manifest.json`.

## Coding Style & Naming Conventions
- JavaScript (ES2019+) with 2-space indentation; end statements with semicolons.
- Prefer `const`/`let`, strict equality, and early returns.
- Filenames: existing are `kebab-case` or single words (e.g., `content.js`). Use `kebab-case` for new modules.
- Functions/variables in `camelCase`; exported objects in `camelCase`.
- Keep modules small; avoid global state—use `modules/config-manager.js` for storage/config.

## Testing Guidelines
- Manual validation flows:
  - Popup: open the extension popup, verify UI actions and console logs.
  - Content script: open a target page and check `content.js` effects in DevTools.
  - Background: inspect service worker logs from `chrome://extensions` → “Inspect views”.
- When adding non-DOM logic, include inline assertions (temporary) or a small demo page under `examples/` (not committed to store).

## Commit & Pull Request Guidelines
- Commits: imperative mood, concise scope prefix when helpful, e.g., `popup: fix button state` or `config: persist domain rules`.
- PRs must include:
  - Summary, rationale, and testing steps (reload instructions).
  - Screenshots/GIFs for popup/UI changes.
  - Note any `manifest.json` permission changes and why.
  - Reference issues (e.g., `Closes #123`).

## Security & Configuration Tips
- Request the least permissions in `manifest.json`; justify any new ones in PRs.
- Do not commit secrets or API keys. Use `chrome.storage` for user-configurable values via `config-manager`.
