# GhostBeads

A browser-based **soroban (Japanese abacus) and mental arithmetic training app**, featuring animated ghost beads, practice and test modes, and spoken number exercises.

GhostBeads is designed as an installable Progressive Web App (PWA), with offline support.

## Features

- Interactive soroban with animated ghost beads
- Mental arithmetic practice and test modes
- Spoken number exercises
- Customizable appearance and settings
- Mobile-friendly, installable PWA
- Offline functionality with cached assets

## Running locally

GhostBeads is a static web application. No build process is required to serve the included files.

Clone this repository and then start a local server from the cloned directory:

```bash
cd ghostbeads
python3 -m http.server 8000 --directory site
```

Open **http://localhost:8000** in your browser.

### Audio assets

Generated voice recordings are distributed separately and are not included in this repository. The core app can be installed for offline use without them, but voice exercises and offline speech playback require the corresponding files under `site/audio/`.

## Deployment

The contents of `site/` can be hosted on any static web server supporting HTTPS.

An optional GitHub Actions workflow supports automatic deployment over SSH using `rsync`. See [DEPLOYMENT.md](DEPLOYMENT.md) for configuration instructions.

## Tests

Run the regression tests with Node.js (version 20+):

```bash
node --test tests/*.test.js
```

## License

GhostBeads is open-source software licensed under the [MIT License](LICENSE).

Third-party libraries and assets remain subject to their respective licenses.
