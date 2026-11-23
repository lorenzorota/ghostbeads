'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bindSettingsChanges,bindSessionControls}=require('../site/js/ui/bindings.js');
function fakeControls(ids) {
  const els=Object.fromEntries(ids.map(id=>[id,{
    events:{},addEventListener(name,fn){(this.events[name]??=[]).push(fn)},
    fire(name,e={}){for(const fn of this.events[name]||[]) fn(e)}
  }]));
  return {els,getControl:id=>els[id]};
}
test('settings adapter passes the changed ID to application logic',()=>{
  const c=fakeControls(['digits','appearance']);
  const changed=[];
  bindSettingsChanges({getControl:c.getControl,ids:['digits','appearance'],onChange:id=>changed.push(id)});
  c.els.appearance.fire('change'); c.els.digits.fire('change');
  assert.deepEqual(changed,['appearance','digits']);
});
test('session adapter attaches every action exactly once and Enter checks answer',()=>{
  const names=['start','pause','previousStep','previousMove','nextMove','nextStep','repeatStep','stop','check'];
  const calls=[]; const c=fakeControls([...names,'answer']);
  const actions=Object.fromEntries(names.map(id=>[id,()=>calls.push(id)]));
  bindSessionControls({getControl:c.getControl,actions});
  for(const id of names)c.els[id].fire('click');
  c.els.answer.fire('keydown',{key:'Escape'});
  c.els.answer.fire('keydown',{key:'Enter'});
  assert.deepEqual(calls,[...names,'check']);
});
