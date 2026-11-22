'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const site=path.join(__dirname,'../site');
const scripts=[
 'js/core/soroban.js','js/core/exercise-generator.js','js/playback/controller.js',
 'js/app/settings.js','js/app/progress.js','js/rendering/canvas.js',
 'js/ui/settings-dialog.js','js/ui/bindings.js','js/app/main.js'
];
test('classic browser dependencies load in order and are available offline',()=>{
  const html=fs.readFileSync(path.join(site,'index.html'),'utf8');
  const sw=fs.readFileSync(path.join(site,'sw.js'),'utf8');
  let last=-1;
  for (const file of scripts){
    const tag=`<script src="./${file}"></script>`;
    const pos=html.indexOf(tag);
    assert.ok(pos>=0,`${file} must be referenced by index.html`);
    assert.ok(pos>last,`${file} loads out of order`);
    assert.ok(fs.statSync(path.join(site,file)).size>0,`missing ${file}`);
    assert.ok(sw.includes(`'./${file}'`),`missing precache entry for ${file}`);
    last=pos;
  }
});
test('extracted stores and UI adapters export classic browser globals',()=>{
  const vm=require('node:vm');
  const exports={
    'js/app/settings.js':['GhostBeadsSettings','createSettingsStore'],
    'js/app/progress.js':['GhostBeadsProgress','createProgressStore'],
    'js/rendering/canvas.js':['GhostBeadsCanvas','createSorobanRenderer'],
    'js/ui/settings-dialog.js':['GhostBeadsDialog','attachSettingsDialog'],
    'js/ui/bindings.js':['GhostBeadsUI','bindSessionControls']
  };
  for(const [file,[namespace,method]] of Object.entries(exports)){
    const ctx={}; ctx.globalThis=ctx;
    vm.runInNewContext(fs.readFileSync(path.join(site,file),'utf8'),ctx);
    assert.equal(typeof ctx[namespace][method],'function',`${file} global missing`);
  }
});
