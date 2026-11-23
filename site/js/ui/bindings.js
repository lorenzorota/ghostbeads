/* Classic page event wiring; interaction behavior remains in the app. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GhostBeadsUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function bindSettingsChanges({getControl, ids, onChange}) {
    for (const id of ids) getControl(id).addEventListener('change', () => onChange(id));
  }
  function bindSessionControls({getControl, actions}) {
    const onClick = (id, fn) => getControl(id).addEventListener('click', fn);
    onClick('start', actions.start);
    onClick('pause', actions.pause);
    onClick('previousStep', actions.previousStep);
    onClick('previousMove', actions.previousMove);
    onClick('nextMove', actions.nextMove);
    onClick('nextStep', actions.nextStep);
    onClick('repeatStep', actions.repeatStep);
    onClick('stop', actions.stop);
    onClick('check', actions.check);
    getControl('answer').addEventListener('keydown', e => {
      if (e.key === 'Enter') actions.check();
    });
  }
  return Object.freeze({bindSettingsChanges, bindSessionControls});
});
