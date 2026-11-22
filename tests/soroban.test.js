'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {digitsOf,humanMovePlan,regroupRemainingAtoms}=require('../site/js/core/soroban.js');
const fixtures=require('./fixtures/movement-plans.json');

test('preserves movement-plan output from the original implementation',()=>{
  for(const {args,expected} of fixtures){
    assert.deepStrictEqual(humanMovePlan(...args),expected,`Mismatch: ${JSON.stringify(args)}`);
  }
});
test('all levels reach the target and moves form an arithmetic chain',()=>{
  for(let columns=1;columns<=4;columns++){
    const cap=10**columns-1;
    for(let i=0;i<250;i++){
      const initial=Math.floor((i*7919%1009)/1009*(cap+1));
      const target=Math.floor((i*1543+19)%1021/1021*(cap+1));
      for(let level=1;level<=4;level++){
        const moves=humanMovePlan(initial,target-initial,columns,level);
        let current=initial;
        for(const move of moves){
          assert.equal(current+move.shift,move.value,`Bad shift ${columns}/${level}: ${JSON.stringify(move)}`);
          current=move.value;
          assert.ok(current>=0&&current<=cap,'Intermediate is outside abacus');
        }
        assert.equal(current,target);
      }
    }
  }
});
test('zero changes produce no movement',()=>{
  for(let cols=1;cols<=4;cols++)for(let level=1;level<=4;level++)
    assert.deepStrictEqual(humanMovePlan(3,0,cols,level),[]);
});
test('rejects invalid inputs and out-of-range results',()=>{
  for(const args of [[-1,1,2,2],[100,1,2,2],[5,-6,2,2],[5,100,2,2],[5,1,0,2],[5,1,5,2],[5,1,2,7],[1.2,2,2,1]])
    assert.throws(()=>humanMovePlan(...args));
});
test('digit extraction matches displayed place values',()=>{
  assert.deepStrictEqual(digitsOf(1234,4),[1,2,3,4]);
  assert.deepStrictEqual(digitsOf(7,3),[0,0,7]);
});
test('regrouping remaining atomic moves preserves a partial five-friend exchange',()=>{
  const atoms=humanMovePlan(3,2,1,1);
  assert.equal(atoms.length,2);
  assert.equal(atoms[0].value,8);
  const remaining=atoms.slice(1);
  for(const level of [1,2,3,4]){
    const grouped=regroupRemainingAtoms(remaining,level,8,5,1);
    assert.equal(grouped.at(-1).value,5);
    assert.equal(grouped.reduce((v,m)=>v+m.shift,8),5);
  }
});
