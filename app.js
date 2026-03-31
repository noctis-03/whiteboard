/* ════════════════════════════════════════════════════════
   ∞ Canvas — app.js (Bug-fixed version)
   
   Fixes applied:
   1. Mobile button tap: use direct touch handlers instead of relying on click events
      that get swallowed by stopPropagation
   2. Sticky close/color buttons enlarged & touch-friendly
   3. Card add-block button touch fix
   4. Sub-block delete/direction buttons touch fix
   5. Startup window button touch fix
   6. Prevent ghost clicks and double-fire
   7. Fixed textarea/contentEditable focus on mobile
   8. Fixed lasso clearing on touch
   9. Fixed pinch-to-zoom conflict with single-finger drawing
  10. Fixed context menu positioning on mobile
════════════════════════════════════════════════════════ */

const vp    = document.getElementById('viewport');
const board = document.getElementById('board');
const svgl  = document.getElementById('svg-layer');
const pCvs  = document.getElementById('preview-canvas');
const pCtx  = pCvs.getContext('2d');
const mmCvs = document.getElementById('minimap');
const mmCtx = mmCvs.getContext('2d');
const selRect = document.getElementById('sel-rect');

let T = {x:0, y:0, s:1};
let tool='select', color='#1a1714', sw=2;

const penCfg = { smooth:0, opacity:100, cap:'round', pressure:'none' };
let penPanelOpen = false;

let panning=false, panOrigin={x:0,y:0};
let drawing=false, drawPts=[], livePth=null, shapeA=null;
let dragging=null;
let resizing=null;
let selected=null;
let selectedEls=[];
let lasso=null;
let touchLasso=null;
let touchPanOrigin=null;
let ctxEl=null;
let strokes=[];
let zTop=10;
let gridOn=true;
let longPressTimer=null;

/* ════════════════════════════════════════════════════════
   UTILITY: Make buttons work on mobile
   On touch devices, click events inside elements that call
   stopPropagation on touchstart never fire. This helper
   attaches both click AND touchend to ensure the callback fires.
════════════════════════════════════════════════════════ */
function onTap(el, callback) {
  let touchMoved = false;
  let touchStartTime = 0;

  el.addEventListener('click', function(e) {
    e.stopPropagation();
    callback(e);
  });

  el.addEventListener('touchstart', function(e) {
    touchMoved = false;
    touchStartTime = Date.now();
    e.stopPropagation();
  }, {passive: true});

  el.addEventListener('touchmove', function() {
    touchMoved = true;
  }, {passive: true});

  el.addEventListener('touchend', function(e) {
    e.stopPropagation();
    if (!touchMoved && (Date.now() - touchStartTime) < 400) {
      e.preventDefault(); // prevent ghost click
      callback(e);
    }
  });
}

/* ════════════════════════════════════════════════════════
   RESPONSIVE LAYOUT
════════════════════════════════════════════════════════ */
const MOBILE_BP = 767;

function isMobile(){ return window.innerWidth <= MOBILE_BP; }

function syncLayout(){
  const tb = document.getElementById('toolbar');
  const mm = document.getElementById('minimap');
  const tbRect = tb.getBoundingClientRect();

  document.documentElement.style.setProperty('--tb-w', '0px');
  document.documentElement.style.setProperty('--tb-h', '0px');

  vp.style.cssText = `top:0;left:0;right:0;bottom:0;`;
  pCvs.style.cssText = `top:0;left:0;right:0;bottom:0;width:${window.innerWidth}px;height:${window.innerHeight}px;`;
  pCvs.width  = window.innerWidth;
  pCvs.height = window.innerHeight;

  if(mm){
    mm.style.bottom = isMobile() ? `${Math.ceil(tbRect.height) + 20}px` : '16px';
    mm.style.right = '16px';
  }

  updateGrid();
  updateMinimap();
}

window.addEventListener('resize', ()=>{ syncLayout(); });
window.addEventListener('orientationchange', ()=>setTimeout(syncLayout, 250));

/* ════════════════════════════════════════════════════════
   TRANSFORM
════════════════════════════════════════════════════════ */
function applyT(){
  board.style.transform = `translate(${T.x}px,${T.y}px) scale(${T.s})`;
  document.getElementById('zoom-pill').textContent = Math.round(T.s*100)+'%';
  updateGrid(); updateMinimap();
}
function getVpRect(){ return vp.getBoundingClientRect(); }
function s2b(sx,sy){
  const r=getVpRect();
  return {x:(sx-r.left-T.x)/T.s, y:(sy-r.top-T.y)/T.s};
}
function b2s(bx,by){
  const r=getVpRect();
  return {x:r.left+bx*T.s+T.x, y:r.top+by*T.s+T.y};
}
function resetView(){ T={x:0,y:0,s:1}; applyT(); }

function updateGrid(){
  const g = document.getElementById('grid');
  if(!gridOn){ g.style.display='none'; return; }
  g.style.display='block';
  const sz = 40*T.s;
  g.style.backgroundSize = `${sz}px ${sz}px`;
  g.style.backgroundPosition = `${T.x%sz}px ${T.y%sz}px`;
}
function toggleGrid(){ gridOn=!gridOn; updateGrid(); }

/* ════════════════════════════════════════════════════════
   TOOL / COLOR / STROKE
════════════════════════════════════════════════════════ */
function setTool(t){
  tool=t;
  document.body.setAttribute('data-tool',t);
  document.querySelectorAll('.tbtn[id^="t-"]').forEach(b=>b.classList.remove('active'));
  const btn=document.getElementById('t-'+t);
  if(btn) btn.classList.add('active');
  deselectAll(); closeCtx();
  closePenPanel();
}

function setToolOrPanel(t){
  if(tool===t){
    togglePenPanel(t);
  } else {
    setTool(t);
  }
}

/* ════════════════════════════════════════════════════════
   PEN SETTINGS PANEL
════════════════════════════════════════════════════════ */
function togglePenPanel(t){
  if(penPanelOpen){ closePenPanel(); return; }
  openPenPanel(t);
}
function openPenPanel(t){
  const pp=document.getElementById('pen-panel');
  const titles={pen:'✏️ 펜 설정', highlight:'🖊️ 형광펜 설정', eraser:'◻ 지우개 설정'};
  document.getElementById('pp-title-txt').textContent = titles[t]||'설정';
  const isEraser = t==='eraser';
  document.getElementById('pp-smooth').closest('.pp-sect').style.display = isEraser?'none':'';
  document.getElementById('pp-opacity').closest('.pp-sect').style.display = isEraser?'none':'';
  document.getElementById('pp-cap-sect').style.display      = isEraser?'none':'';
  document.getElementById('pp-pressure-sect').style.display = isEraser?'none':'';
  document.querySelector('#pp-preview-wrap').parentElement.style.display = isEraser?'none':'';
  document.getElementById('pp-smooth').value  = penCfg.smooth;
  document.getElementById('pp-smooth-v').textContent = penCfg.smooth;
  document.getElementById('pp-opacity').value = penCfg.opacity;
  document.getElementById('pp-opacity-v').textContent = penCfg.opacity+'%';
  document.querySelectorAll('.pp-cap').forEach(c=>c.classList.toggle('pp-on', c.dataset.cap===penCfg.cap));
  document.querySelectorAll('#pp-pc .pp-chip').forEach(c=>c.classList.toggle('pp-on', c.dataset.pressure===penCfg.pressure));
  positionPenPanel(t);
  pp.style.display='flex';
  requestAnimationFrame(()=>{ pp.classList.add('pp-open'); });
  penPanelOpen=true;
  updatePPPreview();
}
function closePenPanel(){
  const pp=document.getElementById('pen-panel');
  pp.classList.remove('pp-open');
  penPanelOpen=false;
  setTimeout(()=>{ if(!penPanelOpen) pp.style.display='none'; },160);
}
function positionPenPanel(t){
  if(window.innerWidth<=767) return;
  const btn=document.getElementById('t-'+t);
  if(!btn) return;
  const br=btn.getBoundingClientRect();
  const pp=document.getElementById('pen-panel');
  pp.style.left=(br.right+10)+'px';
  pp.style.top = Math.min(br.top, window.innerHeight-500)+'px';
}
function onPPChange(){
  penCfg.smooth  = parseInt(document.getElementById('pp-smooth').value);
  penCfg.opacity = parseInt(document.getElementById('pp-opacity').value);
  document.getElementById('pp-smooth-v').textContent  = penCfg.smooth;
  document.getElementById('pp-opacity-v').textContent = penCfg.opacity+'%';
  const chips=[...document.querySelectorAll('#pp-sc .pp-chip')];
  const presets=[0,5,10,18];
  chips.forEach((c,i)=>c.classList.toggle('pp-on', presets[i]===penCfg.smooth));
  updatePPPreview();
}
function setPPSmooth(v,el){
  document.querySelectorAll('#pp-sc .pp-chip').forEach(c=>c.classList.remove('pp-on'));
  el.classList.add('pp-on');
  penCfg.smooth=v;
  document.getElementById('pp-smooth').value=v;
  document.getElementById('pp-smooth-v').textContent=v;
  updatePPPreview();
}
function setPPCap(el){
  document.querySelectorAll('.pp-cap').forEach(c=>c.classList.remove('pp-on'));
  el.classList.add('pp-on');
  penCfg.cap=el.dataset.cap;
  updatePPPreview();
}
function setPPPressure(el){
  document.querySelectorAll('#pp-pc .pp-chip').forEach(c=>c.classList.remove('pp-on'));
  el.classList.add('pp-on');
  penCfg.pressure=el.dataset.pressure;
  updatePPPreview();
}
function updatePPPreview(){
  const p=document.getElementById('pp-preview-path'); if(!p) return;
  const demoPts=[{x:10,y:30},{x:30,y:10},{x:50,y:22},{x:70,y:34},{x:90,y:18},{x:110,y:8},{x:130,y:22},{x:150,y:34},{x:170,y:16},{x:192,y:14}];
  const baseW = (tool==='highlight') ? sw*4 : sw;
  const col = (tool==='highlight') ? color+'99' : color;
  const opacity = penCfg.opacity/100;
  if(penCfg.pressure && penCfg.pressure!=='none'){
    p.setAttribute('d', buildTaperOutlinePath(demoPts, Math.max(2,baseW), penCfg.pressure));
    p.setAttribute('fill', col);
    p.setAttribute('fill-opacity', opacity);
    p.setAttribute('stroke', 'none');
    p.removeAttribute('stroke-opacity');
    p.removeAttribute('stroke-width');
    p.removeAttribute('stroke-linecap');
  } else {
    p.setAttribute('stroke',col);
    p.setAttribute('stroke-opacity',opacity);
    p.setAttribute('stroke-linecap',penCfg.cap);
    p.setAttribute('stroke-linejoin','round');
    p.setAttribute('stroke-width', Math.max(1,baseW));
    p.setAttribute('fill','none');
    p.removeAttribute('fill-opacity');
    p.setAttribute('d', pts2path(demoPts));
  }
}

