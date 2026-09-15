# What is 24+1? — Broadcast Timecode Calculator

A browser-based broadcast timecode calculator for integer, non-drop-frame rates. It includes Round, Duration, and Format tools and is ready for GitHub Pages.

## Run locally

No install or build step is required. Start any static file server from the project directory:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`.

## Test

Node.js 20 or later is recommended. The tests use only Node's built-in test runner:

```bash
npm test
```

## Illustration assets

The reference cloud and clapperboard have been redrawn as transparent SVG files in `assets/`. They remain sharp at every display density and can be adjusted independently without editing the page markup.

## Deploy with GitHub Pages

1. Create a public GitHub repository and upload the contents of this folder to its root.
2. In **Settings → Pages**, choose **Deploy from a branch**.
3. Select the `main` branch and `/ (root)` folder.
4. Open the Pages URL after deployment completes.

All resource links are relative and work under a repository subpath. Clipboard access requires HTTPS in normal browser use; GitHub Pages provides HTTPS.

## Supported scope

- Frame rates: 24, 25, 30, 50, and 60 fps
- Integer rates, non-drop-frame numbering only
- Inputs: seconds, `mm:ss`, `hh:mm:ss`, or `hh:mm:ss:ff`
- Outputs: `hh:mm:ss:ff`, `hh:mm:ss`, or accumulated `mm:ss`
- Local-only calculations; no accounts, analytics, API, or network dependency after load

Fractional rates and drop-frame timecode are intentionally outside v1.

## Project structure

```text
index.html             Page structure and accessible controls
styles.css             Responsive visual implementation
timecode.js            Pure parsing, formatting, rounding, and duration logic
app.js                 UI state, preferences, tabs, validation, and clipboard
tests/timecode.test.js Core acceptance and boundary tests
docs/                  Product and UI specifications
assets/                Approved illustration slots
```

## Before public release

- Visually compare the SVG illustrations and their placement with the approved references.
- Check 360, 768, 1280, and 1440 px widths and desktop 200% zoom.
- Test keyboard-only operation and clipboard success/failure on the deployed HTTPS URL.
- Run `npm test` and retain a passing result in the release checklist.
