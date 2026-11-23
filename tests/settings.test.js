'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSettingsStore, SETTINGS_IDS, STORAGE_KEY}=require('../site/js/app/settings.js');
function storage(initial={}) {
  const data=new Map(Object.entries(initial));
  return {data, getItem:k=>data.has(k)?data.get(k):null,
    setItem:(k,v)=>data.set(k,String(v))};
}
function controls() {
  const els=Object.fromEntries(SETTINGS_IDS.map(id=>[id, {
    type: ['showTotal','practiceVoice','testVoiceEnabled'].includes(id)?'checkbox':'select-one',
    checked:false,value:'default',options:[{value:'default'},{value:'saved'},{value:'2'}]
  }]));
  return els;
}
test('V4 settings take priority over V3 and V2, retaining legacy values',()=>{
  const st=storage({ghostBeadsSettingsV2:'{"digits":"2"}',ghostBeadsSettingsV3:'{"digits":"saved"}',
    [STORAGE_KEY]:'{"digits":"default"}'});
  assert.equal(createSettingsStore({storage:st}).load().digits,'default');
  st.data.delete(STORAGE_KEY);
  assert.equal(createSettingsStore({storage:st}).load().digits,'saved');
  st.data.delete('ghostBeadsSettingsV3');
  assert.equal(createSettingsStore({storage:st}).load().digits,'2');
});
test('malformed newer settings fall back to defaults, not older settings',()=>{
  const st=storage({[STORAGE_KEY]:'{broken',ghostBeadsSettingsV3:'{"digits":"2"}'});
  assert.deepEqual(createSettingsStore({storage:st}).load(),{});
});
test('apply selects only valid saved options and defers voice selection',()=>{
  const st=storage(),els=controls();
  const s=createSettingsStore({storage:st,getControl:id=>els[id]});
  s.applyToControls({digits:'2',operationMode:'unknown',showTotal:1,voice:'saved'});
  assert.equal(els.digits.value,'2');
  assert.equal(els.operationMode.value,'default');
  assert.equal(els.showTotal.checked,true);
  assert.equal(els.voice.value,'default');
  s.applyToControls({voice:'saved'},{skipVoice:false});
  assert.equal(els.voice.value,'saved');
});
test('capture and save preserves checkbox booleans and all setting IDs',()=>{
  const st=storage(),els=controls();
  els.showTotal.checked=true;
  const s=createSettingsStore({storage:st,getControl:id=>els[id]});
  const captured=s.captureControls();
  assert.equal(captured.showTotal,true);
  assert.equal(Object.keys(captured).length,SETTINGS_IDS.length);
  s.save(captured);
  assert.deepEqual(JSON.parse(st.getItem(STORAGE_KEY)),captured);
});
test('selected mode survives reload and falls back safely',()=>{
  const st=storage(); const s=createSettingsStore({storage:st});
  assert.equal(s.loadMode(),'practice');
  s.saveMode('test');
  assert.equal(createSettingsStore({storage:st}).loadMode(),'test');
  st.setItem('ghostBeadsSelectedMode','other');
  assert.equal(s.loadMode(),'practice');
});
test('storage failures do not crash settings reads or writes',()=>{
  const bad={getItem(){throw Error('denied')},setItem(){throw Error('denied')}};
  const s=createSettingsStore({storage:bad});
  assert.deepEqual(s.load(),{});
  assert.equal(s.loadMode(),'practice');
  assert.deepEqual(s.save({digits:'2'}),{digits:'2'});
  assert.doesNotThrow(()=>s.saveMode('test'));
});
