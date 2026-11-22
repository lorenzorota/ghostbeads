#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -s site/index.html ]]; then
  echo 'Missing or empty site/index.html' >&2
  exit 1
fi
# These files are referenced by the app shell and must be included in deploys.
for asset in \
  site/sw.js \
  site/js/core/soroban.js \
  site/manifest.webmanifest \
  site/glass/glass-app.js \
  site/glass/glass-app.css \
  site/glass/matte.css
do
  if [[ ! -s "$asset" ]]; then
    echo "Missing or empty $asset" >&2
    exit 1
  fi
done
if [[ -n "$(find site -type l -print -quit)" ]]; then
  echo 'Review symbolic links before publishing; none are allowed in site/.' >&2
  exit 1
fi
if [[ -f site/sw.js ]]; then
  node --check site/sw.js
  node --check site/js/core/soroban.js
fi
if [[ -f site/manifest.webmanifest ]]; then
  python3 -m json.tool site/manifest.webmanifest > /dev/null
fi
node --test tests/*.test.js
printf 'Static site checks passed.\n'
