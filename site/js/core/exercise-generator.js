/* Pure exercise generation for the static GhostBeads PWA.
 * All arithmetic decisions are independent of the UI, playback, and storage.
 * A caller may inject a Math.random-compatible function for reproducible tests.
 * Keep the order of random draws intact: changing it changes the exercises.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GhostBeadsExercises = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Generate one exercise consisting of an opening number and N-1 operations.
   * numberCount counts all spoken numbers, including the opening number.
   * Each operation is {delta, value}, with value the cumulative total.
   * Valid digits are 1..4 and operationMode is 'add' or 'mixed'.
   */
  function generateExercise({digits, numberCount, operationMode}, random=Math.random) {
    if (!Number.isInteger(digits) || digits < 1 || digits > 4)
      throw new RangeError('digits must be an integer from 1 to 4');
    if (!Number.isSafeInteger(numberCount) || numberCount < 1 || numberCount > 1000)
      throw new RangeError('numberCount must be an integer from 1 to 1000');
    if (operationMode !== 'add' && operationMode !== 'mixed')
      throw new RangeError('operationMode must be add or mixed');
    if (typeof random !== 'function')
      throw new TypeError('random must be a function');

    const cap=10**digits-1, numOps=numberCount-1;
    if (operationMode === 'add' && numberCount > cap)
      throw new RangeError('Too many strictly positive numbers for the abacus');

    const randomInt=(lo,hi)=>lo+Math.floor(random()*(hi-lo+1));
    if (operationMode === 'add') {
      // Reserve one unit for each remaining addend, so all addends are
      // strictly positive without exceeding the visible soroban range.
      const initial=randomInt(1,Math.max(1,Math.min(cap-numOps,Math.floor(cap*.22))));
      let cur=initial;
      const operations=[];
      for (let i=0;i<numOps;i++) {
        const remaining=numOps-i-1;
        const possible=cap-cur-remaining;
        const average=(cap-cur)/(numOps-i);
        const maxJump=Math.max(1,Math.min(possible,Math.ceil(average*1.5)));
        const delta=randomInt(1,maxJump);
        cur+=delta;
        operations.push({delta,value:cur});
      }
      return {initial,operations};
    }

    const initial=Math.max(1,Math.floor(cap*(.20+random()*.55)));
    let cur=initial;
    const operations=[];
    for (let i=0;i<numOps;i++) {
      let positive=cur===0||(cur<cap&&random()>.5);
      let room=positive?cap-cur:cur;
      if (room===0) {positive=!positive;room=positive?cap-cur:cur;}
      const maxJump=Math.min(room,digits===1?8:Math.max(9,Math.floor(cap*.23)));
      const n=randomInt(1,Math.max(1,maxJump));
      const delta=positive?n:-n;
      cur+=delta;
      operations.push({delta,value:cur});
    }
    return {initial,operations};
  }

  return Object.freeze({generateExercise});
});