function smoothPts(pts, level){
  if(level===0||pts.length<3) return pts;
  const out=[pts[0]];
  const k=Math.min(level,Math.floor(pts.length/2));
  for(let i=1;i<pts.length-1;i++){
    let sx=0,sy=0,cnt=0;
    for(let j=Math.max(0,i-k);j<=Math.min(pts.length-1,i+k);j++){
      sx+=pts[j].x; sy+=pts[j].y; cnt++;
    }
    out.push({x:sx/cnt,y:sy/cnt});
  }
  out.push(pts[pts.length-1]);
  return out;
}

function setColor(el){
  document.querySelectorAll('.cdot').forEach(d=>d.classList.remove('active'));
  el.classList.add('active'); color=el.dataset.c;
}
function setStroke(el,v){
  document.querySelectorAll('.sbtn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active'); sw=v;
}

/* ════════════════════════════════════════════════════════
   SELECTION
════════════════════════════════════════════════════════ */
function select(el, additive=false){
  if(!additive) deselectAll();
  if(selectedEls.includes(el)) return;
  selectedEls.push(el);
  selected=el;
  el.classList.add('selected');
  const handles = el.querySelector('.el-handles');
  if(handles) handles.style.display='block';
}
function deselectAll(){
  selectedEls.forEach(el=>{
    el.classList.remove('selected');
    const handles = el.querySelector('.el-handles');
    if(handles) handles.style.display='none';
  });
  selectedEls=[]; selected=null;
}

