/* Local settings persistence and DOM control mapping for the classic UI.
 * The store can be exercised without a DOM or real localStorage.
 * Keep existing V4 semantics and V3/V2 fallbacks for old installations.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GhostBeadsSettings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SETTINGS_IDS = Object.freeze([
    'appearance', 'digits', 'operationMode', 'steps', 'animationSpeed',
    'delay', 'rate', 'voice', 'showTotal', 'moveDetail', 'motionFeel',
    'practiceVoice', 'testVoiceEnabled', 'speechEngine'
  ]);
  const STORAGE_KEY = 'ghostBeadsSettingsV4';
  const LEGACY_KEYS = Object.freeze(['ghostBeadsSettingsV3', 'ghostBeadsSettingsV2']);
  const MODE_KEY = 'ghostBeadsSelectedMode';

  function createSettingsStore({storage, getControl} = {}) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function')
      throw new TypeError('A Storage-compatible adapter is required');
    function load() {
      // First non-empty setting wins, even when malformed: same semantics as
      // the original V4 || V3 || V2 expression.
      try {
        let raw;
        for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) {
          raw = storage.getItem(key);
          if (raw) break;
        }
        return JSON.parse(raw || '{}') || {};
      } catch (_) { return {}; }
    }
    function applyToControls(data, {skipVoice = true} = {}) {
      if (typeof getControl !== 'function') throw new TypeError('getControl is required');
      for (const id of SETTINGS_IDS) {
        const el = getControl(id);
        if (skipVoice && id === 'voice') continue;
        if (!el || data[id] === undefined) continue;
        if (el.type === 'checkbox') el.checked = Boolean(data[id]);
        else if (el.options && Array.from(el.options).some(o => o.value === String(data[id])))
          el.value = String(data[id]);
      }
    }
    function captureControls() {
      if (typeof getControl !== 'function') throw new TypeError('getControl is required');
      const item = {};
      for (const id of SETTINGS_IDS) {
        const el = getControl(id);
        item[id] = el.type === 'checkbox' ? el.checked : el.value;
      }
      return item;
    }
    function save(data) {
      try { storage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
      return data;
    }
    function loadMode() {
      try { return storage.getItem(MODE_KEY) === 'test' ? 'test' : 'practice'; }
      catch (_) { return 'practice'; }
    }
    function saveMode(mode) {
      try { storage.setItem(MODE_KEY, mode); } catch (_) {}
    }
    return Object.freeze({load, save, applyToControls, captureControls, loadMode, saveMode});
  }
  return Object.freeze({createSettingsStore, SETTINGS_IDS, STORAGE_KEY, LEGACY_KEYS, MODE_KEY});
});
