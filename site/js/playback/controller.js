/* Playback sequencing and session lifecycle, independent of DOM and audio.
 * Classic script: the static PWA can initialize it synchronously, offline.
 * One pause-aware timer per channel (sequence and speech watchdog); generation
 * tokens prevent callbacks from cancelled or replaced sessions running later.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GhostBeadsPlayback = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createPlaybackController({
    now = () => performance.now(),
    setTimer = (fn, delay) => setTimeout(fn, delay),
    clearTimer = id => clearTimeout(id)
  } = {}) {
    let generation = 0;
    let phase = 'idle';
    let pausedAt = 0;
    const channels = new Map();

    function remove(channel) {
      const entry = channels.get(channel);
      if (entry) {
        if (entry.id !== null) clearTimer(entry.id);
        entry.revision++;
        channels.delete(channel);
      }
    }

    function cancelAll() {
      for (const channel of channels.keys()) remove(channel);
    }

    function scheduleEntry(channel, entry) {
      entry.due = now() + entry.remaining;
      const revision = ++entry.revision;
      entry.id = setTimer(() => {
        // A cancelled/replaced timer can still dispatch an already-queued
        // callback. It must never advance a newer exercise.
        if (channels.get(channel) !== entry || entry.generation !== generation ||
            entry.revision !== revision || phase === 'paused') return;
        channels.delete(channel);
        entry.id = null;
        entry.callback();
      }, entry.remaining);
    }

    function schedule(channel, callback, delayMs) {
      if (typeof channel !== 'string' || !channel || typeof callback !== 'function' ||
          !Number.isFinite(delayMs)) throw new TypeError('Invalid playback timer');
      remove(channel);
      const entry = {
        callback,
        remaining: Math.max(0, delayMs),
        due: 0,
        id: null,
        generation,
        revision: 0
      };
      channels.set(channel, entry);
      if (phase !== 'paused') scheduleEntry(channel, entry);
    }

    function begin({paused = false} = {}) {
      cancelAll();
      generation++;
      phase = paused ? 'paused' : 'playing';
      pausedAt = paused ? now() : 0;
      return generation;
    }

    function stop() {
      cancelAll();
      generation++;
      phase = 'cancelled';
      pausedAt = 0;
      return generation;
    }

    function complete() {
      cancelAll();
      generation++;
      phase = 'completed';
      pausedAt = 0;
    }

    function pause() {
      if (phase !== 'playing') return false;
      pausedAt = now();
      phase = 'paused';
      for (const entry of channels.values()) {
        if (entry.id === null) continue;
        clearTimer(entry.id);
        entry.id = null;
        entry.revision++;
        entry.remaining = Math.max(0, entry.due - pausedAt);
      }
      return true;
    }

    // Return paused time so the UI can shift its visual animation clock.
    function resume() {
      if (phase !== 'paused') return 0;
      const elapsed = Math.max(0, now() - pausedAt);
      pausedAt = 0;
      phase = 'playing';
      for (const [channel, entry] of channels) scheduleEntry(channel, entry);
      return elapsed;
    }

    return Object.freeze({
      begin, stop, complete, pause, resume, schedule,
      cancel: remove, cancelAll,
      isCurrent: token => token === generation,
      hasPending: channel => channels.has(channel),
      get token() { return generation; },
      get phase() { return phase; },
      get paused() { return phase === 'paused'; },
      get pausedAt() { return pausedAt; }
    });
  }

  return Object.freeze({createPlaybackController});
});
