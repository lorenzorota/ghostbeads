'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createProgressStore,dateKey,STORAGE_KEY}=require('../site/js/app/progress.js');
function storage(initial={}) {
  const data=new Map(Object.entries(initial));
  return {data,getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v))};
}
test('local date key uses calendar date without UTC conversion',()=>{
  assert.equal(dateKey(new Date(2026,10,23,23,59)), '2026-11-23');
  assert.equal(dateKey(new Date(2027,0,1)), '2027-01-01');
});
test('counts attempts and correct responses, retaining previous days',()=>{
  const st=storage({[STORAGE_KEY]:JSON.stringify({'2026-11-22':{done:2,correct:1}})});
  let day=new Date(2026,10,23,10,0);
  const p=createProgressStore({storage:st,now:()=>day});
  assert.deepEqual(p.today(),{done:0,correct:0});
  assert.deepEqual(p.record(true),{done:1,correct:1});
  assert.deepEqual(p.record(false),{done:2,correct:1});
  day=new Date(2026,10,24,10,0);
  assert.deepEqual(p.today(),{done:0,correct:0});
  p.record(true);
  assert.deepEqual(JSON.parse(st.getItem(STORAGE_KEY))['2026-11-22'],{done:2,correct:1});
  assert.deepEqual(JSON.parse(st.getItem(STORAGE_KEY))['2026-11-23'],{done:2,correct:1});
});
test('malformed storage and quota errors do not prevent local counting',()=>{
  const st={getItem:()=>'{invalid',setItem(){throw Error('quota')}};
  const p=createProgressStore({storage:st,now:()=>new Date(2026,10,23)});
  assert.deepEqual(p.today(),{done:0,correct:0});
  assert.deepEqual(p.record(true),{done:1,correct:1});
});
test('returned progress snapshots do not expose internal mutable data',()=>{
  const p=createProgressStore({storage:storage(),now:()=>new Date(2026,10,23)});
  const snapshot=p.record(true);
  snapshot.done=999;
  assert.deepEqual(p.today(),{done:1,correct:1});
});