/* ════════════════════════════════════════════════════════
   LASSO
════════════════════════════════════════════════════════ */
function showSelRect(l){
  const x=Math.min(l.x0,l.x1), y=Math.min(l.y0,l.y1);
  const w=Math.abs(l.x1-l.x0), h=Math.abs(l.y1-l.y0);
  selRect.style.cssText=`display:block;left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
}
function hideSelRect(){ selRect.style.display='none'; }
function highlightLasso(l){
  const sx=Math.min(l.x0,l.x1), sy=Math.min(l.y0,l.y1);
  const ex=Math.max(l.x0,l.x1), ey=Math.max(l.y0,l.y1);
  board.querySelectorAll('.el').forEach(el=>{
    const bx=parseFloat(el.style.left), by=parseFloat(el.style.top);
    const bw=parseFloat(el.style.width), bh=parseFloat(el.style.height);
    const s2=b2s(bx,by), se=b2s(bx+bw,by+bh);
    el.classList.toggle('lasso-hover', se.x>sx&&s2.x<ex&&se.y>sy&&s2.y<ey);
  });
}
function finalizeLasso(l){
  const sx=Math.min(l.x0,l.x1), sy=Math.min(l.y0,l.y1);
  const ex=Math.max(l.x0,l.x1), ey=Math.max(l.y0,l.y1);
  deselectAll();
  if(ex-sx<5 && ey-sy<5) return;
  board.querySelectorAll('.el').forEach(el=>{
    el.classList.remove('lasso-hover');
    const bx=parseFloat(el.style.left), by=parseFloat(el.style.top);
    const bw=parseFloat(el.style.width), bh=parseFloat(el.style.height);
    const s2=b2s(bx,by), se=b2s(bx+bw,by+bh);
    if(se.x>sx&&s2.x<ex&&se.y>sy&&s2.y<ey) select(el,true);
  });
}

/* ════════════════════════════════════════════════════════
   WHEEL ZOOM
════════════════════════════════════════════════════════ */
vp.addEventListener('wheel',e=>{
  e.preventDefault(); closeCtx();
  const f = e.deltaY<0 ? 1.09 : 0.92;
  const ns = Math.min(8, Math.max(0.08, T.s*f));
  const r=getVpRect();
  const lx=e.clientX-r.left, ly=e.clientY-r.top;
  T.x = lx-(lx-T.x)*(ns/T.s);
  T.y = ly-(ly-T.y)*(ns/T.s);
  T.s=ns; applyT();
},{passive:false});

/* ════════════════════════════════════════════════════════
   MOUSE — DOWN / MOVE / UP
════════════════════════════════════════════════════════ */
vp.addEventListener('mousedown',e=>{
  if(e.button===2) return;
  closeCtx();
  if(e.button===1 || tool==='pan'){
    panning=true;
    const r=getVpRect();
    panOrigin={x:e.clientX-r.left-T.x, y:e.clientY-r.top-T.y};
    document.body.classList.add('panning');
    e.preventDefault(); return;
  }
  const bp=s2b(e.clientX,e.clientY);
  if(tool==='pen'||tool==='highlight'){
    drawing=true; drawPts=[bp];
    livePth=mkSvg('path');
    livePth.setAttribute('fill','none');
    const col = tool==='highlight'?color+'99':color;
    livePth.setAttribute('stroke', col);
    livePth.setAttribute('stroke-opacity', penCfg.opacity/100);
    livePth.setAttribute('stroke-width', tool==='highlight'?sw*4:sw);
    livePth.setAttribute('stroke-linecap', penCfg.cap||'round');
    livePth.setAttribute('stroke-linejoin','round');
    svgl.appendChild(livePth); return;
  }
  if(tool==='eraser'){drawing=true; eraseAt(bp); return;}
  if(tool==='rect'||tool==='circle'||tool==='arrow'){drawing=true; shapeA=bp; return;}
  if(tool==='text'){ addText(bp); return; }
  if(tool==='select'){
    if(!e.target.closest('.el')){
      deselectAll();
      lasso={x0:e.clientX,y0:e.clientY,x1:e.clientX,y1:e.clientY};
      showSelRect(lasso);
      e.preventDefault();
    }
  }
});

window.addEventListener('mousemove',e=>{
  if(panning){
    const r=getVpRect();
    T.x=e.clientX-r.left-panOrigin.x; T.y=e.clientY-r.top-panOrigin.y; applyT(); return;
  }
  if(dragging){
    const bp=s2b(e.clientX,e.clientY);
    if(dragging.els){
      dragging.els.forEach(d=>{ d.el.style.left=(bp.x-d.ox)+'px'; d.el.style.top=(bp.y-d.oy)+'px'; });
    } else {
      dragging.el.style.left=(bp.x-dragging.ox)+'px';
      dragging.el.style.top =(bp.y-dragging.oy)+'px';
    }
    updateMinimap(); return;
  }
  if(resizing){ doResize(e.clientX,e.clientY); return; }
  if(lasso){ lasso.x1=e.clientX; lasso.y1=e.clientY; showSelRect(lasso); highlightLasso(lasso); return; }
  if(!drawing) return;
  const bp=s2b(e.clientX,e.clientY);
  if(tool==='pen'||tool==='highlight'){ drawPts.push(bp); if(livePth) livePth.setAttribute('d',pts2path(drawPts)); }
  if(tool==='eraser') eraseAt(bp);
  if((tool==='rect'||tool==='circle'||tool==='arrow')&&shapeA) previewShape(shapeA,bp);
});

window.addEventListener('mouseup',e=>{
  document.body.classList.remove('panning');
  if(panning){ panning=false; return; }
  if(dragging){ dragging=null; updateMinimap(); return; }
  if(resizing){ resizing=null; updateMinimap(); return; }
  if(lasso){ finalizeLasso(lasso); lasso=null; hideSelRect(); return; }
  if(!drawing) return;
  drawing=false;
  pCtx.clearRect(0,0,pCvs.width,pCvs.height);
  if(tool==='pen'||tool==='highlight'){
    commitFreehandStroke(drawPts);
  }
  if((tool==='rect'||tool==='circle'||tool==='arrow')&&shapeA){
    const bp=s2b(e.clientX,e.clientY);
    if(Math.abs(bp.x-shapeA.x)>4||Math.abs(bp.y-shapeA.y)>4) finalizeShape(shapeA,bp);
    shapeA=null;
  }
});

/* ════════════════════════════════════════════════════════
   CONTEXT MENU
════════════════════════════════════════════════════════ */
vp.addEventListener('contextmenu',e=>{
  e.preventDefault();
  const el=e.target.closest('.el');
  if(el) showCtxMenu(el, e.clientX, e.clientY);
});
document.addEventListener('click',()=>closeCtx());
function showCtxMenu(el,cx,cy){
  ctxEl=el;
  const m=document.getElementById('ctx');
  const mw=150, mh=160;
  let lx=cx, ly=cy;
  if(lx+mw>innerWidth)  lx=innerWidth-mw-8;
  if(ly+mh>innerHeight) ly=cy-mh-8;
  if(lx<4) lx=4;
  if(ly<4) ly=4;
  m.style.left=lx+'px'; m.style.top=ly+'px'; m.style.display='block';
}
function closeCtx(){ document.getElementById('ctx').style.display='none'; }
function ctxDo(a){
  if(!ctxEl) return; closeCtx();
  if(a==='del'){
    const targets=selectedEls.length>0?[...selectedEls]:[ctxEl];
    targets.forEach(e=>e.remove());
    selectedEls=[]; selected=null; updateMinimap();
  }
  if(a==='dup') duplicateEl(ctxEl);
  if(a==='front') ctxEl.style.zIndex=++zTop;
  if(a==='back')  ctxEl.style.zIndex=1;
}

/* ════════════════════════════════════════════════════════
   LONG-PRESS
════════════════════════════════════════════════════════ */
function startLongPress(target,cx,cy){
  longPressTimer=setTimeout(()=>{
    const el=target.closest('.el');
    if(el) showCtxMenu(el, cx, cy);
  },500);
}
function cancelLongPress(){ clearTimeout(longPressTimer); longPressTimer=null; }

/* ════════════════════════════════════════════════════════
   SVG HELPERS
════════════════════════════════════════════════════════ */
function mkSvg(tag){ return document.createElementNS('http://www.w3.org/2000/svg',tag); }
function setAttrs(el,attrs){ for(const[k,v] of Object.entries(attrs)) el.setAttribute(k,v); }
function pts2path(pts){
  if(pts.length<2) return '';
  let d=`M${pts[0].x},${pts[0].y}`;
  for(let i=1;i<pts.length;i++){
    const p=pts[i-1],c=pts[i];
    d+=` Q${p.x},${p.y} ${(p.x+c.x)/2},${(p.y+c.y)/2}`;
  }
  return d;
}
function taperMul(t, mode){
  const min=0.18, edge=0.22;
  if(mode==='start') return t<edge ? min + (1-min)*(t/edge) : 1;
  if(mode==='end')   return t>1-edge ? min + (1-min)*((1-t)/edge) : 1;
  if(mode==='both'){
    if(t<edge) return min + (1-min)*(t/edge);
    if(t>1-edge) return min + (1-min)*((1-t)/edge);
    return 1;
  }
  return 1;
}
function buildTaperOutlinePath(pts, width, mode){
  if(pts.length<2) return '';
  const left=[], right=[];
  for(let i=0;i<pts.length;i++){
    const prev=pts[Math.max(0,i-1)], next=pts[Math.min(pts.length-1,i+1)];
    let dx=next.x-prev.x, dy=next.y-prev.y;
    const len=Math.hypot(dx,dy)||1;
    dx/=len; dy/=len;
    const nx=-dy, ny=dx;
    const hw=Math.max(0.8, (width*taperMul(i/(pts.length-1), mode))/2);
    left.push({x:pts[i].x + nx*hw, y:pts[i].y + ny*hw});
    right.push({x:pts[i].x - nx*hw, y:pts[i].y - ny*hw});
  }
  const ring=[...left, ...right.reverse()];
  let d=`M${ring[0].x},${ring[0].y}`;
  for(let i=1;i<ring.length;i++) d+=` L${ring[i].x},${ring[i].y}`;
  d+=' Z';
  return d;
}
function buildFreehandStrokeSpec(pts){
  const baseW = (tool==='highlight') ? sw*4 : sw;
  const col = (tool==='highlight') ? color+'99' : color;
  const opacity = penCfg.opacity/100;
  const cap = penCfg.cap||'round';
  if(penCfg.pressure && penCfg.pressure!=='none'){
    return {
      kind:'taper-path',
      attrs:{d:buildTaperOutlinePath(pts, Math.max(1,baseW), penCfg.pressure), fill:col, 'fill-opacity':opacity, stroke:'none'}
    };
  }
  return {
    kind:'path',
    attrs:{d:pts2path(pts), stroke:col, 'stroke-opacity':opacity, 'stroke-width':baseW, fill:'none', 'stroke-linecap':cap, 'stroke-linejoin':'round'}
  };
}
function commitFreehandStroke(pts){
  if(pts.length<=1){ if(livePth && livePth.parentNode) svgl.removeChild(livePth); livePth=null; drawPts=[]; return; }
  const smoothed = smoothPts(pts, penCfg.smooth);
  const spec = buildFreehandStrokeSpec(smoothed);
  let finalEl = livePth;
  if(spec.kind==='taper-path'){
    if(finalEl && finalEl.parentNode) svgl.removeChild(finalEl);
    finalEl = mkSvg('path');
    setAttrs(finalEl, spec.attrs);
    svgl.appendChild(finalEl);
  } else {
    if(finalEl) setAttrs(finalEl, spec.attrs);
  }
  strokes.push({kind:spec.kind, attrs:spec.attrs, svgEl:finalEl});
  livePth=null; drawPts=[];
}

function previewShape(a,b){
  pCtx.clearRect(0,0,pCvs.width,pCvs.height);
  const cr=pCvs.getBoundingClientRect();
  const sa=b2s(a.x,a.y), sb=b2s(b.x,b.y);
  const ssa={x:sa.x-cr.left, y:sa.y-cr.top};
  const ssb={x:sb.x-cr.left, y:sb.y-cr.top};
  pCtx.save();
  pCtx.strokeStyle=color; pCtx.lineWidth=sw*T.s; pCtx.lineCap='round'; pCtx.lineJoin='round';
  if(tool==='rect') pCtx.strokeRect(ssa.x,ssa.y,ssb.x-ssa.x,ssb.y-ssa.y);
  if(tool==='circle'){
    const rx=(ssb.x-ssa.x)/2,ry=(ssb.y-ssa.y)/2;
    pCtx.beginPath(); pCtx.ellipse(ssa.x+rx,ssa.y+ry,Math.abs(rx),Math.abs(ry),0,0,Math.PI*2); pCtx.stroke();
  }
  if(tool==='arrow'){
    pCtx.beginPath(); pCtx.moveTo(ssa.x,ssa.y); pCtx.lineTo(ssb.x,ssb.y); pCtx.stroke();
    const ang=Math.atan2(ssb.y-ssa.y,ssb.x-ssa.x), hl=(12+sw*2)*T.s;
    pCtx.beginPath();
    pCtx.moveTo(ssb.x,ssb.y); pCtx.lineTo(ssb.x-hl*Math.cos(ang-.45),ssb.y-hl*Math.sin(ang-.45));
    pCtx.moveTo(ssb.x,ssb.y); pCtx.lineTo(ssb.x-hl*Math.cos(ang+.45),ssb.y-hl*Math.sin(ang+.45));
    pCtx.stroke();
  }
  pCtx.restore();
}

function finalizeShape(a,b){
  if(tool==='rect'){
    const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(b.x-a.x),h=Math.abs(b.y-a.y);
    const el=mkSvg('rect');
    const attrs={x,y,width:w,height:h,fill:'none',stroke:color,'stroke-width':sw,'stroke-linecap':'round'};
    setAttrs(el,attrs); svgl.appendChild(el); strokes.push({kind:'rect',attrs,svgEl:el});
  }
  if(tool==='circle'){
    const cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,rx=Math.abs(b.x-a.x)/2,ry=Math.abs(b.y-a.y)/2;
    const el=mkSvg('ellipse');
    const attrs={cx,cy,rx,ry,fill:'none',stroke:color,'stroke-width':sw};
    setAttrs(el,attrs); svgl.appendChild(el); strokes.push({kind:'ellipse',attrs,svgEl:el});
  }
  if(tool==='arrow'){
    const g=mkSvg('g'), line=mkSvg('line');
    setAttrs(line,{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:color,'stroke-width':sw,'stroke-linecap':'round'});
    const ang=Math.atan2(b.y-a.y,b.x-a.x),hl=12+sw*2;
    const d=`M${b.x},${b.y} L${b.x-hl*Math.cos(ang-.45)},${b.y-hl*Math.sin(ang-.45)} M${b.x},${b.y} L${b.x-hl*Math.cos(ang+.45)},${b.y-hl*Math.sin(ang+.45)}`;
    const path=mkSvg('path');
    setAttrs(path,{d,stroke:color,'stroke-width':sw,'stroke-linecap':'round',fill:'none'});
    g.appendChild(line); g.appendChild(path); svgl.appendChild(g);
    strokes.push({kind:'arrow',svgEl:g,attrs:{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:color,'stroke-width':sw,hl,d}});
  }
  updateMinimap();
}

/* ════════════════════════════════════════════════════════
   ERASER
════════════════════════════════════════════════════════ */
function eraseAt(bp){
  const r=18/T.s;
  for(let i=strokes.length-1;i>=0;i--){
    try{
      const bb=strokes[i].svgEl.getBBox();
      if(bp.x>=bb.x-r&&bp.x<=bb.x+bb.width+r&&bp.y>=bb.y-r&&bp.y<=bb.y+bb.height+r){
        svgl.removeChild(strokes[i].svgEl); strokes.splice(i,1);
      }
    }catch(e){}
  }
}

/* ════════════════════════════════════════════════════════
   ELEMENT SYSTEM
════════════════════════════════════════════════════════ */
function makeEl(x,y,w,h){
  const el=document.createElement('div');
  el.className='el';
  el.style.cssText=`left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:${++zTop};`;
  return el;
}

function addHandles(el){
  const hc=document.createElement('div');
  hc.className='el-handles';

  const mv=document.createElement('div'); mv.className='h-move';
  function startMove(cx,cy){
    if(tool!=='select') return;
    if(!selectedEls.includes(el)){ deselectAll(); select(el); }
    el.style.zIndex=++zTop;
    const bp=s2b(cx,cy);
    if(selectedEls.length>1){
      dragging={els:selectedEls.map(e2=>({el:e2,ox:bp.x-parseFloat(e2.style.left),oy:bp.y-parseFloat(e2.style.top)}))};
    } else {
      dragging={el,ox:bp.x-parseFloat(el.style.left),oy:bp.y-parseFloat(el.style.top)};
    }
  }
  mv.addEventListener('mousedown',e=>{ if(e.button!==0) return; e.stopPropagation(); e.preventDefault(); startMove(e.clientX,e.clientY); });
  mv.addEventListener('touchstart',e=>{ if(e.touches.length!==1) return; e.stopPropagation(); e.preventDefault(); startMove(e.touches[0].clientX,e.touches[0].clientY); cancelLongPress(); },{passive:false});
  hc.appendChild(mv);

  ['nw','n','ne','e','se','s','sw','w'].forEach(dir=>{
    const rh=document.createElement('div'); rh.className=`h-resize ${dir}`;
    function startResize(cx,cy){
      const r0={x:parseFloat(el.style.left),y:parseFloat(el.style.top),w:parseFloat(el.style.width),h:parseFloat(el.style.height)};
      resizing={el,dir,r0,m0:s2b(cx,cy)};
    }
    rh.addEventListener('mousedown',e=>{ e.stopPropagation(); e.preventDefault(); startResize(e.clientX,e.clientY); });
    rh.addEventListener('touchstart',e=>{ if(e.touches.length!==1) return; e.stopPropagation(); e.preventDefault(); startResize(e.touches[0].clientX,e.touches[0].clientY); },{passive:false});
    hc.appendChild(rh);
  });
  el.appendChild(hc);
}

function doResize(cx,cy){
  if(!resizing) return;
  const {el,dir,r0,m0}=resizing;
  const cur=s2b(cx,cy), dx=cur.x-m0.x, dy=cur.y-m0.y;
  let {x,y,w,h}=r0;
  const MW=60,MH=40;
  if(dir.includes('e')){w=Math.max(MW,r0.w+dx);}
  if(dir.includes('s')){h=Math.max(MH,r0.h+dy);}
  if(dir.includes('w')){ const nw=Math.max(MW,r0.w-dx); x=r0.x+r0.w-nw; w=nw; }
  if(dir.includes('n')){ const nh=Math.max(MH,r0.h-dy); y=r0.y+r0.h-nh; h=nh; }
  el.style.left=x+'px'; el.style.top=y+'px'; el.style.width=w+'px'; el.style.height=h+'px';
}

function attachSelectClick(el){
  el.addEventListener('mousedown',e=>{
    if(tool!=='select') return;
    e.stopPropagation();
    const add=e.shiftKey||e.metaKey||e.ctrlKey;
    if(!add && !selectedEls.includes(el)) deselectAll();
    select(el, add || selectedEls.includes(el));
    el.style.zIndex=++zTop;
    const bp=s2b(e.clientX,e.clientY);
    if(selectedEls.length>1){
      dragging={els:selectedEls.map(e2=>({el:e2,ox:bp.x-parseFloat(e2.style.left),oy:bp.y-parseFloat(e2.style.top)}))};
    } else {
      dragging={el,ox:bp.x-parseFloat(el.style.left),oy:bp.y-parseFloat(el.style.top)};
    }
    e.preventDefault();
  });
  el.addEventListener('touchstart',e=>{
    if(tool!=='select'||e.touches.length!==1) return;
    // Don't capture touch if it's on interactive child elements
    const tag = e.target.tagName;
    const isEditable = e.target.isContentEditable || tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'BUTTON';
    if(isEditable) return;

    e.stopPropagation();
    const t=e.touches[0];
    startLongPress(e.target, t.clientX, t.clientY);
    if(!selectedEls.includes(el)) deselectAll();
    select(el,false);
    el.style.zIndex=++zTop;
    const bp=s2b(t.clientX,t.clientY);
    if(selectedEls.length>1){
      dragging={els:selectedEls.map(e2=>({el:e2,ox:bp.x-parseFloat(e2.style.left),oy:bp.y-parseFloat(e2.style.top)}))};
    } else {
      dragging={el,ox:bp.x-parseFloat(el.style.left),oy:bp.y-parseFloat(el.style.top)};
    }
    e.preventDefault();
  },{passive:false});
}

/* ════════════════════════════════════════════════════════
   TOUCH — 1-finger actions
════════════════════════════════════════════════════════ */
vp.addEventListener('touchstart',e=>{
  cancelLongPress();
  if(e.touches.length===2) return;
  if(e.touches.length!==1) return;
  const t=e.touches[0];
  closeCtx();

  if(tool==='pan'){
    const r=getVpRect();
    touchPanOrigin={x:t.clientX-r.left-T.x, y:t.clientY-r.top-T.y};
    document.body.classList.add('panning');
    e.preventDefault(); return;
  }
  const bp=s2b(t.clientX,t.clientY);
  if(tool==='pen'||tool==='highlight'){
    drawing=true; drawPts=[bp];
    livePth=mkSvg('path');
    livePth.setAttribute('fill','none');
    livePth.setAttribute('stroke',tool==='highlight'?color+'99':color);
    livePth.setAttribute('stroke-opacity', penCfg.opacity/100);
    livePth.setAttribute('stroke-width',tool==='highlight'?sw*4:sw);
    livePth.setAttribute('stroke-linecap', penCfg.cap||'round');
    livePth.setAttribute('stroke-linejoin','round');
    svgl.appendChild(livePth); e.preventDefault(); return;
  }
  if(tool==='eraser'){ drawing=true; eraseAt(bp); e.preventDefault(); return; }
  if(tool==='rect'||tool==='circle'||tool==='arrow'){ drawing=true; shapeA=bp; e.preventDefault(); return; }
  if(tool==='text'){ addText(bp); e.preventDefault(); return; }
  if(tool==='select'){
    if(!e.target.closest('.el')){
      deselectAll();
      touchLasso={x0:t.clientX,y0:t.clientY,x1:t.clientX,y1:t.clientY};
      startLongPress(e.target, t.clientX, t.clientY);
      showSelRect(touchLasso);
      e.preventDefault();
    }
  }
},{passive:false});

window.addEventListener('touchmove',e=>{
  if(e.touches.length===2) return;
  if(e.touches.length!==1) return;
  cancelLongPress();
  const t=e.touches[0];
  if(touchPanOrigin){
    const r=getVpRect();
    T.x=t.clientX-r.left-touchPanOrigin.x; T.y=t.clientY-r.top-touchPanOrigin.y; applyT(); e.preventDefault(); return;
  }
  if(dragging){
    const bp=s2b(t.clientX,t.clientY);
    if(dragging.els){ dragging.els.forEach(d=>{ d.el.style.left=(bp.x-d.ox)+'px'; d.el.style.top=(bp.y-d.oy)+'px'; }); }
    else { dragging.el.style.left=(bp.x-dragging.ox)+'px'; dragging.el.style.top=(bp.y-dragging.oy)+'px'; }
    updateMinimap(); e.preventDefault(); return;
  }
  if(resizing){ doResize(t.clientX,t.clientY); updateMinimap(); e.preventDefault(); return; }
  if(touchLasso){ touchLasso.x1=t.clientX; touchLasso.y1=t.clientY; showSelRect(touchLasso); highlightLasso(touchLasso); e.preventDefault(); return; }
  if(!drawing) return;
  e.preventDefault();
  const bp=s2b(t.clientX,t.clientY);
  if(tool==='pen'||tool==='highlight'){ drawPts.push(bp); if(livePth) livePth.setAttribute('d',pts2path(drawPts)); }
  if(tool==='eraser') eraseAt(bp);
  if((tool==='rect'||tool==='circle'||tool==='arrow')&&shapeA) previewShape(shapeA,bp);
},{passive:false});

window.addEventListener('touchend',e=>{
  cancelLongPress();
  document.body.classList.remove('panning');
  if(touchPanOrigin){ touchPanOrigin=null; return; }
  if(dragging){ dragging=null; updateMinimap(); return; }
  if(resizing){ resizing=null; updateMinimap(); return; }
  if(touchLasso){ finalizeLasso(touchLasso); touchLasso=null; hideSelRect(); board.querySelectorAll('.lasso-hover').forEach(el=>el.classList.remove('lasso-hover')); return; }
  if(!drawing) return;
  drawing=false;
  pCtx.clearRect(0,0,pCvs.width,pCvs.height);
  const lastT=e.changedTouches[0];
  if(tool==='pen'||tool==='highlight'){
    commitFreehandStroke(drawPts);
  }
  if((tool==='rect'||tool==='circle'||tool==='arrow')&&shapeA){
    if(lastT) {
      const bp=s2b(lastT.clientX,lastT.clientY);
      if(Math.abs(bp.x-shapeA.x)>4||Math.abs(bp.y-shapeA.y)>4) finalizeShape(shapeA,bp);
    }
    shapeA=null;
  }
});

/* ════════════════════════════════════════════════════════
   PINCH ZOOM + TWO-FINGER PAN
════════════════════════════════════════════════════════ */
let pinchDist   = null;
let pinchMid    = null;
let pinchActive = false;

function cancelSingleFingerActions(){
  if(drawing){
    drawing=false;
    if(livePth && livePth.parentNode) svgl.removeChild(livePth);
    livePth=null; drawPts=[]; shapeA=null;
    pCtx.clearRect(0,0,pCvs.width,pCvs.height);
  }
  if(touchLasso){ touchLasso=null; hideSelRect(); board.querySelectorAll('.lasso-hover').forEach(el=>el.classList.remove('lasso-hover')); }
  if(touchPanOrigin){ touchPanOrigin=null; document.body.classList.remove('panning'); }
  if(dragging) dragging=null;
  if(resizing) resizing=null;
  cancelLongPress();
}

vp.addEventListener('touchstart',e=>{
  if(e.touches.length===2){
    cancelSingleFingerActions();
    const t0=e.touches[0], t1=e.touches[1];
    pinchDist = Math.hypot(t0.clientX-t1.clientX, t0.clientY-t1.clientY);
    pinchMid  = { x:(t0.clientX+t1.clientX)/2, y:(t0.clientY+t1.clientY)/2 };
    pinchActive = true;
    e.preventDefault();
  }
},{passive:false});

vp.addEventListener('touchmove',e=>{
  if(e.touches.length===2 && pinchActive){
    e.preventDefault();
    const t0=e.touches[0], t1=e.touches[1];
    const newDist = Math.hypot(t0.clientX-t1.clientX, t0.clientY-t1.clientY);
    const newMid  = { x:(t0.clientX+t1.clientX)/2, y:(t0.clientY+t1.clientY)/2 };

    if(pinchMid){
      T.x += newMid.x - pinchMid.x;
      T.y += newMid.y - pinchMid.y;
    }

    if(pinchDist && pinchDist>0){
      const ratio = newDist / pinchDist;
      const ns = Math.min(8, Math.max(0.08, T.s * ratio));
      const r = getVpRect();
      const mx = newMid.x - r.left;
      const my = newMid.y - r.top;
      T.x = mx - (mx - T.x) * (ns / T.s);
      T.y = my - (my - T.y) * (ns / T.s);
      T.s = ns;
    }

    pinchDist = newDist;
    pinchMid  = newMid;
    applyT();
  }
},{passive:false});

function resetPinchState(){
  pinchDist = null;
  pinchMid  = null;
  pinchActive = false;
}
window.addEventListener('touchend', e=>{
  if(e.touches.length < 2) resetPinchState();
});
window.addEventListener('touchcancel', resetPinchState);

/* ════════════════════════════════════════════════════════
   STICKY
════════════════════════════════════════════════════════ */
const SC=['#fff9c4','#fce4ec','#e3f2fd','#e8f5e9','#f3e5f5','#fff3e0'];
let sci=0;
function addSticky(opts={}){
  const r=getVpRect();
  const c=s2b(r.left+vp.offsetWidth/2,r.top+vp.offsetHeight/2);
  const x=opts.x??c.x-100, y=opts.y??c.y-80;
  const w=opts.w??200, h=opts.h??170;
  const bg=opts.bg??SC[sci++%SC.length];
  const el=makeEl(x,y,w,h);
  el.dataset.kind='sticky';
  const body=document.createElement('div');
  body.className='el-body sticky-body';
  body.style.background=bg;

  // Build sticky bar
  const bar=document.createElement('div');
  bar.className='sticky-bar';

  const colorBtn=document.createElement('button');
  colorBtn.className='sticky-btn';
  colorBtn.textContent='◐';
  onTap(colorBtn, ()=>cycleStickyBg(el));

  const closeBtn=document.createElement('button');
  closeBtn.className='sticky-btn';
  closeBtn.textContent='✕';
  onTap(closeBtn, ()=>{ el.remove(); updateMinimap(); });

  bar.appendChild(colorBtn);
  bar.appendChild(closeBtn);

  const ta=document.createElement('textarea');
  ta.placeholder='메모...';
  ta.value=opts.text??'';
  ta.addEventListener('mousedown',e=>e.stopPropagation());
  ta.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});

  body.appendChild(bar);
  body.appendChild(ta);
  el.appendChild(body);
  addHandles(el); attachSelectClick(el);
  board.appendChild(el);
  if(!opts.x) setTimeout(()=>ta.focus(),50);
  updateMinimap(); return el;
}
function cycleStickyBg(el){
  const b=el.querySelector('.sticky-body');
  const curBg = b.style.background;
  let idx = SC.indexOf(curBg);
  if(idx===-1) idx=0;
  b.style.background=SC[(idx+1)%SC.length];
}

/* ════════════════════════════════════════════════════════
   CARD WINDOW
════════════════════════════════════════════════════════ */
const CARD_GRID = 20;

function snapToGrid(val){ return Math.round(val / CARD_GRID) * CARD_GRID; }

let subDrag = null;

function addCardWindow(opts={}){
  const r=getVpRect();
  const c=s2b(r.left+vp.offsetWidth/2, r.top+vp.offsetHeight/2);
  const x=opts.x??c.x-160, y=opts.y??c.y-120;
  const w=opts.w??340, h=opts.h??300;
  const el=makeEl(x,y,w,h);
  el.dataset.kind='card';

  const body=document.createElement('div');
  body.className='el-body card-body';

  /* Header */
  const header=document.createElement('div');
  header.className='card-header';
  const titleEl=document.createElement('div');
  titleEl.className='card-title';
  titleEl.contentEditable=true;
  titleEl.spellcheck=false;
  titleEl.textContent=opts.title??'제목 없음';
  titleEl.addEventListener('mousedown',e=>e.stopPropagation());
  titleEl.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});

  const closeBtn=document.createElement('button');
  closeBtn.className='card-close-btn';
  closeBtn.textContent='✕';
  onTap(closeBtn, ()=>{ el.remove(); updateMinimap(); });

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  /* Content */
  const content=document.createElement('div');
  content.className='card-content';
  content.contentEditable=true;
  content.spellcheck=false;
  content.textContent=opts.text??'';
  content.setAttribute('data-placeholder','내용을 입력하세요...');
  content.addEventListener('mousedown',e=>e.stopPropagation());
  content.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});

  /* Sub-block container */
  const subContainer=document.createElement('div');
  subContainer.className='card-sub-container';
  subContainer.addEventListener('mousedown',e=>e.stopPropagation());
  subContainer.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});

  /* Add-block button */
  const addBtn=document.createElement('button');
  addBtn.className='card-add-block-btn';
  addBtn.textContent='+ 블록 추가';
  onTap(addBtn, ()=> addSubBlock(subContainer));

  body.appendChild(header);
  body.appendChild(content);
  body.appendChild(subContainer);
  body.appendChild(addBtn);
  el.appendChild(body);

  addHandles(el); attachSelectClick(el);
  board.appendChild(el);

  /* Restore saved sub-blocks */
  if(opts.blocks && Array.isArray(opts.blocks)){
    opts.blocks.forEach(b=>addSubBlock(subContainer, b));
  }

  updateContainerHeight(subContainer);

  if(!opts.x) setTimeout(()=>titleEl.focus(),50);
  updateMinimap();
  return el;
}

function updateContainerHeight(container){
  let maxBottom = 0;
  container.querySelectorAll('.card-sub-block').forEach(b=>{
    const bTop = parseFloat(b.style.top) || 0;
    const bH   = parseFloat(b.style.height) || b.offsetHeight || 80;
    if(bTop + bH > maxBottom) maxBottom = bTop + bH;
  });
  container.style.minHeight = Math.max(60, maxBottom + 10) + 'px';
}

function findFreePosition(container, blockW, blockH){
  const existing = [];
  container.querySelectorAll('.card-sub-block').forEach(b=>{
    existing.push({
      x: parseFloat(b.style.left) || 0,
      y: parseFloat(b.style.top)  || 0,
      w: parseFloat(b.style.width)  || b.offsetWidth  || 120,
      h: parseFloat(b.style.height) || b.offsetHeight || 80
    });
  });

  let tryY = 0;
  for(let attempts=0; attempts<100; attempts++){
    let tryX = 0;
    let overlaps = false;
    for(const e of existing){
      if(tryX < e.x + e.w && tryX + blockW > e.x &&
         tryY < e.y + e.h && tryY + blockH > e.y){
        overlaps = true;
        tryY = snapToGrid(e.y + e.h + CARD_GRID);
        break;
      }
    }
    if(!overlaps) return { x: snapToGrid(tryX), y: snapToGrid(tryY) };
  }
  return { x: 0, y: snapToGrid(tryY) };
}

function addSubBlock(container, opts={}){
  const block=document.createElement('div');
  block.className='card-sub-block';

  const initW = opts.w ?? 260;
  const initH = opts.h ?? 80;
  const snappedW = snapToGrid(initW);
  const snappedH = snapToGrid(initH);

  block.style.width  = snappedW + 'px';
  block.style.height = snappedH + 'px';

  const pos = (opts.bx != null && opts.by != null)
    ? { x: snapToGrid(opts.bx), y: snapToGrid(opts.by) }
    : findFreePosition(container, snappedW, snappedH);

  block.style.left = pos.x + 'px';
  block.style.top  = pos.y + 'px';

  /* Sub-block header */
  const bHeader=document.createElement('div');
  bHeader.className='card-sub-header';

  const dragHandle=document.createElement('div');
  dragHandle.className='card-sub-drag-handle';
  dragHandle.textContent='⠿';
  dragHandle.title='드래그하여 위치 이동';

  const bTitle=document.createElement('div');
  bTitle.className='card-sub-title';
  bTitle.contentEditable=true;
  bTitle.spellcheck=false;
  bTitle.textContent=opts.title??'블록';
  bTitle.addEventListener('mousedown',e=>e.stopPropagation());
  bTitle.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});

  const bActions=document.createElement('div');
  bActions.className='card-sub-actions';

  /* Direction toggle */
  const dirBtn=document.createElement('button');
  dirBtn.className='card-sub-btn';
  dirBtn.textContent = opts.dir==='horizontal' ? '↔' : '↕';
  dirBtn.title='방향 전환';
  block.dataset.dir = opts.dir || 'vertical';
  onTap(dirBtn, ()=>{
    const cur = block.dataset.dir;
    block.dataset.dir = cur==='vertical' ? 'horizontal' : 'vertical';
    dirBtn.textContent = block.dataset.dir==='horizontal' ? '↔' : '↕';
  });

  const delBtn=document.createElement('button');
  delBtn.className='card-sub-btn card-sub-btn-del';
  delBtn.textContent='✕';
  onTap(delBtn, ()=>{
    block.remove();
    updateContainerHeight(container);
  });

  bActions.appendChild(dirBtn);
  bActions.appendChild(delBtn);
  bHeader.appendChild(dragHandle);
  bHeader.appendChild(bTitle);
  bHeader.appendChild(bActions);

  /* Sub-block content */
  const bContent=document.createElement('div');
  bContent.className='card-sub-content';
  bContent.contentEditable=true;
  bContent.spellcheck=false;
  bContent.textContent=opts.text??'';
  bContent.setAttribute('data-placeholder','블록 내용...');
  bContent.addEventListener('mousedown',e=>e.stopPropagation());
  bContent.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});

  block.appendChild(bHeader);
  block.appendChild(bContent);

  /* Resize handle */
  const resizeH=document.createElement('div');
  resizeH.className='card-sub-resize-handle';
  block.appendChild(resizeH);

  /* ── Sub-block RESIZE logic ── */
  let subResizing=null;
  function onSubResizeStart(cx,cy){
    subResizing={startX:cx, startY:cy, startW:block.offsetWidth, startH:block.offsetHeight};
    document.addEventListener('mousemove', onSubResizeMove);
    document.addEventListener('mouseup', onSubResizeEnd);
    document.addEventListener('touchmove', onSubResizeTouchMove, {passive:false});
    document.addEventListener('touchend', onSubResizeEnd);
    block.classList.add('card-sub-resizing');
  }
  function onSubResizeMove(e){
    if(!subResizing) return;
    const dx=e.clientX-subResizing.startX, dy=e.clientY-subResizing.startY;
    block.style.width  = snapToGrid(Math.max(CARD_GRID*3, subResizing.startW + dx/T.s))+'px';
    block.style.height = snapToGrid(Math.max(CARD_GRID*2, subResizing.startH + dy/T.s))+'px';
    updateContainerHeight(container);
  }
  function onSubResizeTouchMove(e){
    if(!subResizing || e.touches.length!==1) return;
    e.preventDefault();
    const t=e.touches[0];
    const dx=t.clientX-subResizing.startX, dy=t.clientY-subResizing.startY;
    block.style.width  = snapToGrid(Math.max(CARD_GRID*3, subResizing.startW + dx/T.s))+'px';
    block.style.height = snapToGrid(Math.max(CARD_GRID*2, subResizing.startH + dy/T.s))+'px';
    updateContainerHeight(container);
  }
  function onSubResizeEnd(){
    subResizing=null;
    block.classList.remove('card-sub-resizing');
    document.removeEventListener('mousemove', onSubResizeMove);
    document.removeEventListener('mouseup', onSubResizeEnd);
    document.removeEventListener('touchmove', onSubResizeTouchMove);
    document.removeEventListener('touchend', onSubResizeEnd);
    updateContainerHeight(container);
  }
  resizeH.addEventListener('mousedown',e=>{
    e.stopPropagation(); e.preventDefault();
    onSubResizeStart(e.clientX, e.clientY);
  });
  resizeH.addEventListener('touchstart',e=>{
    if(e.touches.length!==1) return;
    e.stopPropagation(); e.preventDefault();
    onSubResizeStart(e.touches[0].clientX, e.touches[0].clientY);
  },{passive:false});

  /* ── Sub-block FREE-POSITION DRAG logic ── */
  function onDragStart(cx, cy){
    const blockRect = block.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const ph = document.createElement('div');
    ph.className = 'card-sub-placeholder';
    ph.style.left   = block.style.left;
    ph.style.top    = block.style.top;
    ph.style.width  = block.offsetWidth + 'px';
    ph.style.height = block.offsetHeight + 'px';
    container.appendChild(ph);

    block.classList.add('card-sub-dragging');
    block.style.position = 'fixed';
    block.style.left   = blockRect.left + 'px';
    block.style.top    = blockRect.top + 'px';
    block.style.width  = blockRect.width + 'px';
    block.style.height = blockRect.height + 'px';
    block.style.zIndex = '99999';
    document.body.appendChild(block);

    subDrag = {
      block, container, placeholder: ph,
      offsetX: cx - blockRect.left,
      offsetY: cy - blockRect.top,
      containerRect: containerRect,
      blockW: blockRect.width,
      blockH: blockRect.height,
      origW: blockRect.width / T.s,
      origH: blockRect.height / T.s
    };

    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchmove', onDragTouchMove, {passive:false});
    document.addEventListener('touchend', onDragTouchEnd);
  }

  function onDragMove(e){
    if(!subDrag) return;
    moveDraggedBlock(e.clientX, e.clientY);
  }
  function onDragTouchMove(e){
    if(!subDrag || e.touches.length!==1) return;
    e.preventDefault();
    moveDraggedBlock(e.touches[0].clientX, e.touches[0].clientY);
  }

  function moveDraggedBlock(cx, cy){
    const d = subDrag;

    d.block.style.left = (cx - d.offsetX) + 'px';
    d.block.style.top  = (cy - d.offsetY) + 'px';

    const freshContainerRect = d.container.getBoundingClientRect();
    const localX = (cx - d.offsetX - freshContainerRect.left) / T.s;
    const localY = (cy - d.offsetY - freshContainerRect.top) / T.s;

    const snappedX = snapToGrid(Math.max(0, localX));
    const snappedY = snapToGrid(Math.max(0, localY));

    d.placeholder.style.left   = snappedX + 'px';
    d.placeholder.style.top    = snappedY + 'px';
    d.placeholder.style.width  = snapToGrid(d.origW) + 'px';
    d.placeholder.style.height = snapToGrid(d.origH) + 'px';
  }

  function finishDrag(){
    if(!subDrag) return;
    const d = subDrag;

    const finalX = parseFloat(d.placeholder.style.left) || 0;
    const finalY = parseFloat(d.placeholder.style.top)  || 0;
    const finalW = snapToGrid(d.origW);
    const finalH = snapToGrid(d.origH);

    d.block.classList.remove('card-sub-dragging');
    d.block.style.position = 'absolute';
    d.block.style.left   = finalX + 'px';
    d.block.style.top    = finalY + 'px';
    d.block.style.width  = finalW + 'px';
    d.block.style.height = finalH + 'px';
    d.block.style.zIndex = '';

    d.container.appendChild(d.block);
    d.placeholder.remove();

    updateContainerHeight(d.container);
    subDrag = null;
  }

  function onDragEnd(){
    finishDrag();
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchmove', onDragTouchMove);
    document.removeEventListener('touchend', onDragTouchEnd);
  }
  function onDragTouchEnd(){
    finishDrag();
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
    document.removeEventListener('touchmove', onDragTouchMove);
    document.removeEventListener('touchend', onDragTouchEnd);
  }

  dragHandle.addEventListener('mousedown', e=>{
    e.stopPropagation(); e.preventDefault();
    onDragStart(e.clientX, e.clientY);
  });
  dragHandle.addEventListener('touchstart', e=>{
    if(e.touches.length!==1) return;
    e.stopPropagation(); e.preventDefault();
    onDragStart(e.touches[0].clientX, e.touches[0].clientY);
  },{passive:false});

  container.appendChild(block);
  updateContainerHeight(container);
  return block;
}


/* ════════════════════════════════════════════════════════
   STARTUP WINDOWS
════════════════════════════════════════════════════════ */
const RECENT_KEY='infinity_canvas_recent_v1';
let startupDragging=null;

function bindWindowContentGuards(root){
  root.addEventListener('mousedown',e=>e.stopPropagation());
  root.addEventListener('click',e=>e.stopPropagation());
  root.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});
}
function beginStartupDrag(el,cx,cy){
  const bp=s2b(cx,cy);
  startupDragging={el,ox:bp.x-parseFloat(el.style.left),oy:bp.y-parseFloat(el.style.top)};
  el.style.zIndex=++zTop;
}
window.addEventListener('mousemove',e=>{
  if(!startupDragging) return;
  const bp=s2b(e.clientX,e.clientY);
  startupDragging.el.style.left=(bp.x-startupDragging.ox)+'px';
  startupDragging.el.style.top=(bp.y-startupDragging.oy)+'px';
});
window.addEventListener('mouseup',()=>{ startupDragging=null; });
window.addEventListener('touchmove',e=>{
  if(!startupDragging || e.touches.length!==1) return;
  const bp=s2b(e.touches[0].clientX,e.touches[0].clientY);
  startupDragging.el.style.left=(bp.x-startupDragging.ox)+'px';
  startupDragging.el.style.top=(bp.y-startupDragging.oy)+'px';
  e.preventDefault();
},{passive:false});
window.addEventListener('touchend',()=>{ startupDragging=null; });

function addStartupWindow(opts={}){
  const r=getVpRect();
  const c=s2b(r.left+vp.offsetWidth/2,r.top+vp.offsetHeight/2);
  const x=opts.x??c.x-120, y=opts.y??c.y-90;
  const el=document.createElement('div');
  el.className='start-window';
  el.dataset.winRole='startup';
  el.dataset.winType=opts.type||'panel';
  el.style.cssText=`left:${x}px;top:${y}px;width:${opts.w??280}px;height:${opts.h??220}px;z-index:${++zTop};`;

  const body=document.createElement('div');
  body.className='start-window-body';
  const head=document.createElement('div');
  head.className='start-window-header';

  const titleDiv=document.createElement('div');
  titleDiv.className='start-window-title';
  titleDiv.textContent=opts.title??'창';

  const closeBtn=document.createElement('button');
  closeBtn.type='button';
  closeBtn.className='start-window-close';
  closeBtn.textContent='✕';
  onTap(closeBtn, ()=> el.remove());

  head.appendChild(titleDiv);
  head.appendChild(closeBtn);

  const content=document.createElement('div');
  content.className='start-window-content';
  bindWindowContentGuards(content);

  head.addEventListener('mousedown',e=>{ if(e.button!==0) return; e.preventDefault(); e.stopPropagation(); beginStartupDrag(el,e.clientX,e.clientY); });
  head.addEventListener('touchstart',e=>{
    // Don't capture if tapping the close button
    if(e.target.closest('.start-window-close')) return;
    if(e.touches.length!==1) return;
    e.preventDefault(); e.stopPropagation();
    beginStartupDrag(el,e.touches[0].clientX,e.touches[0].clientY);
  },{passive:false});

  body.appendChild(head);
  body.appendChild(content);
  el.appendChild(body);
  board.appendChild(el);
  if(typeof opts.render==='function') opts.render(content,el);
  return el;
}

function loadRecentBoards(){
  try{
    const items=JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');
    return Array.isArray(items)?items:[];
  }catch(e){ return []; }
}
function saveRecentBoards(list){
  const trimmed=[...list].slice(0,8);
  try{ localStorage.setItem(RECENT_KEY, JSON.stringify(trimmed)); return true; }catch(e){}
  while(trimmed.length){
    trimmed.pop();
    try{ localStorage.setItem(RECENT_KEY, JSON.stringify(trimmed)); return true; }catch(e){}
  }
  return false;
}
function formatRecentStamp(iso){
  try{
    return new Date(iso).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  }catch(e){ return ''; }
}
function escapeHtml(s=''){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}
function rememberRecentBoard(data,label,origin='saved'){
  const items=loadRecentBoards().filter(item=>item && item.label!==label);
  items.unshift({
    id:'r'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    label, origin, savedAt:new Date().toISOString(), data
  });
  saveRecentBoards(items);
  renderRecentBoards();
}
function removeRecentBoard(id){
  saveRecentBoards(loadRecentBoards().filter(item=>item.id!==id));
  renderRecentBoards();
}
function openRecentBoard(id){
  const item=loadRecentBoards().find(x=>x.id===id);
  if(!item) return;
  restoreBoard(item.data);
  showSnack(`📂 최근 보드 열기: ${item.label}`);
}
function renderRecentBoards(){
  const listEl=document.getElementById('recent-board-list');
  if(!listEl) return;
  const items=loadRecentBoards();
  if(!items.length){
    listEl.innerHTML='<div class="recent-empty">아직 최근 보드가 없습니다.<br>저장하거나 불러온 보드가 이곳에 표시됩니다.</div>';
    return;
  }
  listEl.innerHTML='';
  items.forEach(item=>{
    const row=document.createElement('div');
    row.className='recent-item';

    const main=document.createElement('div');
    main.className='recent-main';
    main.innerHTML=`
      <div class="recent-name">${escapeHtml(item.label||'최근 보드')}</div>
      <div class="recent-meta">${escapeHtml(formatRecentStamp(item.savedAt))}</div>`;

    const actions=document.createElement('div');
    actions.className='recent-actions';

    const openBtn=document.createElement('button');
    openBtn.type='button';
    openBtn.className='launch-btn small primary';
    openBtn.textContent='열기';
    onTap(openBtn, ()=>openRecentBoard(item.id));

    const delBtnR=document.createElement('button');
    delBtnR.type='button';
    delBtnR.className='launch-btn small ghost';
    delBtnR.textContent='삭제';
    onTap(delBtnR, ()=>removeRecentBoard(item.id));

    actions.appendChild(openBtn);
    actions.appendChild(delBtnR);
    row.appendChild(main);
    row.appendChild(actions);
    listEl.appendChild(row);
  });
}
function clearStartupWindows(){
  board.querySelectorAll('.start-window[data-win-role="startup"]').forEach(el=>el.remove());
}
function ensureStartupWindows(){
  clearStartupWindows();
  createLauncherWindow();
  createRecentBoardsWindow();
  createShortcutsWindow();
}
function hasBoardContent(){
  return strokes.length>0 || board.querySelectorAll('.el').length>0;
}
function createFreshBoard(){
  if(hasBoardContent() && !confirm('새 캔버스를 시작할까요? 현재 보드 내용은 화면에서 지워집니다.')) return;
  clearBoardContents();
  clearStartupWindows();
  resetView();
  showSnack('🆕 새 캔버스를 시작했습니다');
}
function createLauncherWindow(){
  return addStartupWindow({
    type:'launcher', title:'시작 패널', x:-240, y:-118, w:290, h:214,
    render(content){
      const note=document.createElement('div');
      note.className='start-window-note';
      note.textContent='새 보드를 시작하거나 저장한 캔버스 JSON 파일을 바로 불러올 수 있습니다.';

      const actionsDiv=document.createElement('div');
      actionsDiv.className='start-window-actions';

      const newBtn=document.createElement('button');
      newBtn.type='button';
      newBtn.className='launch-btn primary';
      newBtn.textContent='새 캔버스';
      onTap(newBtn, createFreshBoard);

      const loadBtn=document.createElement('button');
      loadBtn.type='button';
      loadBtn.className='launch-btn';
      loadBtn.textContent='캔버스 불러오기';
      onTap(loadBtn, ()=>document.getElementById('load-in').click());

      actionsDiv.appendChild(newBtn);
      actionsDiv.appendChild(loadBtn);

      const meta=document.createElement('div');
      meta.className='recent-meta';
      meta.textContent='창 상단을 드래그하면 이동되고, ✕ 버튼으로 닫을 수 있습니다.';

      content.appendChild(note);
      content.appendChild(actionsDiv);
      content.appendChild(meta);
    }
  });
}
function createRecentBoardsWindow(){
  return addStartupWindow({
    type:'recent', title:'최근 보드', x:72, y:-118, w:320, h:270,
    render(content){
      const note=document.createElement('div');
      note.className='start-window-note';
      note.textContent='이 브라우저에서 저장하거나 불러온 최근 보드가 여기에 표시됩니다.';

      const toolbar=document.createElement('div');
      toolbar.className='recent-toolbar';

      const saveBtn=document.createElement('button');
      saveBtn.type='button';
      saveBtn.className='launch-btn small';
      saveBtn.textContent='현재 캔버스 저장';
      onTap(saveBtn, saveBoard);

      toolbar.appendChild(saveBtn);

      const list=document.createElement('div');
      list.className='recent-list';
      list.id='recent-board-list';

      content.appendChild(note);
      content.appendChild(toolbar);
      content.appendChild(list);

      renderRecentBoards();
    }
  });
}
function createShortcutsWindow(){
  return addStartupWindow({
    type:'shortcuts', title:'단축키 요약', x:418, y:-118, w:292, h:304,
    render(content){
      const rows=[
        ['V','선택 도구'],['H','화면 이동'],['P','펜'],['L','형광펜'],['E','지우개'],
        ['S','포스트잇 추가'],['W','카드 창 추가'],['T','텍스트'],['R','사각형'],['C','원'],['A','화살표'],
        ['G','그리드 토글'],['Esc','선택 해제'],['Del','선택 삭제'],['Ctrl+S','저장'],['Ctrl+D','복제']
      ];
      const note=document.createElement('div');
      note.className='start-window-note';
      note.textContent='자주 쓰는 키를 빠르게 확인할 수 있는 요약 창입니다.';

      const list=document.createElement('div');
      list.className='shortcut-list';
      list.innerHTML=rows.map(([key,desc])=>`<div class="shortcut-row"><div class="shortcut-key">${key}</div><div class="shortcut-desc">${desc}</div></div>`).join('');

      content.appendChild(note);
      content.appendChild(list);
    }
  });
}

/* ════════════════════════════════════════════════════════
   TEXT
════════════════════════════════════════════════════════ */
function addText(bp,opts={}){
  const x=opts.x??bp.x, y=opts.y??bp.y;
  const el=makeEl(x,y,opts.w??200,opts.h??50);
  el.dataset.kind='text';
  const body=document.createElement('div');
  body.className='el-body text-body';
  body.contentEditable=true; body.spellcheck=false;
  body.style.color=opts.color??color;
  body.style.fontSize=(opts.fontSize??Math.max(12,Math.round(22/T.s)))+'px';
  body.textContent=opts.text??'';
  body.addEventListener('mousedown',e=>e.stopPropagation());
  body.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});
  body.addEventListener('blur',()=>{ if(!body.textContent.trim()&&!opts.text){el.remove();return;} updateMinimap(); });
  el.appendChild(body);
  addHandles(el); attachSelectClick(el);
  board.appendChild(el);
  setTimeout(()=>{ body.focus(); placeCursorAtEnd(body); setTool('select'); },50);
  updateMinimap(); return el;
}
function placeCursorAtEnd(el){
  const r=document.createRange(); r.selectNodeContents(el); r.collapse(false);
  const s=window.getSelection(); s.removeAllRanges(); s.addRange(r);
}

/* ════════════════════════════════════════════════════════
   IMAGE
════════════════════════════════════════════════════════ */
function addImage(src,opts={}){
  const r=getVpRect();
  const c=s2b(r.left+vp.offsetWidth/2,r.top+vp.offsetHeight/2);
  const el=makeEl(opts.x??c.x-150, opts.y??c.y-100, opts.w??320, opts.h??240);
  el.dataset.kind='image';
  const img=document.createElement('img');
  img.className='el-body image-body'; img.src=src;
  el.appendChild(img);
  addHandles(el); attachSelectClick(el);
  board.appendChild(el); updateMinimap(); return el;
}
function handleImg(evt){
  const f=evt.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=e=>{ addImage(e.target.result); showSnack('이미지 추가됨'); };
  r.readAsDataURL(f); evt.target.value='';
}

/* ════════════════════════════════════════════════════════
   DUPLICATE
════════════════════════════════════════════════════════ */
function duplicateEl(el){
  const kind=el.dataset.kind;
  const x=parseFloat(el.style.left)+20, y=parseFloat(el.style.top)+20;
  const w=parseFloat(el.style.width), h=parseFloat(el.style.height);
  if(kind==='sticky'){ addSticky({x,y,w,h,bg:el.querySelector('.sticky-body').style.background,text:el.querySelector('textarea').value}); }
  else if(kind==='text'){ const b=el.querySelector('.text-body'); addText({},{x,y,w,h,text:b.textContent,color:b.style.color,fontSize:parseFloat(b.style.fontSize)}); }
  else if(kind==='image'){ addImage(el.querySelector('img').src,{x,y,w,h}); }
  else if(kind==='card'){ duplicateCard(el,x,y,w,h); }
  updateMinimap();
}

function duplicateCard(el,x,y,w,h){
  const title=el.querySelector('.card-title')?.textContent??'';
  const text=el.querySelector('.card-content')?.textContent??'';
  const blocks=[];
  el.querySelectorAll('.card-sub-block').forEach(b=>{
    blocks.push({
      title:b.querySelector('.card-sub-title')?.textContent??'',
      text:b.querySelector('.card-sub-content')?.textContent??'',
      w:b.offsetWidth, h:b.offsetHeight,
      bx:parseFloat(b.style.left)||0,
      by:parseFloat(b.style.top)||0,
      dir:b.dataset.dir||'vertical'
    });
  });
  addCardWindow({x,y,w,h,title,text,blocks});
}

/* ════════════════════════════════════════════════════════
   KEYBOARD
════════════════════════════════════════════════════════ */
document.addEventListener('keydown',e=>{
  const ae=document.activeElement;
  if(ae?.tagName==='TEXTAREA'||ae?.isContentEditable) return;
  const map={v:'select',h:'pan',p:'pen',l:'highlight',e:'eraser',r:'rect',c:'circle',a:'arrow',t:'text'};
  if(map[e.key]){ setTool(map[e.key]); return; }
  if(e.key==='s'&&!e.ctrlKey&&!e.metaKey){ addSticky(); return; }
  if(e.key==='w'&&!e.ctrlKey&&!e.metaKey){ addCardWindow(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){ e.preventDefault(); saveBoard(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key==='d'){ e.preventDefault(); (selectedEls.length?[...selectedEls]:(selected?[selected]:[])).forEach(duplicateEl); return; }
  if(e.key==='Delete'||e.key==='Backspace'){ (selectedEls.length?[...selectedEls]:(selected?[selected]:[])).forEach(el=>el.remove()); selectedEls=[]; selected=null; updateMinimap(); return; }
  if((e.ctrlKey||e.metaKey)&&e.key==='a'){ e.preventDefault(); deselectAll(); board.querySelectorAll('.el').forEach(el=>select(el,true)); return; }
  if(e.key==='Escape'){ deselectAll(); closePenPanel(); return; }
  if(e.key==='='||e.key==='+'){ T.s=Math.min(8,T.s*1.1); applyT(); }
  if(e.key==='-'){ T.s=Math.max(0.08,T.s*0.9); applyT(); }
  if(e.key==='0') resetView();
  if(e.key==='g') toggleGrid();
});

/* ════════════════════════════════════════════════════════
   MINIMAP
════════════════════════════════════════════════════════ */
function updateMinimap(){
  if(isMobile()) return;
  mmCtx.clearRect(0,0,130,84);
  mmCtx.fillStyle='#e8e4dc'; mmCtx.fillRect(0,0,130,84);
  const W=6000,H=6000,ox=W/2,oy=H/2,sx=130/W,sy=84/H;
  board.querySelectorAll('.el').forEach(el=>{
    const x=parseFloat(el.style.left)||0, y=parseFloat(el.style.top)||0;
    const w=parseFloat(el.style.width)||60, h=parseFloat(el.style.height)||40;
    const k=el.dataset.kind;
    mmCtx.fillStyle=k==='sticky'?'#f0e040':k==='image'?'#aac4ee':k==='card'?'#d4b896':'#b0c4b0';
    mmCtx.fillRect((x+ox)*sx,(y+oy)*sy,w*sx,h*sy);
  });
  const vpW=vp.offsetWidth/T.s, vpH=vp.offsetHeight/T.s;
  const vpX=-T.x/T.s, vpY=-T.y/T.s;
  mmCtx.strokeStyle='#c84b2f'; mmCtx.lineWidth=1.5;
  mmCtx.strokeRect((vpX+ox)*sx,(vpY+oy)*sy,vpW*sx,vpH*sy);
}

/* ════════════════════════════════════════════════════════
   PASTE
════════════════════════════════════════════════════════ */
document.addEventListener('paste',e=>{
  const items=e.clipboardData?.items; if(!items) return;
  for(const item of items){
    if(item.type.startsWith('image/')){
      const r=new FileReader();
      r.onload=ev=>{ addImage(ev.target.result); showSnack('이미지 붙여넣기 완료'); };
      r.readAsDataURL(item.getAsFile());
    }
  }
});

/* ════════════════════════════════════════════════════════
   SAVE / LOAD
════════════════════════════════════════════════════════ */
function getStrokeAttrs(s){
  const a={};
  const keys=['d','stroke','stroke-opacity','stroke-width','fill','fill-opacity','x','y','width','height','cx','cy','rx','ry','x1','y1','x2','y2','stroke-linecap','stroke-linejoin'];
  if(s.svgEl && s.svgEl.getAttribute) keys.forEach(k=>{const v=s.svgEl.getAttribute(k);if(v!=null)a[k]=v;});
  if(s.kind==='arrow' && s.svgEl){
    const ln=s.svgEl.querySelector('line'), pt=s.svgEl.querySelector('path');
    if(ln){a.x1=ln.getAttribute('x1');a.y1=ln.getAttribute('y1');a.x2=ln.getAttribute('x2');a.y2=ln.getAttribute('y2');a.stroke=ln.getAttribute('stroke');a['stroke-width']=ln.getAttribute('stroke-width');}
    if(pt) a.d=pt.getAttribute('d');
  }
  return a;
}
function getBoardData(){
  const data={version:4,transform:T,strokes:strokes.map(s=>({kind:s.kind,attrs:getStrokeAttrs(s)})),elements:[]};
  board.querySelectorAll('.el').forEach(el=>{
    const kind=el.dataset.kind;
    const rec={kind,x:parseFloat(el.style.left),y:parseFloat(el.style.top),w:parseFloat(el.style.width),h:parseFloat(el.style.height),z:parseInt(el.style.zIndex)||10};
    if(kind==='sticky'){rec.bg=el.querySelector('.sticky-body').style.background;rec.text=el.querySelector('textarea').value;}
    else if(kind==='text'){const b=el.querySelector('.text-body');rec.text=b.textContent;rec.color=b.style.color;rec.fontSize=parseFloat(b.style.fontSize);}
    else if(kind==='image') rec.src=el.querySelector('img').src;
    else if(kind==='card'){
      rec.title=el.querySelector('.card-title')?.textContent??'';
      rec.text=el.querySelector('.card-content')?.textContent??'';
      rec.blocks=[];
      el.querySelectorAll('.card-sub-block').forEach(b=>{
        rec.blocks.push({
          title:b.querySelector('.card-sub-title')?.textContent??'',
          text:b.querySelector('.card-sub-content')?.textContent??'',
          w:b.offsetWidth, h:b.offsetHeight,
          bx:parseFloat(b.style.left)||0,
          by:parseFloat(b.style.top)||0,
          dir:b.dataset.dir||'vertical'
        });
      });
    }
    data.elements.push(rec);
  });
  return data;
}
function saveBoard(){
  const data=getBoardData();
  const fileName='canvas-'+new Date().toISOString().slice(0,10)+'.json';
  rememberRecentBoard(data, '저장 · '+fileName, 'saved');
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
  showSnack('💾 저장 완료!');
}
function loadBoard(evt){
  const f=evt.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      restoreBoard(data);
      rememberRecentBoard(data, '불러오기 · '+(f.name||'로컬 파일'), 'loaded');
      showSnack('📂 불러오기 완료!');
    }catch(err){
      showSnack('❌ 파일을 읽을 수 없습니다');
    }
  };
  r.readAsText(f); evt.target.value='';
}
function clearBoardContents(){
  board.querySelectorAll('.el').forEach(e=>e.remove());
  strokes.forEach(s=>{try{if(s.svgEl && s.svgEl.parentNode) svgl.removeChild(s.svgEl);}catch(e){}});
  strokes=[]; selected=null; selectedEls=[]; dragging=null; resizing=null;
  pCtx.clearRect(0,0,pCvs.width,pCvs.height);
  updateMinimap();
}
function restoreBoard(data){
  clearBoardContents();
  // Also remove startup windows
  clearStartupWindows();
  if(data.transform){T={...data.transform};applyT();}
  else { applyT(); }
  (data.strokes||[]).forEach(s=>{
    const{kind,attrs}=s;
    if(kind==='path' || kind==='taper-path'){ const el=mkSvg('path'); setAttrs(el,attrs); svgl.appendChild(el); strokes.push({kind,attrs,svgEl:el}); }
    else if(kind==='rect'){ const el=mkSvg('rect'); setAttrs(el,attrs); svgl.appendChild(el); strokes.push({kind,attrs,svgEl:el}); }
    else if(kind==='ellipse'){ const el=mkSvg('ellipse'); setAttrs(el,attrs); svgl.appendChild(el); strokes.push({kind,attrs,svgEl:el}); }
    else if(kind==='arrow'){
      const g=mkSvg('g'),ln=mkSvg('line'); setAttrs(ln,{x1:attrs.x1,y1:attrs.y1,x2:attrs.x2,y2:attrs.y2,stroke:attrs.stroke,'stroke-width':attrs['stroke-width'],'stroke-linecap':'round'});
      const pt=mkSvg('path'); setAttrs(pt,{d:attrs.d,stroke:attrs.stroke,'stroke-width':attrs['stroke-width'],'stroke-linecap':'round',fill:'none'});
      g.appendChild(ln); g.appendChild(pt); svgl.appendChild(g); strokes.push({kind,attrs,svgEl:g});
    }
  });
  (data.elements||[]).forEach(d=>{
    let el;
    if(d.kind==='sticky') el=addSticky({x:d.x,y:d.y,w:d.w,h:d.h,bg:d.bg,text:d.text});
    else if(d.kind==='text') el=addText({},{x:d.x,y:d.y,w:d.w,h:d.h,text:d.text,color:d.color,fontSize:d.fontSize});
    else if(d.kind==='image') el=addImage(d.src,{x:d.x,y:d.y,w:d.w,h:d.h});
    else if(d.kind==='card') el=addCardWindow({x:d.x,y:d.y,w:d.w,h:d.h,title:d.title,text:d.text,blocks:d.blocks});
    if(el&&d.z) el.style.zIndex=d.z;
  });
  updateMinimap();
}

/* ════════════════════════════════════════════════════════
   SNACK
════════════════════════════════════════════════════════ */
let snackT;
function showSnack(msg){
  const s=document.getElementById('snack');
  s.textContent=msg; s.classList.add('show');
  clearTimeout(snackT); snackT=setTimeout(()=>s.classList.remove('show'),2200);
}

/* ════════════════════════════════════════════════════════
   CLEAR
════════════════════════════════════════════════════════ */
function clearAll(){
  if(!confirm('모든 내용을 삭제할까요?')) return;
  clearBoardContents();
  ensureStartupWindows();
  showSnack('보드 초기화 완료');
}

/* ════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════ */
syncLayout();
applyT();
ensureStartupWindows();
showSnack('∞ Canvas 준비 완료 ✦');
