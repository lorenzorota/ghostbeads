/* Canvas-only soroban renderer. Depends on explicit view state and callbacks,
 * not exercise generation, DOM controls, or progress persistence.
 * Animation scheduling is intentionally unchanged until Phase 5.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GhostBeadsCanvas = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function createSorobanRenderer({canvas, state, playback, digitsOf, view,
      now, scheduleFrame, getTheme, getAnimationSpeed, getMotionFeel,
      onValueChanged = () => {}}) {
    if (!canvas || !state || !playback || !digitsOf || !view || !now ||
        !scheduleFrame || !getTheme || !getAnimationSpeed || !getMotionFeel)
      throw new TypeError('Renderer dependencies are required');
    const ctx=canvas.getContext('2d');
  function resizeCanvas(){const b=canvas.getBoundingClientRect(),scale=Math.min(2,view.devicePixelRatio||1);
    canvas.width=Math.round(b.width*scale);canvas.height=Math.round(b.height*scale);ctx.setTransform(scale,0,0,scale,0,0)}
  if(view.ResizeObserver)new view.ResizeObserver(resizeCanvas).observe(canvas);
  else view.addEventListener('resize',resizeCanvas);
  resizeCanvas();
  const lerp=(a,b,t)=>a+(b-a)*t;
  const clamp01=t=>Math.max(0,Math.min(1,t));
  // Fast, finger-driven flick. Avoid CSS-style ease-in: it leaves the bead
  // almost stationary at the beginning and makes the action feel mechanical.
  // Instead give it a substantial initial velocity and a VERY short push
  // (about 25-35 ms at normal pace), followed by travel at constant speed.
  // At contact, velocity stops instantly: no ease-out, overshoot or bounce.
  const softEase=t=>{t=clamp01(t);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2};
  function flickEase(t){
    t=clamp01(t);
    const push=0.11, initialVelocity=0.72;
    // Normalized so position and velocity are continuous and position(1)=1.
    const cruiseVelocity=(1-initialVelocity*push/2)/(1-push/2);
    const accel=(cruiseVelocity-initialVelocity)/push;
    if(t<push)return initialVelocity*t+accel*t*t/2;
    const pushed=push*(initialVelocity+cruiseVelocity)/2;
    return Math.min(1,pushed+cruiseVelocity*(t-push));
  }
  // The selected animation speed still controls the interval for each hand
  // move; shorter physical travel leaves a clear, stationary contact hold.
  function travelDuration(slotMs,feel){
    return feel==='flick'?Math.min(360,Math.max(160,slotMs*.34)):slotMs;
  }
  function motionClock(now){return (playback.paused?playback.pausedAt:now)-state.animationStart}
  function movementProgress(now){
    const u=clamp01(motionClock(now)/Math.max(1,state.motionTravelMs));
    return state.motionFeel==='flick'?flickEase(u):softEase(u);
  }
  function contactGlow(now){
    if(state.motionFeel!=='flick')return 0;
    const elapsed=motionClock(now)-state.motionTravelMs;
    // A quick glint at contact without any positional overshoot.
    return elapsed<0||elapsed>105?0:Math.pow(1-elapsed/105,2);
  }
  const isActive=(d,i)=>i===0?d>=5:i<=d%5;
  const encoded=(n,count)=>digitsOf(n,count).map(d=>Array.from({length:5},(_,i)=>Number(isActive(d,i))));
  function frameAt(now){
    if(!state.motionFrom||!state.motionTo||state.motionFrom.length!==state.columns)
      return encoded(state.value,state.columns);
    const t=movementProgress(now);
    // All beads within a rod move together; no artificial ripple. A carry
    // and its complementary removal are separate coordinated rod actions.
    return state.motionTo.map((column,j)=>column.map((dest,i)=>lerp(state.motionFrom[j][i],dest,t)));
  }
  function line(x1,y1,x2,y2,color,width=1){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()}
  function glowLine(y,w,intensity){
    if(getTheme()==='light'){
      const grad=ctx.createLinearGradient(0,y-7,0,y+7);
      grad.addColorStop(0,'rgba(91,105,100,0)');
      grad.addColorStop(.44,'rgba(91,105,100,'+(intensity*.09)+')');
      grad.addColorStop(.5,'rgba(71,84,80,'+(intensity*.24)+')');
      grad.addColorStop(.56,'rgba(91,105,100,'+(intensity*.09)+')');
      grad.addColorStop(1,'rgba(91,105,100,0)');
      ctx.fillStyle=grad;ctx.fillRect(0,y-7,w,14);
      ctx.strokeStyle='rgba(85,103,97,'+(intensity*.49)+')';
      ctx.lineWidth=.95;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();
      return;
    }
    const grad=ctx.createLinearGradient(0,y-9,0,y+9);
    grad.addColorStop(0,'rgba(177,183,177,0)');
    grad.addColorStop(.43,'rgba(177,183,177,'+(intensity*.23)+')');
    grad.addColorStop(.5,'rgba(220,224,210,'+(intensity*.57)+')');
    grad.addColorStop(.57,'rgba(177,183,177,'+(intensity*.20)+')');
    grad.addColorStop(1,'rgba(177,183,177,0)');
    ctx.fillStyle=grad;ctx.fillRect(0,y-9,w,18);
    const hz=ctx.createLinearGradient(0,0,w,0);
    hz.addColorStop(0,'rgba(163,176,172,'+(intensity*.16)+')');
    hz.addColorStop(.15,'rgba(196,202,195,'+(intensity*.47)+')');
    hz.addColorStop(.5,'rgba(213,221,209,'+(intensity*.59)+')');
    hz.addColorStop(.85,'rgba(196,202,195,'+(intensity*.47)+')');
    hz.addColorStop(1,'rgba(163,176,172,'+(intensity*.16)+')');
    ctx.strokeStyle=hz;ctx.lineWidth=.85;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();
  }
  function drawBead(x,y,bw,bh,activity,tint=0,subtraction=false,impact=0,contactDirection=0){
    // Active beads stay illuminated at rest. Glow changes only as beads move
    // toward/away from the divider: no reset, disappearance, or hard cut.
    const alpha=clamp01(activity);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x-bw*.20,y-bh/2);ctx.lineTo(x+bw*.20,y-bh/2);
    ctx.lineTo(x+bw*.50,y);ctx.lineTo(x+bw*.20,y+bh/2);
    ctx.lineTo(x-bw*.20,y+bh/2);ctx.lineTo(x-bw*.50,y);ctx.closePath();
    if(getTheme()==='light'){
      ctx.shadowColor=subtraction&&tint>0
        ?'rgba(192,75,64,'+(tint*.25)+')'
        :'rgba(157,99,38,'+(alpha*.25+tint*.15+impact*.20)+')';
      ctx.shadowBlur=alpha*9+tint*5+impact*5;
      ctx.fillStyle='rgba(181,131,67,'+(.014+alpha*.24)+')';
      ctx.strokeStyle=subtraction&&tint>0
        ?'rgba(178,66,53,'+(.47+tint*.32)+')'
        :'rgba('+(Math.round(73+alpha*86))+','+(Math.round(84+alpha*25))+','+(Math.round(79-alpha*35))+','+(.30+alpha*.65)+')';
      ctx.lineWidth=1.1+alpha*.70+impact*.25;ctx.fill();ctx.stroke();
      ctx.shadowBlur=0;
      line(x-bw*.46,y,x+bw*.46,y,'rgba(89,85,71,'+(.14+alpha*.34)+')',.8+alpha*.3);
      if(impact>0&&contactDirection!==0){
        const contactY=y+contactDirection*bh*.5;
        ctx.strokeStyle=subtraction?'rgba(167,64,52,'+impact*.75+')':'rgba(156,98,33,'+impact*.75+')';
        ctx.lineWidth=.8+impact*.9;ctx.beginPath();ctx.moveTo(x-bw*.18,contactY);ctx.lineTo(x+bw*.18,contactY);ctx.stroke();
      }
      ctx.restore();return;
    }
    ctx.shadowColor=subtraction&&tint>0?'rgba(255,120,112,'+(tint*.78)+')':'rgba(255,205,135,'+(alpha*.56+tint*.22+impact*.23)+')';ctx.shadowBlur=alpha*19+tint*9+impact*7;
    ctx.fillStyle='rgba('+(Math.round(14+alpha*74))+','+(Math.round(17+alpha*55))+','+(Math.round(20+alpha*37))+','+(0.18+alpha*.17)+')';
    ctx.strokeStyle=subtraction&&tint>0 ? 'rgba(244,145,130,'+(.48+tint*.40)+')':'rgba('+(Math.round(78+alpha*170))+','+(Math.round(88+alpha*125))+','+(Math.round(90+alpha*68))+','+(.34+alpha*.54)+')';
    ctx.lineWidth=1.0+alpha*.90+impact*.35;ctx.fill();ctx.stroke();
    ctx.shadowBlur=0;
    line(x-bw*.46,y,x+bw*.46,y,'rgba(175,166,147,'+(.09+alpha*.52)+')',.8+alpha*.35);
    if(impact>0&&contactDirection!==0){
      // A very short light at the contact edge implies a firm physical stop.
      // The bead does not overshoot, compress its position, or rebound.
      const contactY=y+contactDirection*bh*.50;
      ctx.save();ctx.shadowColor='rgba(255,212,147,.8)';ctx.shadowBlur=impact*9;
      ctx.strokeStyle=subtraction
        ?'rgba(255,150,130,'+(impact*.72)+')'
        :'rgba(255,224,163,'+(impact*.72)+')';
      ctx.lineWidth=.7+impact*1.05;
      ctx.beginPath();ctx.moveTo(x-bw*.18,contactY);ctx.lineTo(x+bw*.18,contactY);ctx.stroke();ctx.restore();
    }
    ctx.restore();
  }
  function draw(now){
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(w<20||h<20){scheduleFrame(draw);return}
    ctx.clearRect(0,0,w,h);
    const count=state.columns;
    // Dimensions derive from the uploaded ghost-bead reference.
    const topRail=.072*h,bottomRail=.925*h,barTop=.281*h,barBottom=.338*h,barMiddle=(barTop+barBottom)/2;
    const beadH=Math.min(.114*h,(w-28)/count/1.90*.84);
    const beadW=Math.min(.222*h,(w-30)/count*.84);
    const pitch=Math.min(beadW*1.145,(w-30)/count);
    const xs=Array.from({length:count},(_,i)=>w/2+(i-(count-1)/2)*pitch);
    const microGap=Math.max(2.5,beadH*.075);
    const upperActive=barTop-beadH/2-microGap;
    const upperInactive=upperActive-beadH*.75;
    const lowerActive=barBottom+beadH/2+microGap;
    const lowerInactive=lowerActive+beadH*.72;
    const lowerPitch=beadH+microGap;
    const beadState=state.mode==='test'?encoded(0,count):frameAt(now);

    const light=getTheme()==='light';
    glowLine(topRail,w,light?.68:.29);
    glowLine(bottomRail,w,light?.68:.39);
    for(const x of xs)line(x,topRail,x,bottomRail,light?'rgba(89,104,97,.32)':'rgba(121,132,135,.23)',.9);
    const band=ctx.createLinearGradient(0,barTop,0,barBottom);
    if(light){
      band.addColorStop(0,'rgba(127,140,132,.05)');band.addColorStop(.17,'rgba(117,129,124,.08)');
      band.addColorStop(.5,'rgba(103,115,108,.10)');band.addColorStop(.83,'rgba(117,129,124,.08)');band.addColorStop(1,'rgba(127,140,132,.05)');
    }else{
      band.addColorStop(0,'rgba(135,143,142,.08)');band.addColorStop(.17,'rgba(40,46,48,.19)');
      band.addColorStop(.5,'rgba(14,17,19,.31)');band.addColorStop(.83,'rgba(39,44,46,.21)');band.addColorStop(1,'rgba(152,159,153,.06)');
    }
    ctx.fillStyle=band;ctx.fillRect(0,barTop,w,barBottom-barTop);
    glowLine(barTop,w,1.04);
    glowLine(barBottom,w,.79);
    xs.forEach((x,j)=>{
      for(let i=0;i<5;i++){
        const engagement=beadState[j][i];
        const inactiveY=i===0?upperInactive:lowerInactive+(i-1)*lowerPitch;
        const activeY=i===0?upperActive:lowerActive+(i-1)*lowerPitch;
        const moving=state.mode!=='test'&&state.motionFrom&&state.motionTo&&state.motionFrom[j]
          ? Math.abs(state.motionTo[j][i]-state.motionFrom[j][i]) : 0;
        const elapsed=motionClock(now);
        const fraction=clamp01(elapsed/Math.max(1,state.motionTravelMs));
        const inFlight=elapsed>=0&&fraction<1;
        const impact=moving*contactGlow(now);
        const flightTint=inFlight?Math.sin(Math.PI*fraction)*.38:0;
        const tint=(state.highlightColumn===j||state.highlightColumn===-2)
          ?moving*flightTint+impact*.55:0;
        // Upper beads engage downwards, lower beads engage upwards.
        const direction=moving===0?0:i===0
          ?Math.sign(state.motionTo[j][i]-state.motionFrom[j][i])
          :-Math.sign(state.motionTo[j][i]-state.motionFrom[j][i]);
        drawBead(x,lerp(inactiveY,activeY,engagement),beadW,beadH,engagement,
          tint,state.highlightSign<0,impact,direction);
      }
    });
    for(const x of xs){
      ctx.save();ctx.shadowColor=light?'rgba(167,107,47,.50)':'rgba(255,205,126,.92)';ctx.shadowBlur=Math.max(7,13*h/750);
      ctx.fillStyle=light?'rgba(153,104,45,.95)':'rgba(255,214,146,.94)';ctx.beginPath();ctx.arc(x,barMiddle,Math.max(1.8,3.2*h/750),0,Math.PI*2);ctx.fill();ctx.restore();
      ctx.fillStyle=light?'rgba(241,216,153,.75)':'rgba(255,233,181,.65)';ctx.beginPath();ctx.arc(x,barMiddle,Math.max(1,1.4*h/750),0,Math.PI*2);ctx.fill();
    }
    scheduleFrame(draw);
  }
  state.motionFrom=encoded(state.value,state.columns);
  state.motionTo=encoded(state.value,state.columns);
  state.animationStart=now()-1000;
  scheduleFrame(draw);
  function moveTo(n,instant=false,highlightColumn=-1,sign=0){
    const timestamp=now();
    const from=frameAt(timestamp);
    state.motionFrom=instant?encoded(n,state.columns):from;
    state.motionTo=encoded(n,state.columns);
    state.value=n;
    state.animationStart=timestamp;
    state.animationMs=Number(getAnimationSpeed())||850;
    state.motionFeel=getMotionFeel();
    state.motionTravelMs=instant?1:travelDuration(state.animationMs,state.motionFeel);
    state.highlightColumn=highlightColumn===-2 ? -2 : highlightColumn;
    state.highlightSign=sign;
    onValueChanged();
  }
    return Object.freeze({moveTo, resizeCanvas, frameAt, encoded, draw});
  }
  return Object.freeze({createSorobanRenderer});
});
