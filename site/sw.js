/* Ghost Beads — genuine @zakisheriff/liquid-glass React controls. */
const CACHE_NAME = 'ghost-beads-app';
const AUDIO_CACHE = 'ghost-beads-audio-v40';
const PREVIOUS_WHOLE_VOICE_CACHE = 'ghost-beads-pwa-v39-whole-number-voice';
const REUSE_MARKER = new URL('__voice-reuse-legacy__', self.registration.scope).href;
const STATIC_ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './js/core/soroban.js',
  './js/core/exercise-generator.js',
  './glass/glass-app.js', './glass/glass-app.css',
  './glass/matte.css',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'
];
// Voice files are optional: an audio-free fork must still install offline.
const OPTIONAL_AUDIO_ASSETS = [
  './audio/audio-ready.mp3', './audio/test-voice.mp3',
  './audio/speech-map.json', './audio/voice-info.json'
];

function safeShardFile(name) {
  return /^numbers-\d+-(af_bella|af_heart)\.bin$/.test(name);
}
async function cacheMatch(request) {
  // Current app first. When upgrading from the legacy voice cache, shards remain in the
  // existing cache rather than being downloaded and stored a second time.
  const names = await caches.keys();
  for (const name of [CACHE_NAME, AUDIO_CACHE, PREVIOUS_WHOLE_VOICE_CACHE]) {
    if (!names.includes(name)) continue;
    const response = await (await caches.open(name)).match(request);
    if (response) return response;
  }
  return null;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const appCache = await caches.open(CACHE_NAME);
    await appCache.addAll(STATIC_ASSETS);
    // The bundled React runtime and Liquid Glass styles are in STATIC_ASSETS.
    // Do not carry over a reuse marker from a previous service-worker install.
    await appCache.delete(REUSE_MARKER);

    // Voice assets may not exist in public forks. Cache available metadata and
    // samples without making the install dependent on them.
    await Promise.all(OPTIONAL_AUDIO_ASSETS.map(path =>
      appCache.add(path).catch(() => {})
    ));

    // Keep the prior whole-number voice cache if audio cannot be refreshed.
    const keepLegacyAudio = async () => {
      if ((await caches.keys()).includes(PREVIOUS_WHOLE_VOICE_CACHE)) {
        await appCache.put(REUSE_MARKER, new Response('keep-legacy-audio'));
      }
    };

    const infoResponse = await appCache.match('./audio/voice-info.json');
    if (infoResponse) {
      try {
        const info = await infoResponse.json();
        const asset = /^speech-pack\.(wav|mp3)$/.test(info.asset || '')
          ? info.asset : 'speech-pack.mp3';

        const indexURL = './audio/number-pack-map.json';
        let wholeResponse;
        try { wholeResponse = await fetch(indexURL, {cache: 'no-store'}); }
        catch (_) { wholeResponse = null; }

        let index = null;
        if (wholeResponse && wholeResponse.ok) {
          try { index = await wholeResponse.clone().json(); }
          catch (_) { index = null; }
          if (index && (index.format !== 'mp3-shards-v1' || !Array.isArray(index.shards))) index = null;
          if (index && index.shards.some(shard => !safeShardFile(shard.file)))
            throw Error('Invalid full-number audio shard filename');
        }

        // The legacy PWA had downloaded all voice shards before activation. Compare
        // the fresh index to the old one to avoid accidentally reusing a changed
        // voice pack. If it matches, KEEP that cache on activation and fetch from it.
        let reusePreviousPack = false;
        const names = await caches.keys();
        if (names.includes(PREVIOUS_WHOLE_VOICE_CACHE) && !index) {
          await keepLegacyAudio();
        }
        if (names.includes(PREVIOUS_WHOLE_VOICE_CACHE) && index) {
          const previous = await caches.open(PREVIOUS_WHOLE_VOICE_CACHE);
          const oldIndex = await previous.match(indexURL);
          const oldVoice = await previous.match('./audio/' + asset);
          if (oldIndex && oldVoice &&
              (await oldIndex.text()) === (await wholeResponse.clone().text())) {
            // The previous full installation is atomic: all shards were cached before
            // skipWaiting(). A quick final-shard check helps detect manual eviction.
            const last = index.shards[index.shards.length-1];
            reusePreviousPack = !last || !!(await previous.match('./audio/' + last.file));
          }
        }

        if (reusePreviousPack) {
          await appCache.put(REUSE_MARKER, new Response('keep-legacy-audio'));
        } else {
          // Reuse the dedicated audio cache as-is if its index and assets
          // still match. Do not download the ~100 MB Kokoro pack a second time.
          const audio = await caches.open(AUDIO_CACHE);
          const oldIndex = index ? await audio.match(indexURL) : null;
          const oldVoice = await audio.match('./audio/' + asset);
          const last = index?.shards[index.shards.length-1];
          const lastShard = !last || !!(await audio.match('./audio/' + last.file));
          const sameIndex = index && oldIndex &&
            (await oldIndex.text()) === (await wholeResponse.clone().text());
          if (!(oldVoice && (!index || (sameIndex && lastShard)))) {
            // For fresh installs, preload the pack before activating this SW.
            // Errors abort installation, keeping the old working PWA active.
            await audio.add('./audio/' + asset);
            if (index) {
              await audio.put(indexURL, wholeResponse.clone());
              for (const shard of index.shards)
                await audio.add('./audio/' + shard.file);
            }
          }
        }
      } catch (error) {
        // Partial, missing or quota-limited voice packs must not prevent the
        // core PWA from updating. Keep older cached audio where possible.
        await keepLegacyAudio();
        console.warn('Optional offline audio could not be fully cached:', error);
      }
    } else {
      await keepLegacyAudio();
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const appCache = await caches.open(CACHE_NAME);
    const keepPrevious = !!(await appCache.match(REUSE_MARKER));
    const retain = new Set([CACHE_NAME, AUDIO_CACHE]);
    if (keepPrevious) retain.add(PREVIOUS_WHOLE_VOICE_CACHE);
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('ghost-beads-') && !retain.has(n))
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  // Safari may request an individual MP3 (or the original WAV) using a range.
  // Synthesized range responses work even when the file only exists in the legacy cache.
  if (request.headers.has('Range') && /\.(mp3|wav)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await cacheMatch(request.url);
      if (!cached) return fetch(request);
      const bytes = await cached.arrayBuffer();
      const range = /^bytes=(\d*)-(\d*)$/i.exec(request.headers.get('Range') || '');
      if (!range) return cached;
      const size = bytes.byteLength;
      let start = range[1] === '' ? Math.max(0, size-Number(range[2])) : Number(range[1]);
      let end = range[1] === '' ? size-1 : (range[2] ? Number(range[2]) : size-1);
      if (start >= size || start > end) return new Response(null, {
        status: 416, headers: {'Content-Range': `bytes */${size}`}
      });
      end = Math.min(end, size-1);
      return new Response(bytes.slice(start, end+1), {
        status: 206,
        headers: {
          'Content-Type': cached.headers.get('Content-Type') ||
            (/\.wav$/i.test(url.pathname) ? 'audio/wav' : 'audio/mpeg'),
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${size}`,
          'Content-Length': String(end-start+1)
        }
      });
    })());
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch (_) {
        const cached = await cacheMatch(request) ||
          await cacheMatch('./index.html') || await cacheMatch('./');
        return cached || Response.error();
      }
    })());
    return;
  }

  // Revalidate UI files while online, but use Cache Storage when offline.
  // This avoids manual ?v=... asset revisions and cache-name increments.
  if (/\.(?:js|css|webmanifest|png|svg|webp|jpe?g|ico)$/i.test(url.pathname)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, {cache: 'no-cache'});
        if (response.ok) {
          const appCache = await caches.open(CACHE_NAME);
          appCache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch (_) {
        return await cacheMatch(request) || Response.error();
      }
    })());
    return;
  }

  // Large audio files and their metadata remain cache-first.
  event.respondWith((async () => {
    const cached = await cacheMatch(request);
    return cached || fetch(request);
  })());
});
