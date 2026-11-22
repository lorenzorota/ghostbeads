/* Classic Settings modal and iOS drag-to-dismiss UI adapter. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GhostBeadsDialog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function attachSettingsDialog({getControl, view, now, setTimer, clearTimer}) {
    const $=getControl, window=view;
  const dialog=$('settingsDialog');
  let sheetCloseTimer=null;
  function clearSheetDrag(){
    if(sheetCloseTimer){clearTimer(sheetCloseTimer);sheetCloseTimer=null;}
    dialog.classList.remove('sheet-dragging');
    dialog.style.transition='';dialog.style.transform='';dialog.style.opacity='';
  }
  function openSettings(){
    if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    if(window.ghostApplePWA){
      clearSheetDrag();
      dialog.querySelector('.modal-body').scrollTop=0;
      // showModal() automatically focuses the first button (the X).
      // Focus the heading instead, without a visible blue ring.
      const title=$('settingsTitle');
      if(title)try{title.focus({preventScroll:true})}catch(_){title.focus()}
    }
  }
  function closeSettings(){
    clearSheetDrag();
    if(typeof dialog.close==='function'&&dialog.open)dialog.close();
    else dialog.removeAttribute('open');
  }
  if(window.ghostApplePWA){
    const header=dialog.querySelector('.modal-head');
    const handle=$('settingsDragHandle');
    let gesture=null;
    const canDrag=()=>window.matchMedia('(max-width:640px)').matches;
    function onDown(e){
      if(!canDrag()||!dialog.open||(e.pointerType==='mouse'&&e.button!==0))return;
      if(e.target.closest('button,input,select,a'))return;
      if(e.isPrimary===false)return;
      gesture={id:e.pointerId,at:e.clientY,last:e.clientY,start:now(),dy:0};
      try{header.setPointerCapture(e.pointerId)}catch(_){}
      dialog.classList.add('sheet-dragging');
      dialog.style.transition='none';
    }
    function onMove(e){
      if(!gesture||e.pointerId!==gesture.id)return;
      const dy=Math.max(0,e.clientY-gesture.at);
      gesture.dy=dy;gesture.last=e.clientY;
      dialog.style.transform=`translate3d(0,${dy}px,0)`;
    }
    function onEnd(e){
      if(!gesture||e.pointerId!==gesture.id)return;
      const g=gesture;gesture=null;
      dialog.classList.remove('sheet-dragging');
      const duration=Math.max(1,now()-g.start);
      const speed=g.dy/duration;
      const dismiss=g.dy>115 || (g.dy>42&&speed>.55);
      const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      dialog.style.transition=reduceMotion?'none':'transform 180ms cubic-bezier(.24,.75,.3,1)';
      if(dismiss){
        dialog.style.transform='translate3d(0,105%,0)';
        sheetCloseTimer=setTimer(()=>{sheetCloseTimer=null;closeSettings()},reduceMotion?0:185);
      }else{
        dialog.style.transform='translate3d(0,0,0)';
        sheetCloseTimer=setTimer(()=>{sheetCloseTimer=null;clearSheetDrag()},reduceMotion?0:185);
      }
    }
    function onCancel(e){
      if(!gesture||e.pointerId!==gesture.id)return;
      gesture=null;clearSheetDrag();
    }
    header.addEventListener('pointerdown',onDown);
    header.addEventListener('pointermove',onMove);
    header.addEventListener('pointerup',onEnd);
    header.addEventListener('pointercancel',onCancel);
    handle?.addEventListener('keydown',e=>{
      if(e.key==='Enter'||e.key===' '){e.preventDefault();closeSettings()}
    });
    dialog.addEventListener('close',()=>{gesture=null;clearSheetDrag()});
  }
  $('openSettings').addEventListener('click',openSettings);
  $('closeSettings').addEventListener('click',closeSettings);
  $('doneSettings').addEventListener('click',closeSettings);
  dialog.addEventListener('click',e=>{if(e.target===dialog)closeSettings()});

    return Object.freeze({openSettings, closeSettings});
  }
  return Object.freeze({attachSettingsDialog});
});
