'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSorobanRenderer}=require('../site/js/rendering/canvas.js');
const {digitsOf}=require('../site/js/core/soroban.js');
function harness() {
  let time=1000, draws=0, changes=0;
  const gradients={addColorStop(){}};
  const ctx={
    setTransform(){}, clearRect(){draws++}, createLinearGradient(){return gradients},
    beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},closePath(){},
    save(){},restore(){},fillRect(){},arc(){}
  };
  const canvas={clientWidth:300,clientHeight:480,
    getBoundingClientRect(){return {width:300,height:480}},getContext(){return ctx}};
  const state={value:0,columns:2,animationStart:0,motionTravelMs:850,
    motionFeel:'flick',motionFrom:null,motionTo:null,highlightColumn:-1,
    highlightSign:0,mode:'practice'};
  const callbacks=[];
  const renderer=createSorobanRenderer({canvas,state,playback:{paused:false,pausedAt:0},digitsOf,
    view:{devicePixelRatio:2,ResizeObserver:class{observe(){} }},
    now:()=>time,scheduleFrame:cb=>callbacks.push(cb),getTheme:()=> 'dark',
    getAnimationSpeed:()=>800,getMotionFeel:()=> 'flick',onValueChanged:()=>changes++});
  return {state,canvas,renderer,callbacks,setTime:t=>time=t,getDraws:()=>draws,getChanges:()=>changes};
}
test('renderer initializes bead state and schedules the first frame',()=>{
  const h=harness();
  assert.equal(h.canvas.width,600);
  assert.deepEqual(h.state.motionFrom,h.renderer.encoded(0,2));
  assert.deepEqual(h.state.motionTo,h.renderer.encoded(0,2));
  assert.equal(h.callbacks.length,1);
  h.callbacks.shift()(1100);
  assert.ok(h.getDraws()>0);
  assert.equal(h.callbacks.length,1);
});
test('instant moves use completed bead states; noninstant interpolate',()=>{
  const h=harness();
  h.renderer.moveTo(42,true);
  assert.equal(h.state.value,42);
  assert.deepEqual(h.renderer.frameAt(1002),h.renderer.encoded(42,2));
  h.renderer.moveTo(43,false,1,1);
  assert.equal(h.state.highlightColumn,1);
  assert.equal(h.state.highlightSign,1);
  assert.equal(h.state.motionTravelMs,272);
  h.setTime(1136);
  const midway=h.renderer.frameAt(1136);
  const final=h.renderer.encoded(43,2);
  assert.notDeepEqual(midway,final);
  h.setTime(1400);
  assert.deepEqual(h.renderer.frameAt(1400),final);
  assert.equal(h.getChanges(),2);
});
test('renderer hides bead activations in test mode without mutating stored value',()=>{
  const h=harness();
  h.renderer.moveTo(78,true);
  h.state.mode='test';
  assert.doesNotThrow(()=>h.callbacks.shift()(1200));
  assert.equal(h.state.value,78);
});
