/* Main classic interface adapter: exercise flow, voice, and display wiring.
 * Keep audio/DOM effects here; pure arithmetic and persistent stores live elsewhere.
 */
(()=>{'use strict';
  const $=id=>document.getElementById(id);
  const canvas=$('abacus');
  const speech=window.speechSynthesis||null;
  const playback=window.GhostBeadsPlayback.createPlaybackController();
  // Safari on iOS is especially sensitive to cancel() immediately before speak().
  // Keep the first utterance inside the Start/Test Voice tap without cancelling
  // an empty queue; this also helps preserve WebKit's user-activation permission.
  const isIOS=/iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
  // Allow the spoken number to finish, then give it a short beat before moving.
  const AFTER_SPEECH_PAUSE_MS=260;
  // Give the learner a moment to take in a selected bead state before
  // automatically speaking or continuing from a navigation command.
  const NAVIGATION_PAUSE_MS=500;
  // The individual rod actions of one carry/borrow are a single *place-value
  // idea* (for example, removing 8 by -10 then +2). Keep them close together.
  // Wait longer when moving to the next digit of the announced operand.
  function movePauseMs(nextIsSameTerm, animationMs){
    return nextIsSameTerm
      ? Math.min(110, Math.max(60, animationMs*.10))
      : Math.min(480, Math.max(320, animationMs*.50));
  }
  const FINAL_MOVE_SETTLE_MS=90;
  const state={value:0,animationStart:0,animationMs:850,motionTravelMs:850,motionFeel:'flick',columns:2,motionFrom:null,motionTo:null,highlightColumn:-1,highlightSign:0,
    active:false,waiting:false,answered:false,hasExercise:false,steps:[],stepIndex:0,currentStep:0,moveCursor:0,movePhase:'idle',pendingStep:false,pendingMove:false,initialValue:0,finalValue:45,detailLevel:2,movePlanOverrides:new Map(),
    currentUtterance:null,nextQueued:false,mode:'ready',selectedMode:'practice'};

  // Some privacy modes deny access to localStorage itself. The app still runs
  // with ephemeral settings/progress, as it did before module extraction.
  const browserStorage=(()=>{
    try{return localStorage}catch(_){return {getItem:()=>null,setItem:()=>{}}}
  })();
  const progressStore=window.GhostBeadsProgress.createProgressStore({storage:browserStorage});
  function updateStats(){
    const p=progressStore.today();
    $('stats').innerHTML='TODAY <strong>'+p.correct+' / '+p.done+'</strong>';
    $('stats').title=p.correct+' correct out of '+p.done+' exercises today';
  }
  function addResult(ok){progressStore.record(ok);updateStats();}
  function status(msg){$('status').textContent=msg}
  function feedback(msg,good){$('feedback').textContent=msg;$('feedback').style.color=good?'var(--mint)':'var(--gold)'}
  const settingsStore=window.GhostBeadsSettings.createSettingsStore({storage:browserStorage,getControl:$});
  const settingsIds=window.GhostBeadsSettings.SETTINGS_IDS;
  let saved=settingsStore.load();
  settingsStore.applyToControls(saved);
  function saveSettings(){saved=settingsStore.save(settingsStore.captureControls());}
  window.applyGhostAppearance($('appearance').value);
  // Older settings saved "auto" as the bundled voice. Desktop
  // defaults to the original browser voice, unless the user explicitly
  // selected the voice pack. iOS ALWAYS uses the voice pack, even if old
  // settings saved "system". This also handles iPadOS desktop user agents.
  if(isIOS){
    $('speechEngine').value='bundled';
    $('speechEngineField').style.display='none';
    $('systemVoiceField').style.display='none';
    $('iosVoiceNotice').hidden=false;
    $('speechSettingsHint').textContent='The local voice pack is the only playback source on iPhone and iPad. You can still turn voice off in Practice or Test mode.';
  }else{
    if(!['system','bundled'].includes($('speechEngine').value))$('speechEngine').value='system';
  }
  // A 1-digit soroban can only hold 9. Starting at >=1, at most eight
  // strictly positive additions are possible, so 10/15/20 are disabled.
  function syncOperationChoices(){
    const cap=10**Number($('digits').value)-1;
    const additionOnly=$('operationMode').value==='add';
    // The selector counts every announced number, including the opening value.
    // With positive additions, a 1-digit soroban can show at most 9 such numbers.
    const maxSteps=cap;
    const select=$('steps');
    for(const option of select.options){
      const unavailable=additionOnly&&Number(option.value)>maxSteps;
      option.disabled=unavailable;
      option.title=unavailable?'Exceeds the display limit for strictly positive additions':'';
    }
    if(select.selectedOptions[0]?.disabled){
      const valid=[...select.options].filter(o=>!o.disabled);
      const requested=Number(select.value);
      const nearest=valid.filter(o=>Number(o.value)<=requested).at(-1)||valid[0];
      select.value=nearest.value;
    }
    $('stepsNote').textContent=additionOnly
      ?'Addition-only exercises never exceed '+cap.toLocaleString('en-US')+'. '+
        (cap===9?'A 1-digit exercise can contain at most 9 spoken numbers (one starting number and up to eight additions). Longer options are disabled.':
        'Longer exercises use smaller additions when needed to stay in range.')
      :'The count includes the starting number. Addition and subtraction keep each total between 0 and '+cap.toLocaleString('en-US')+'.';
  }
  syncOperationChoices();
  state.selectedMode=settingsStore.loadMode();
  function setSessionMode(mode){
    if(!['practice','test'].includes(mode)||state.active||state.waiting)return;
    state.selectedMode=mode;
    settingsStore.saveMode(mode);
    $('practiceMode').setAttribute('aria-pressed',String(mode==='practice'));
    $('testMode').setAttribute('aria-pressed',String(mode==='test'));
    $('start').textContent=mode==='test'?'Start test':'Start practice';
    if(!state.hasExercise){
      $('phase').textContent=mode==='test'?'Ready to test':'Ready to practice';
      $('stepInfo').textContent=mode==='test'?'Solve each number mentally; the beads stay unlit.':'Watch the beads move as you calculate.';
    }
    status(mode==='test'?'Test mode selected · no bead movements or highlights.':'Practice mode selected · bead guidance enabled.');
  }
  $('practiceMode').addEventListener('click',()=>setSessionMode('practice'));
  $('testMode').addEventListener('click',()=>setSessionMode('test'));
  setSessionMode(state.selectedMode);
  function voiceEnabledForCurrentMode(){
    return state.mode==='test'?$('testVoiceEnabled').checked:$('practiceVoice').checked;
  }
  function updateMoveDetailHint(){
    const hints={
      1:'Level 1: show separate five-bead and lower-bead actions whenever both change. Set 47 as +40, +5, +2; compute 34 + 22 as +5, −3 in tens, then in ones.',
      2:'Level 2: one coordinated hand move on each affected column. Carries and borrows remain separate.',
      3:'Level 3: one move for each nonzero digit of the spoken operand, including its carry or borrow.',
      4:'Level 4: one continuous move from the previous total straight to the result of the spoken number.'
    };
    $('moveDetailHint').textContent=hints[Number($('moveDetail').value)]+
      (state.hasExercise?' Changes apply to the current exercise immediately.':'');
  }
  updateMoveDetailHint();
  window.GhostBeadsUI.bindSettingsChanges({getControl:$,ids:settingsIds,onChange:id=>{
    if(id==='digits'||id==='operationMode')syncOperationChoices();
    saveSettings();
    if(id==='appearance')window.applyGhostAppearance($('appearance').value);
    if(id==='showTotal')updateTotal();
    if(id==='moveDetail'){applyDetailLevelImmediately(Number($('moveDetail').value));updateMoveDetailHint();}
  }});

  window.GhostBeadsDialog.attachSettingsDialog({
    getControl:$, view:window, now:()=>performance.now(),
    setTimer:(callback,delay)=>setTimeout(callback,delay),
    clearTimer:id=>clearTimeout(id)
  });

  let availableVoices=[];
  function voiceKey(v){return v.name+'|'+v.lang}
  function populateVoices(){if(!speech)return;const oldChoice=$('voice').value;
    availableVoices=speech.getVoices();
    const select=$('voice');select.innerHTML='';
    const def=document.createElement('option');def.value='auto';def.textContent='Google US English (en-US) · preferred';select.appendChild(def);
    const sorted=availableVoices.slice().sort((a,b)=>{
      const score=v=>/google us english/i.test(v.name)?0:/^en-us$/i.test(v.lang)?1:/^en/i.test(v.lang)?2:3;
      return score(a)-score(b)||a.name.localeCompare(b.name);
    });
    for(const v of sorted){const option=document.createElement('option');option.value=voiceKey(v);option.textContent=v.name+' ('+v.lang+')';select.appendChild(option)}
    const requested=oldChoice!=='auto'?oldChoice:(saved.voice||'auto');
    select.value=[...select.options].some(o=>o.value===requested)?requested:'auto';
    updateVoiceMessage();
  }
  function chooseVoice(){if(!availableVoices.length&&speech)availableVoices=speech.getVoices();
    const selected=$('voice').value;
    if(selected!=='auto')return availableVoices.find(v=>voiceKey(v)===selected)||null;
    // This path is desktop-only. iOS is always forced to bundled audio.
    return availableVoices.find(v=>/google us english/i.test(v.name)&&/^en-us$/i.test(v.lang))
        ||availableVoices.find(v=>/google us english/i.test(v.name))
        ||availableVoices.find(v=>/^en-us$/i.test(v.lang))
        ||availableVoices.find(v=>/^en/i.test(v.lang))||null;
  }
  function selectedAudioEngine(){
    // A stored desktop preference must never enable browser synthesis on iOS.
    return isIOS||$('speechEngine').value==='bundled'?'bundled':'system';
  }
  let voiceInfo={type:'basic',name:'Basic offline English'};
  async function refreshVoiceInfo(){try{const response=await fetch('./audio/voice-info.json');if(response.ok)voiceInfo=await response.json()}catch{}updateVoiceMessage()}
  function updateVoiceMessage(){
    const usingPack=selectedAudioEngine()==='bundled';
    $('systemVoiceField').style.display=usingPack?'none':'';
    if(usingPack){
      $('voiceResult').textContent=voiceInfo.type==='neural'?'Kokoro: '+voiceInfo.name+' · available offline':'Offline voice available';
      $('voice').disabled=true;
      return;
    }
    $('voice').disabled=false;
    if(!speech){$('voiceResult').textContent='Browser speech unavailable. Select the voice pack instead.';return}
    const v=chooseVoice();$('voiceResult').textContent=v?'Browser voice: '+v.name+' ('+v.lang+')':'Browser default voice';
  }
  $('voice').addEventListener('change',updateVoiceMessage);
  $('speechEngine').addEventListener('change',()=>{updateVoiceMessage();cancelSpeech()});
  if(speech&&!isIOS){populateVoices();if('onvoiceschanged' in speech)speech.addEventListener?.('voiceschanged',populateVoices)}
  else updateVoiceMessage();
  refreshVoiceInfo();

  // The original offline pack covers 0..99 and arithmetic words.
  // The optional full-number pack holds one complete recording per 100..9999
  // number, with compressed, individually decodable MP3 clips in small shards.
  // Web Audio is used instead of speechSynthesis on iOS; a direct tap unlocks
  // its AudioContext, and scheduled buffer slices keep each number seamless.
  const bundled={ctx:null,buffer:null,map:null,loading:null,nodes:[],playing:false,token:0};
  // iOS sometimes only routes Web Audio to the speaker *after* a native
  // HTMLAudioElement.play() has been initiated by a real user gesture.
  // Use a short, quiet, local chime as part of Start / Test voice / playback taps
  // so users do not have to find the diagnostic media player's Play button.
  const iosPrimer=$('iosAudioPrimer');
  let iosMediaPrimed=false, iosPrimePromise=null;
  function primeIOSMediaFromTap(){
    if(!isIOS||iosMediaPrimed)return iosPrimePromise||Promise.resolve();
    try{
      iosPrimer.currentTime=0;
      const requested=iosPrimer.play(); // MUST remain inside the click handler.
      iosPrimePromise=Promise.resolve(requested).then(()=>{iosMediaPrimed=true}).catch(err=>{
        iosMediaPrimed=false;
        status('iOS audio activation was blocked: '+(err?.message||'unknown error'));
      });
    }catch(err){iosMediaPrimed=false;status('iOS audio activation failed: '+err.message);iosPrimePromise=Promise.resolve()}
    return iosPrimePromise;
  }
  function unlockBundledAudio(){
    const Constructor=window.AudioContext||window.webkitAudioContext;
    if(!Constructor)return null;
    try{
      if(!bundled.ctx)bundled.ctx=new Constructor();
      if(bundled.ctx.state==='suspended'||bundled.ctx.state==='interrupted')
        bundled.ctx.resume().catch(()=>{}); // Trigger during the user gesture.
      return bundled.ctx;
    }catch(err){status('Audio initialization failed: '+err.message);return null}
  }
  function prepareSpeechOnTap(){
    if(selectedAudioEngine()==='bundled'){
      primeIOSMediaFromTap();
      unlockBundledAudio();
      // Fetch and decode can be asynchronous, but native-media play() and
      // AudioContext.resume() have both been requested synchronously on tap.
      loadBundledSpeech().catch(()=>{});
    }
  }
  document.addEventListener('visibilitychange',()=>{
    // Returning from the background can interrupt iOS' audio session.
    // Refresh it on the next deliberate user interaction (never autoplay).
    if(isIOS&&document.visibilityState==='visible')iosMediaPrimed=false;
  });
  function loadBundledSpeech(){
    if(bundled.loading)return bundled.loading;
    bundled.loading=(async()=>{
      const [mapResponse,infoResponse]=await Promise.all([
        fetch('./audio/speech-map.json'),fetch('./audio/voice-info.json')
      ]);
      if(!mapResponse.ok)throw Error('Speech map could not be loaded ('+mapResponse.status+').');
      const info=infoResponse.ok?await infoResponse.json():{type:'basic',asset:'speech-pack.mp3'};
      const file=/^speech-pack\.(wav|mp3)$/.test(info.asset||'')?info.asset:'speech-pack.mp3';
      const soundResponse=await fetch('./audio/'+file);
      if(!soundResponse.ok)throw Error('Offline voice file could not be loaded ('+soundResponse.status+').');
      voiceInfo=info;updateVoiceMessage();
      const map=await mapResponse.json();const arr=await soundResponse.arrayBuffer();
      const ctx=bundled.ctx||unlockBundledAudio();
      if(!ctx)throw Error('Web Audio is not supported here.');
      const audio=await ctx.decodeAudioData(arr);
      bundled.map=map;bundled.buffer=audio;
    })().catch(err=>{bundled.loading=null;throw err});
    return bundled.loading;
  }
  function numberSegments(n){
    n=Math.floor(Number(n));if(n<0||n>9999)throw Error('Number out of range');
    if(n===0)return ['0'];
    const parts=[];
    if(n>=1000){parts.push(String(Math.floor(n/1000)),'thousand');n%=1000}
    if(n>=100){parts.push(String(Math.floor(n/100)),'hundred');n%=100}
    if(n>0)parts.push(String(n));
    return parts;
  }
  function spokenSegments(text){
    text=String(text).trim().toLowerCase();
    if(/^\d{1,4}$/.test(text))return numberSegments(Number(text));
    const match=/^(plus|minus)\s+(\d{1,4})$/.exec(text);
    if(match)return [match[1],...numberSegments(Number(match[2]))];
    return ['test'];
  }
  // Full Kokoro recordings use independent MP3 clips packed into binary shards;
  // decode only the number requested, keeping mobile memory usage bounded.
  const wholeNumbers={index:null,loading:null,files:new Map(),sounds:new Map()};
  async function loadWholeNumberIndex(){
    if(wholeNumbers.loading)return wholeNumbers.loading;
    wholeNumbers.loading=(async()=>{
      try{
        const r=await fetch('./audio/number-pack-map.json');
        if(!r.ok)return null; // Previous voice packs remain backward-compatible.
        const index=await r.json();
        if(index.format!=='mp3-shards-v1'||!Array.isArray(index.shards))return null;
        wholeNumbers.index=index;
        return index;
      }catch{return null}
    })();
    return wholeNumbers.loading;
  }
  async function wholeNumberSound(n,ctx){
    if(n<100||n>9999)return null;
    const cacheKey=String(n);
    if(wholeNumbers.sounds.has(cacheKey))return wholeNumbers.sounds.get(cacheKey);
    const index=await loadWholeNumberIndex();
    if(!index||n>index.max)return null;
    const entry=index.shards.find(sh=>n>=sh.min&&n<=sh.max);
    if(!entry)return null;
    let bytes=wholeNumbers.files.get(entry.file);
    if(!bytes){
      const response=await fetch('./audio/'+entry.file);
      if(!response.ok)throw Error('Full number audio missing: '+n);
      bytes=await response.arrayBuffer();
      wholeNumbers.files.set(entry.file,bytes);
      // Keep at most two compressed shards in RAM. The service worker caches all.
      if(wholeNumbers.files.size>2)wholeNumbers.files.delete(wholeNumbers.files.keys().next().value);
    }
    const i=n-entry.min;
    const start=entry.offsets[i],end=entry.offsets[i+1];
    if(!Number.isInteger(start)||!Number.isInteger(end)||end<=start||end>bytes.byteLength)
      throw Error('Invalid full number audio index for '+n);
    const clip=bytes.slice(start,end);
    const sound=await ctx.decodeAudioData(clip);
    wholeNumbers.sounds.set(cacheKey,sound);
    if(wholeNumbers.sounds.size>18)wholeNumbers.sounds.delete(wholeNumbers.sounds.keys().next().value);
    return sound;
  }
  async function audioPieces(text,ctx){
    const match=/^(?:(plus|minus)\s+)?(\d{1,4})$/.exec(String(text).trim().toLowerCase());
    if(match&&Number(match[2])>=100){
      let full=null;
      try{full=await wholeNumberSound(Number(match[2]),ctx)}catch(err){
        console.warn('Full number audio unavailable; reverting to original voice segments.',err);
      }
      if(full){
        const pieces=[];
        if(match[1])pieces.push({kind:'sprite',key:match[1]});
        pieces.push({kind:'whole',buffer:full});
        return pieces;
      }
    }
    return spokenSegments(text).map(key=>({kind:'sprite',key}));
  }
  function stopBundledSpeech(){
    bundled.token++;bundled.playing=false;
    for(const source of bundled.nodes){try{source.onended=null;source.stop()}catch{}}
    bundled.nodes=[];
  }
  function speakBundled(text,done,onStart){
    const ctx=unlockBundledAudio();
    if(!ctx){onStart?.();done?.(false);return}
    stopBundledSpeech();
    const token=bundled.token;
    status('Loading bundled speech…');
    loadBundledSpeech().then(async()=>{
      if(token!==bundled.token)return;
      // Don't schedule any buffer until the iOS native media activation has
      // begun. The embedded player used to do this manually.
      if(isIOS&&iosPrimePromise)await iosPrimePromise;
      if(token!==bundled.token)return;
      if(ctx.state!=='running'){
        // Some iOS versions report "interrupted" after returning to a PWA.
        await Promise.race([
          ctx.resume(),
          new Promise((_,reject)=>setTimeout(()=>reject(Error('iOS audio remains blocked. Tap Test voice or Start again.')),1200))
        ]);
      }
      if(ctx.state!=='running')throw Error('Audio context did not start. Tap Test voice or Start again.');
      const pieces=await audioPieces(text,ctx);
      if(token!==bundled.token)return;
      const rate=Number($('rate').value)||0.9;
      let when=ctx.currentTime+0.055;
      let last=null;
      for(const piece of pieces){
        const source=ctx.createBufferSource();
        let duration;
        if(piece.kind==='whole'){
          source.buffer=piece.buffer;
          duration=piece.buffer.duration;
        }else{
          const data=bundled.map[piece.key];
          if(!data)throw Error('Audio segment missing: '+piece.key);
          source.buffer=bundled.buffer;
          duration=data.duration;
        }
        source.playbackRate.value=rate;
        source.connect(ctx.destination);
        if(piece.kind==='whole')source.start(when);
        else source.start(when,bundled.map[piece.key].offset,duration);
        bundled.nodes.push(source);last=source;
        // Tight transition: no extra pause between a sign and a full numeral.
        when+=duration/rate+(piece.kind==='whole'?0:0.010);
      }
      bundled.playing=true;
      onStart?.();
      if(last)last.onended=()=>{
        if(token!==bundled.token)return;
        bundled.playing=false;bundled.nodes=[];
        done?.(true);
      };
      if(playback.paused)ctx.suspend().catch(()=>{});
      status('Playing offline English audio…');
    }).catch(err=>{
      if(token!==bundled.token)return;
      bundled.playing=false;bundled.nodes=[];
      status('Bundled audio error: '+err.message);
      $('voiceResult').textContent='Audio error: '+err.message;
      done?.(false);
    });
  }

  // The speech watchdog has its own timer channel, independent of bead moves.
  function clearSpeechWatchdog(){playback.cancel('speech')}
  function armSpeechWatchdog(cb,ms){playback.schedule('speech',cb,ms)}
  function cancelSpeech(){clearSpeechWatchdog();
    stopBundledSpeech();
    const hadUtterance=!!state.currentUtterance;
    if(hadUtterance){state.currentUtterance.onend=null;state.currentUtterance.onerror=null;state.currentUtterance.onstart=null}
    // DO NOT cancel an idle synthesis engine. Cancelling immediately before
    // speak() can make the next utterance silently disappear on iOS Safari.
    if(speech&&hadUtterance){
      try{speech.cancel()}catch{}
    }
    state.currentUtterance=null;
  }
  function speak(text,done,onStart){
    if(selectedAudioEngine()==='bundled'){
      // Cancel any old system-voice utterance before switching engines.
      if(state.currentUtterance)cancelSpeech();
      speakBundled(text,done,onStart);
      return;
    }
    // Most operations begin after the previous utterance's onend event. There
    // is no old speech to interrupt, so skip cancel() altogether.
    if(state.currentUtterance)cancelSpeech();
    else clearSpeechWatchdog();
    if(!speech||!window.SpeechSynthesisUtterance){status('Speech is unavailable in this browser.');onStart?.();armTimer(()=>done?.(false),700);return}
    let complete=false,started=false;
    const begin=()=>{if(started)return;started=true;if(typeof onStart==='function')onStart()};
    const finish=(ok=true)=>{if(complete)return;begin();complete=true;clearSpeechWatchdog();state.currentUtterance=null;if(typeof done==='function')done(ok)};
    const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=Number($('rate').value);u.volume=1;u.pitch=1;
    const voice=chooseVoice();if(voice){u.voice=voice;u.lang=voice.lang}
    u.onstart=()=>{begin();if(playback.paused){try{speech?.pause()}catch{}}if(state.active)status('Speaking '+text+'…')};
    u.onend=finish;
    u.onerror=ev=>{status('Voice issue ('+(ev.error||'unknown')+'). Try another voice in Settings.');finish(false)};
    state.currentUtterance=u;
    armSpeechWatchdog(()=>{
      status('Speech did not finish. Check browser audio or try another voice.');
      finish(false);
    },Math.max(7500,text.length*450));
    try{speech.speak(u)}catch(err){status('Speech could not start: '+err.message);finish(false)}
  }
  $('testVoice').addEventListener('click',()=>{
    if(state.active){$('voiceResult').textContent='Stop the exercise before testing a voice.';return}
    prepareSpeechOnTap(); // iOS playback permission is tied to this tap.
    const engine=selectedAudioEngine();
    $('voiceResult').textContent=engine==='bundled'?'Loading offline voice audio…':'Requesting system speech…';
    speak(engine==='bundled'?'plus 1886':'Ghost Beads audio is working. You should hear this on your device.',ok=>{
      $('voiceResult').textContent=ok
        ?'Playback completed. If silent, check device volume and audio output.'
        :(engine==='bundled'
          ?'Voice pack failed. Check that its files are installed and cached.'
          :'Browser voice failed. Try another browser voice or select the voice pack.');
    },()=>{$('voiceResult').textContent=engine==='bundled'?'Playing offline voice audio…':'System speech started. Can you hear it?';});
  });

  const {digitsOf,humanMovePlan,regroupRemainingAtoms}=window.GhostBeadsCore;
  const renderer=window.GhostBeadsCanvas.createSorobanRenderer({
    canvas, state, playback, digitsOf, view:window,
    now:()=>performance.now(),
    scheduleFrame:cb=>requestAnimationFrame(cb),
    getTheme:()=>document.documentElement.dataset.theme,
    getAnimationSpeed:()=>$('animationSpeed').value,
    getMotionFeel:()=>$('motionFeel').value,
    onValueChanged:()=>updateTotal()
  });
  const moveTo=renderer.moveTo;
  function updateTotal(){const t=$('total');if(state.mode==='test'){t.textContent='';return}if(state.waiting){t.textContent=$('showTotal').checked?'Final total · '+state.finalValue:' ';return}
    t.textContent=$('showTotal').checked?'Total · '+state.value:'';}
  function applyDetailLevelImmediately(newLevel){
    if(![1,2,3,4].includes(newLevel)||newLevel===state.detailLevel)return;
    if(!state.hasExercise){state.detailLevel=newLevel;return}
    const index=state.currentStep;
    const oldPlan=stepDescription(index).moves;
    const oldCursor=Math.max(0,Math.min(state.moveCursor,oldPlan.length));
    const currentValue=valueAtMove(index,oldCursor);
    const before=valueBeforeStep(index);
    const target=index===0?state.initialValue:state.steps[index-1].value;
    const delta=target-before;
    const atoms=humanMovePlan(before,delta,state.columns,1);
    const newPlan=humanMovePlan(before,delta,state.columns,newLevel);

    // The end value of every grouped move is a boundary in the atomic plan.
    // If a number occurs more than once, choose the occurrence nearest the
    // cursor's old arithmetic position (the earliest on a tie).
    const oldFraction=oldPlan.length?oldCursor/oldPlan.length:0;
    const atomicPositions=[before,...atoms.map(m=>m.value)];
    const atAtom=atomicPositions.reduce((best,v,i)=>v!==currentValue?best:
      (best<0||Math.abs(i/Math.max(1,atoms.length)-oldFraction)<
        Math.abs(best/Math.max(1,atoms.length)-oldFraction)?i:best),-1);
    const canonicalPositions=[before,...newPlan.map(m=>m.value)];
    const direct=canonicalPositions.reduce((best,v,i)=>v!==currentValue?best:
      (best<0||Math.abs(i/Math.max(1,newPlan.length)-oldFraction)<
        Math.abs(best/Math.max(1,newPlan.length)-oldFraction)?i:best),-1);
    let selectedPlan,cursor;
    if(direct>=0){
      selectedPlan=newPlan;cursor=direct;
    }else{
      // We have already performed part of a move that the new detail level
      // would have grouped. Keep history navigable, but regroup the future.
      const prefix=oldPlan.slice(0,oldCursor).map(m=>({...m}));
      const tail=regroupRemainingAtoms(atoms.slice(atAtom),newLevel,currentValue,target,state.columns);
      selectedPlan=[...prefix,...tail];cursor=prefix.length;
    }
    state.detailLevel=newLevel;
    state.movePlanOverrides.clear();
    state.movePlanOverrides.set(index,selectedPlan);
    state.moveCursor=cursor;
    // Do not cancel speech, elapsed timers, or in-flight bead movement.
    // The next timer callback reads the new plan and continues naturally.
    updateButtons();
    const finished=cursor===selectedPlan.length;
    if(state.movePhase==='animating'){
      $('stepInfo').textContent='Move '+cursor+' of '+selectedPlan.length+' · movement detail updated';
    }else if(state.active&&state.movePhase!=='speaking'&&state.movePhase!=='lead'){
      $('stepInfo').textContent=finished
        ?'All '+selectedPlan.length+' hand moves completed'
        :'Hand move '+cursor+' of '+selectedPlan.length+' · '+(cursor?selectedPlan[cursor-1].label:'before first move');
    }
    status('Movement detail set to Level '+newLevel+'. '+
      (finished?'This number is complete.':'Remaining hand moves updated.'));
  }
  // Spoken-step sequencing and bead movement share one pause-aware channel.
  // The controller invalidates queued callbacks on stop, seek, or restart.
  function armTimer(cb,ms){playback.schedule('sequence',cb,ms)}
  function valueAtMove(index,cursor){
    const moves=stepDescription(index).moves;
    if(cursor<0||cursor>moves.length)throw Error('Hand move outside this operation');
    return cursor===0?valueBeforeStep(index):moves[cursor-1].value;
  }
  // The cursor counts hand moves whose DESTINATION is selected. The current
  // animation, if any, is the last selected move (cursor - 1). This makes
  // seeking to an intermediate state an exact operation on the abacus value.
  function runMovesFromCursor(index,token){
    if(!state.active||token!==playback.token)return;
    if(playback.paused){armTimer(()=>runMovesFromCursor(index,token),0);return}
    const d=stepDescription(index),moves=d.moves;
    if(state.moveCursor>=moves.length){
      state.movePhase='between';
      scheduleNext(token);
      return;
    }
    const i=state.moveCursor;
    const m=moves[i];
    state.moveCursor=i+1;
    state.movePhase='animating';
    // One hand move means ALL the changed beads on the same rod move together.
    moveTo(m.value,false,m.column,m.shift);
    if(d.starting){
      if(m.column>=0){
        const place=10**(state.columns-m.column-1),beadCount=Math.abs(m.shift)/place;
        const placeName=place===1?'ones':place===10?'tens':place===100?'hundreds':'thousands';
        $('stepInfo').textContent='Set '+beadCount+' '+placeName+' · move '+state.moveCursor+' of '+moves.length;
      }else{
        $('stepInfo').textContent='Set '+m.value+' · move '+state.moveCursor+' of '+moves.length;
      }
    }else{
      $('stepInfo').textContent='Move '+state.moveCursor+' of '+moves.length+' · '+m.label;
    }
    updateButtons();
    const next=moves[state.moveCursor];
    const pause=next?movePauseMs(next.termId===m.termId,state.animationMs):FINAL_MOVE_SETTLE_MS;
    // Mark the visible movement finished before the inter-move breathing
    // interval begins. The skip-arrow can then distinguish a bead currently
    // moving from one that has already reached its new position.
    armTimer(()=>{
      if(!state.active||token!==playback.token)return;
      state.movePhase='settling';
      armTimer(()=>runMovesFromCursor(index,token),pause);
    },state.animationMs);
  }
  function updateButtons(){
    const active=state.active,waiting=state.waiting,hasExercise=state.hasExercise;
    // Do not allow a new exercise until the learner submits an answer.
    $('start').disabled=active||waiting;
    $('practiceMode').disabled=active||waiting;
    $('testMode').disabled=active||waiting;
    // Keep transport space reserved even before exercise starts; all controls are disabled until then.
    // Keep Stop visible (but disabled) at the answer stage, rather than
    // unexpectedly replacing it with Start before an answer is submitted.
    $('stop').classList.toggle('hidden',!(active||waiting));
    $('pause').disabled=!active;$('stop').disabled=!active;
    const moves=hasExercise?stepDescription(state.currentStep).moves:[];
    $('previousStep').disabled=!hasExercise||state.currentStep<=0;
    $('nextStep').disabled=!hasExercise||state.currentStep>=state.steps.length;
    $('previousMove').disabled=!hasExercise||state.mode==='test'||(state.currentStep===0&&state.moveCursor<=0);
    $('nextMove').disabled=!hasExercise||state.mode==='test'||(state.currentStep===state.steps.length&&state.moveCursor>=moves.length&&state.movePhase!=='animating');
    $('repeatStep').disabled=!hasExercise;
    const showPlayIcon=!active||playback.paused;
    $('pause').title=showPlayIcon?'Play':'Pause';
    $('pause').setAttribute('aria-label',showPlayIcon?'Play':'Pause');
    $('pauseIcon').innerHTML=showPlayIcon
      ? '<path d="M7 4 20 12 7 20Z"/>'
      : '<rect x="5" y="4" width="5" height="16" rx="1"/><rect x="14" y="4" width="5" height="16" rx="1"/>';
    $('stepCounter').textContent=hasExercise ? ('Number '+(state.currentStep+1)+'/'+(state.steps.length+1)+(state.mode==='test'?' · Test':' · Move '+state.moveCursor+'/'+moves.length)) : 'Controls ready';
    $('answerArea').classList.toggle('hidden',!waiting);
    $('readout').classList.toggle('awaiting-answer',waiting);
    $('answer').disabled=!waiting||state.answered;$('check').disabled=!waiting||state.answered;
  }
  // Keep the UI adapter here: exercise generation itself has no DOM access.
  function makeSession(){
    return window.GhostBeadsExercises.generateExercise({
      digits:Number($('digits').value),
      numberCount:Number($('steps').value),
      operationMode:$('operationMode').value
    });
  }
  function stopCurrentPlayback(){
    // Invalidate sequence and watchdog callbacks before cancelling audio.
    playback.stop();
    cancelSpeech();
  }
  function reset(){
    stopCurrentPlayback();state.active=false;state.waiting=false;state.answered=false;
    state.nextQueued=false;
    state.hasExercise=false;state.pendingStep=false;
    state.steps=[];state.movePlanOverrides.clear();state.stepIndex=0;state.currentStep=0;state.moveCursor=0;state.movePhase='idle';state.pendingMove=false;updateButtons();
  }
  // A step is one SPOKEN number, including the opening number (step zero).
  // Seeking restores the value immediately *before* that number, so its
  // complete human move plan can run again without double-applying anything.
  function valueBeforeStep(index){
    if(index===0)return 0;
    if(index===1)return state.initialValue;
    return state.steps[index-2].value;
  }
  function stepDescription(index){
    if(index===0)return {label:String(state.initialValue),speech:String(state.initialValue),
      moves:state.movePlanOverrides.get(0)||humanMovePlan(0,state.initialValue,state.columns,state.detailLevel),starting:true};
    const op=state.steps[index-1];
    return {label:(op.delta>=0?'+':'−')+' '+Math.abs(op.delta),
      speech:(op.delta>=0?'plus ':'minus ')+Math.abs(op.delta),
      moves:state.movePlanOverrides.get(index)||humanMovePlan(valueBeforeStep(index),op.delta,state.columns,state.detailLevel),starting:false};
  }
  function showPreparedStep(index){
    const d=stepDescription(index);
    $('operation').textContent=d.label;
    $('stepInfo').textContent=index===0?'Starting number · ready to replay':
      'Operation '+index+' of '+state.steps.length+' · ready to replay';
    $('phase').textContent=state.mode==='test'?'Mental abacus · Test':'Guided practice';
    updateTotal();
  }
  function runSpokenStep(index,token){
    if(!state.active||token!==playback.token)return;
    state.movePlanOverrides.delete(index);
    state.currentStep=index;state.stepIndex=index;state.moveCursor=0;
    state.pendingStep=false;state.pendingMove=false;state.movePhase='speaking';
    const d=stepDescription(index);
    const outcome=index===0?state.initialValue:state.steps[index-1].value;
    $('operation').textContent=d.label;
    $('stepInfo').textContent=index===0
      ? 'Starting number · '+(state.steps.length+1)+' spoken numbers'
      : 'Operation '+index+' of '+state.steps.length+' · listening';
    updateButtons();
    if(state.mode==='test'){
      // Test presents the spoken number without ever setting, animating, or
      // illuminating the soroban beads. Number-level navigation still works.
      state.movePhase='presenting';
      $('stepInfo').textContent=index===0?'Starting number · calculate mentally':
        'Operation '+index+' of '+state.steps.length+' · calculate mentally';
      const afterNumber=()=>{
        if(!state.active||token!==playback.token)return;
        state.movePhase='between';
        scheduleNext(token);
      };
      if(voiceEnabledForCurrentMode())speak(d.speech,afterNumber);
      else {
        status('Test · '+d.label+' · no voice or bead hints');
        armTimer(afterNumber,Math.max(450,Math.min(950,Number($('delay').value))));
      }
      return;
    }
    const afterNumber=()=>{
      if(!state.active||token!==playback.token)return;
      state.movePhase='lead';
      const latestMoves=stepDescription(index).moves;
      $('stepInfo').textContent=index===0
        ? 'Starting number · preparing '+latestMoves.length+' hand move'+(latestMoves.length===1?'':'s')
        : 'Operation '+index+' of '+state.steps.length+' · preparing';
      armTimer(()=>runMovesFromCursor(index,token),AFTER_SPEECH_PAUSE_MS);
    };
    if(voiceEnabledForCurrentMode())speak(d.speech,afterNumber);
    else {
      status('Practice · '+d.label+' · voice off');
      armTimer(afterNumber,Math.max(350,Math.min(700,Number($('delay').value)*.60)));
    }
  }
  function scheduleNext(token){
    if(!state.active||token!==playback.token)return;
    state.movePhase='between';
    armTimer(()=>{
      if(!state.active||token!==playback.token)return;
      const target=state.currentStep+1;
      if(target>state.steps.length){finish();return}
      runSpokenStep(target,token);
    },Number($('delay').value));
  }
  // Full arrows navigate spoken numbers. While paused, the abacus shows the
  // configuration before the selected number; Play voices it and starts it.
  function seekToStep(index,playImmediately){
    if(!state.hasExercise)return;
    const target=Math.max(0,Math.min(index,state.steps.length));
    stopCurrentPlayback();
    playback.begin({paused:!playImmediately});
    state.movePlanOverrides.delete(target);
    state.currentStep=target;state.stepIndex=target;state.moveCursor=0;
    state.active=true;state.waiting=false;
    state.pendingStep=!playImmediately;state.pendingMove=false;state.movePhase='selected';
    moveTo(state.mode==='test'?0:valueBeforeStep(target),true);
    showPreparedStep(target);
    updateButtons();
    if(playImmediately){
      status(target===0?'Replaying the starting number…':`Playing operation ${target}…`);
      armTimer(()=>runSpokenStep(target,playback.token),NAVIGATION_PAUSE_MS);
    }else{
      status(state.mode==='test'
        ?'Number '+(target+1)+' selected. Press Play to present it.'
        :'Number '+(target+1)+' selected. Press Play to hear it and see the moves.');
    }
  }
  // Step arrows move to the exact resulting value of an individual hand
  // action. Skip applies it instantly; Previous rewinds it. When playback is
  // running, it continues from the selected point without repeating speech.
  function seekToMove(index,cursor,playImmediately){
    if(!state.hasExercise||state.mode==='test')return;
    index=Math.max(0,Math.min(index,state.steps.length));
    const d=stepDescription(index);
    const target=Math.max(0,Math.min(cursor,d.moves.length));
    stopCurrentPlayback();
    playback.begin({paused:!playImmediately});
    state.active=true;state.waiting=false;
    state.currentStep=index;state.stepIndex=index;state.moveCursor=target;
    state.pendingStep=false;state.pendingMove=!playImmediately;state.movePhase='selected';
    moveTo(valueAtMove(index,target),true);
    showPreparedStep(index);
    $('stepInfo').textContent='Hand move '+target+' of '+d.moves.length+' · '+(target?d.moves[target-1].label:'before first move');
    updateButtons();
    if(playImmediately){
      status('Continuing at hand move '+target+' of '+d.moves.length+'.');
      armTimer(()=>runMovesFromCursor(index,playback.token),NAVIGATION_PAUSE_MS);
    }else{
      status('Hand move '+target+' of '+d.moves.length+' selected. Press Play to continue.');
    }
  }
  // A hand-step arrow is allowed to cross spoken-number boundaries. There
  // are duplicate *values* at a boundary (last move of one number and the
  // start of the next), so skip the duplicate: one click always traverses
  // exactly one actual hand action, even when it belongs to another number.
  function navigateHandMove(direction){
    if(!state.hasExercise||state.mode==='test')return;
    let index=state.currentStep;
    let cursor=state.moveCursor;
    const count=stepDescription(index).moves.length;
    if(direction<0){
      if(cursor>0)cursor--;
      else if(index>0){
        index--;
        cursor=Math.max(0,stepDescription(index).moves.length-1);
      }else return;
    }else{
      // If a bead is already in motion, the first click finishes that move;
      // it must not jump across the subsequent move as well.
      if(state.movePhase==='animating'){
        // The current cursor already points at that move's destination.
      }else if(cursor<count)cursor++;
      else if(index<state.steps.length){
        index++;
        cursor=Math.min(1,stepDescription(index).moves.length);
      }else return;
    }
    seekToMove(index,cursor,!playback.paused);
  }
  function run(initial,ops,mode){
    reset();playback.begin();state.active=true;state.hasExercise=true;state.mode=mode;
    state.columns=Math.max(1,Number($('digits').value),String(Math.max(initial,...ops.map(o=>o.value))).length);

    state.initialValue=initial;state.steps=ops;state.detailLevel=Number($('moveDetail').value);state.finalValue=ops.length?ops[ops.length-1].value:initial;
    updateMoveDetailHint();
    state.currentStep=0;state.stepIndex=0;state.moveCursor=0;state.movePhase='idle';moveTo(0,true);
    $('phase').textContent=mode==='test'?'Mental abacus · Test':$('operationMode').value==='add'?'Addition practice':'Guided practice';
    $('operation').textContent=String(initial);
    $('stepInfo').textContent='Starting number · '+(ops.length+1)+' spoken numbers';
    $('tips').classList.add('hidden');
    $('answer').value='';feedback('');updateButtons();
    runSpokenStep(0,playback.token);
  }
  function finish(){
    playback.complete();
    state.active=false;state.waiting=!state.answered;state.pendingStep=false;state.pendingMove=false;state.movePhase='completed';
    cancelSpeech();
    $('phase').textContent=state.answered?'Solution':'Your answer';
    $('operation').textContent=state.answered?String(state.finalValue):'= ?';
    $('stepInfo').textContent=(state.steps.length+1)+' spoken numbers completed';
    updateTotal();
    status(state.answered?'Review complete.':'Enter the final total, or use the arrows to review.');
    updateButtons();
    // An unsolicited focus can open the iOS software keyboard and shrink its visual viewport.
    // Touch users tap the in-readout field; desktop retains keyboard-first entry.
    if(!state.answered && window.matchMedia('(hover:hover) and (pointer:fine)').matches)$('answer').focus();
  }
  function checkAnswer(){if(!state.waiting||state.answered)return;
    if($('answer').value.trim()===''){feedback('Enter your answer first.',false);return}
    const correct=Number($('answer').value)===state.finalValue;
    state.waiting=false;state.answered=true;addResult(correct);
    $('phase').textContent=correct?'Correct':'Solution';
    $('operation').textContent=String(state.finalValue);$('stepInfo').textContent='Final total';
    $('total').textContent='';
    feedback(correct?'✓ Correct!':('The answer is '+state.finalValue+'.'),correct);
    status('Start another practice session when ready.');updateButtons();
  }
  function togglePause(){if(!state.active)return;
    if(!playback.paused){
      playback.pause();
      if(speech&&speech.speaking){try{speech.pause()}catch{}}
      if(bundled.playing&&bundled.ctx){bundled.ctx.suspend().catch(()=>{})}
      status('Paused. Use the arrows to choose a spoken step.');
    }else{
      // Preserve the current on-screen bead position across the pause.
      state.animationStart+=playback.resume();
      if(state.pendingStep){
        state.pendingStep=false;
        armTimer(()=>runSpokenStep(state.currentStep,playback.token),NAVIGATION_PAUSE_MS);
      }else if(state.pendingMove){
        state.pendingMove=false;
        armTimer(()=>runMovesFromCursor(state.currentStep,playback.token),NAVIGATION_PAUSE_MS);
      }else{
        if(speech&&speech.paused){try{speech.resume()}catch{}}
        if(bundled.playing&&bundled.ctx){bundled.ctx.resume().catch(()=>{})}
      }
      status('Playing.');
    }
    updateButtons();
  }
  window.GhostBeadsUI.bindSessionControls({getControl:$,actions:{
    start:()=>{prepareSpeechOnTap();const s=makeSession();run(s.initial,s.operations,state.selectedMode)},
    pause:()=>{prepareSpeechOnTap();togglePause()},
    previousStep:()=>{prepareSpeechOnTap();seekToStep(state.currentStep-1,!playback.paused)},
    previousMove:()=>navigateHandMove(-1),
    nextMove:()=>navigateHandMove(1),
    nextStep:()=>{prepareSpeechOnTap();seekToStep(state.currentStep+1,!playback.paused)},
    repeatStep:()=>{prepareSpeechOnTap();seekToStep(state.currentStep,true)},
    stop:()=>{reset();state.mode='ready';$('phase').textContent=state.selectedMode==='test'?'Ready to test':'Ready to practice';$('stepInfo').textContent='Session stopped.';$('operation').textContent='—';moveTo(0,true);$('tips').classList.add('hidden');status('Session stopped.');feedback('')},
    check:checkAnswer
  }});
  window.ghostBeadsPlanner=humanMovePlan; // inspect a sequence in the browser console
  $('total').textContent='';updateStats();updateButtons();
})();
