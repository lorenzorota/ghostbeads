/* Pure soroban movement planning. No DOM, UI state, timers, or storage.
 * Kept as a classic script so the existing no-build static PWA retains its
 * synchronous initialization and supports offline use.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GhostBeadsCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const digitsOf=(n,count)=>Array.from({length:count},(_,i)=>Math.floor(Math.max(0,n)/10**(count-i-1))%10);

  // Four detail levels, all generated from the same arithmetic.  The
  // grouping level affects only the animation, never the result.
  //
  // L1: split any change that involves BOTH the five-bead and lower beads,
  //     including same-direction initial placement (0 -> 7: +5, +2)
  //     and opposite-direction friends (3 -> 5: +5, -3).
  // L2: one coordinated move per affected rod (legacy behavior).
  // L3: all the rod changes belonging to one operand digit at once.
  // L4: all changes belonging to the entire spoken number at once.
  function humanMovePlan(initial,delta,columns,detailLevel=2){
    const max=10**columns-1;
    const level=Number(detailLevel);
    if(!Number.isInteger(initial)||!Number.isInteger(delta)||
       !Number.isInteger(columns)||columns<1||columns>4||
       ![1,2,3,4].includes(level)||initial<0||initial>max||
       initial+delta<0||initial+delta>max)
      throw Error('Operation is outside the visible abacus');
    if(delta===0)return [];
    if(level===4)return [{value:initial+delta,column:-2,shift:delta,
      label:(delta>0?'+':'−')+Math.abs(delta)+' · full number',
      termId:0,termShift:delta,termPlace:0}];

    let current=initial;
    const moves=[];
    const magnitude=Math.abs(delta),sign=Math.sign(delta);
    let termId=0;
    const colName=['ones','tens','hundreds','thousands'];
    for(let place=columns-1;place>=0;place--){
      const power=10**place;
      const amount=Math.floor(magnitude/power)%10;
      if(!amount)continue;
      const termShift=sign*amount*power;
      const destination=current+termShift;
      if(destination<0||destination>max)throw Error('Place-value step outside the abacus');
      const before=digitsOf(current,columns),after=digitsOf(destination,columns);
      let intermediate=current;
      for(let j=0;j<columns;j++){
        const from=before[j],to=after[j];
        if(from===to)continue;
        const rodPower=10**(columns-j-1);
        const rodShift=(to-from)*rodPower;
        // Full composition (Level 1): the five-bead and lower beads are
        // always distinct hand actions when both sets change. This includes
        // *setting* digits from zero, e.g. 0 -> 7 = +5, +2, as well as
        // five-friend exchanges such as 3 -> 5 = +5, -3.
        // Other levels keep the single coordinated rod movement.
        const upperShift=(Number(to>=5)-Number(from>=5))*5*rodPower;
        const lowerShift=(to%5-from%5)*rodPower;
        const parts=level===1&&upperShift!==0&&lowerShift!==0
          ? [upperShift,lowerShift] : [rodShift];
        for(let part=0;part<parts.length;part++){
          const shift=parts[part];
          intermediate+=shift;
          if(intermediate<0||intermediate>max)throw Error('Intermediate move outside the abacus');
          moves.push({value:intermediate,column:j,shift,
            label:(shift>0?'+':'−')+(level===1?Math.abs(shift/rodPower):Math.abs(shift))+' · '+colName[columns-j-1]+
                  (parts.length===2?' · '+(part===0?'five bead':'lower beads'):''),
            from,to,termId,termShift,termPlace:place});
        }
      }
      if(intermediate!==destination)throw Error('Incorrect carry or borrow');
      current=destination;
      termId++;
    }
    if(current!==initial+delta)throw Error('Operation plan does not balance');
    if(level===3){
      // Collapse each operand digit's carry or borrow across rods.  Grouping
      // is based on arithmetic terms, not on how many beads were moved.
      const grouped=[];
      let fromValue=initial;
      for(const move of moves){
        const last=grouped[grouped.length-1];
        if(last&&last.termId===move.termId){
          last.value=move.value;
          last.shift=last.value-fromValue;
        }else{
          if(last)fromValue=last.value;
          grouped.push({value:move.value,column:-2,shift:move.value-fromValue,
            label:(move.termShift>0?'+':'−')+Math.abs(move.termShift)+
              ' · '+colName[move.termPlace],
            termId:move.termId,termShift:move.termShift,termPlace:move.termPlace});
        }
      }
      return grouped;
    }
    return moves;
  }
  // An exercise's arithmetic is immutable; only the grouping of its bead
  // actions changes with Movement detail. When the user switches granularity
  // mid-operation, the currently selected *bead value* must not jump.
  //
  // At ordinary boundaries we can remap the cursor directly into the new
  // plan. If the user is partway through a five-friend composition, that value
  // may not be a boundary in the coarser plan. In that case retain the
  // performed prefix and regroup only the remaining atomic Level-1 actions.
  function regroupRemainingAtoms(atoms,level,fromValue,finalValue,columns){
    if(!atoms.length)return [];
    if(level===1)return atoms.map(m=>({...m}));
    if(level===4)return [{value:finalValue,column:-2,shift:finalValue-fromValue,
      label:'Complete remaining number',termId:atoms[0].termId,
      termShift:finalValue-fromValue,termPlace:atoms[0].termPlace}];
    const groups=[];
    let startValue=fromValue;
    for(const atom of atoms){
      const last=groups[groups.length-1];
      const same=last&&(level===3 ? last.termId===atom.termId
        :last.termId===atom.termId&&last.column===atom.column);
      if(same){
        last.value=atom.value;
        last.shift=atom.value-startValue;
        if(level===2)last.label=(last.shift>=0?'+':'−')+Math.abs(last.shift)+
          ' · '+['ones','tens','hundreds','thousands'][columns-last.column-1];
      }else{
        if(last)startValue=last.value;
        const colName=['ones','tens','hundreds','thousands'];
        groups.push({value:atom.value,column:level===3?-2:atom.column,
          shift:atom.value-startValue,
          label:level===3
            ?(atom.termShift>=0?'+':'−')+Math.abs(atom.termShift)+' · '+colName[atom.termPlace]
            :(atom.shift>=0?'+':'−')+Math.abs(atom.shift)+' · '+colName[columns-atom.column-1],
          termId:atom.termId,termShift:atom.termShift,termPlace:atom.termPlace});
      }
    }
    return groups;
  }
  return Object.freeze({digitsOf,humanMovePlan,regroupRemainingAtoms});
});
