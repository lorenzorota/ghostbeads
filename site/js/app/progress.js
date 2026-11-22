/* Daily per-device progress, isolated from labels, DOM, and exercise flow. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GhostBeadsProgress = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'ghostBeadsProgressV1';
  function dateKey(date = new Date()) {
    return [date.getFullYear(), String(date.getMonth()+1).padStart(2,'0'),
      String(date.getDate()).padStart(2,'0')].join('-');
  }
  function createProgressStore({storage, now = () => new Date()} = {}) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function')
      throw new TypeError('A Storage-compatible adapter is required');
    let progress = {};
    try { progress = JSON.parse(storage.getItem(STORAGE_KEY) || '{}') || {}; }
    catch (_) { progress = {}; }
    // Do not expose the mutable storage snapshot to UI consumers.
    function today() {
      const p = progress[dateKey(now())] || {done:0, correct:0};
      return {done:p.done, correct:p.correct};
    }
    function record(correct) {
      const key = dateKey(now());
      const p = progress[key] || {done:0, correct:0};
      p.done++;
      if (correct) p.correct++;
      progress[key] = p;
      try { storage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch (_) {}
      return today();
    }
    return Object.freeze({today, record});
  }
  return Object.freeze({createProgressStore, dateKey, STORAGE_KEY});
});
