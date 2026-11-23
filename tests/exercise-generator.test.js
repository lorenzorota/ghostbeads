'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {generateExercise} = require('../site/js/core/exercise-generator.js');
const fixtures = require('./fixtures/exercises.json');

function seededRandom(seed){
  let state=seed>>>0;
  return () => {state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
}

// These are actual outputs of makeSession() extracted from the original HTML
// and run with seeded Math.random. They cover both modes, 1-4 digits,
// 1-20 spoken numbers, and a range of pseudorandom seeds.
test('preserves exercise sequences from the original inline implementation',()=>{
  for(const {options,seed,expected} of fixtures){
    assert.deepStrictEqual(generateExercise(options,seededRandom(seed)),expected,
      `Generator mismatch for ${JSON.stringify(options)}, seed ${seed}`);
  }
});

test('every generated step stays within the abacus and the configured mode',()=>{
  for(const digits of [1,2,3,4]){
    const cap=10**digits-1;
    for(const operationMode of ['add','mixed']){
      for(const numberCount of [1,2,3,5,10,15,20]){
        if(operationMode==='add' && numberCount>cap)continue;
        for(let seed=1;seed<=45;seed++){
          const result=generateExercise({digits,numberCount,operationMode},seededRandom(seed*137+digits*97));
          assert.ok(Number.isInteger(result.initial)&&result.initial>=1&&result.initial<=cap);
          assert.equal(result.operations.length,numberCount-1);
          let previous=result.initial;
          for(const op of result.operations){
            assert.ok(Number.isInteger(op.delta)&&op.delta!==0);
            assert.ok(Number.isInteger(op.value)&&op.value>=0&&op.value<=cap);
            assert.equal(op.value,previous+op.delta);
            if(operationMode==='add')assert.ok(op.delta>0);
            previous=op.value;
          }
        }
      }
    }
  }
});

test('edge random values retain legal exercises',()=>{
  for(const random of [()=>0,()=>1-Number.EPSILON]){
    for(const digits of [1,2,3,4])for(const operationMode of ['add','mixed']){
      const cap=10**digits-1;
      const numberCount=operationMode==='add'?Math.min(20,cap):20;
      const {initial,operations}=generateExercise({digits,numberCount,operationMode},random);
      let current=initial;
      for(const op of operations){
        assert.equal(op.value,current+op.delta);
        assert.ok(op.value>=0&&op.value<=cap);
        current=op.value;
      }
    }
  }
});

test('generator is deterministic with a supplied random function',()=>{
  const options={digits:3,numberCount:20,operationMode:'mixed'};
  assert.deepStrictEqual(generateExercise(options,seededRandom(444)),generateExercise(options,seededRandom(444)));
});

test('rejects invalid settings instead of generating impossible exercises',()=>{
  const good={digits:2,numberCount:10,operationMode:'add'};
  for(const options of [
    {...good,digits:0},{...good,digits:5},{...good,digits:1.5},
    {...good,numberCount:0},{...good,numberCount:1001},
    {...good,numberCount:1.5},{...good,numberCount:NaN},
    {...good,digits:1,numberCount:10},
    {...good,operationMode:'divide'}
  ]) assert.throws(()=>generateExercise(options,seededRandom(33)),`${JSON.stringify(options)} should be rejected`);
  assert.throws(()=>generateExercise(good,42),TypeError);
});

test('classic browser script publishes a usable global API without a bundler',()=>{
  const vm=require('node:vm');
  const fs=require('node:fs');
  const context={};
  context.globalThis=context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../site/js/core/exercise-generator.js'),'utf8'),context);
  assert.equal(typeof context.GhostBeadsExercises.generateExercise,'function');
  const result=context.GhostBeadsExercises.generateExercise({digits:2,numberCount:3,operationMode:'add'},()=>0);
  assert.equal(result.operations.length,2);
  assert.ok(result.initial>=1);
});

test('browser loads the generator before the application and pre-caches it offline',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const index=fs.readFileSync(path.join(__dirname,'../site/index.html'),'utf8');
  const serviceWorker=fs.readFileSync(path.join(__dirname,'../site/sw.js'),'utf8');
  const scriptTag='<script src="./js/core/exercise-generator.js"></script>';
  const appTag='<script src="./js/app/main.js"></script>';
  const main=fs.readFileSync(path.join(__dirname,'../site/js/app/main.js'),'utf8');
  assert.ok(index.includes(scriptTag),'Browser script tag is missing');
  assert.ok(index.indexOf(scriptTag)<index.indexOf(appTag),'Generator must load before app startup');
  assert.ok(main.includes('window.GhostBeadsExercises.generateExercise('));
  assert.ok(serviceWorker.includes("'./js/core/exercise-generator.js'"),'Offline shell must cache module');
});

test('generated exercises remain compatible with every movement-detail level',()=>{
  const {humanMovePlan}=require('../site/js/core/soroban.js');
  for(const {options,seed} of fixtures.filter((_,i)=>i%3===0)){
    const {initial,operations}=generateExercise(options,seededRandom(seed));
    for(const level of [1,2,3,4]){
      let current=0;
      for(const target of [initial,...operations.map(op=>op.value)]){
        const moves=humanMovePlan(current,target-current,options.digits,level);
        const last=moves.at(-1)?.value??current;
        assert.equal(last,target,`Movement output mismatch for ${JSON.stringify(options)}`);
        current=last;
      }
    }
  }
});
