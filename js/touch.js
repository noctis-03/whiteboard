// ═══════════════════════════════════════════════════
//  touch.js — 터치 이벤트 (1-finger, 핀치줌)
//
//  ★ 변경: 화면 탭 → 도구 활성화 + 즉시 사용
//  · touchstart 시점에 도구를 활성화하고 도구 동작 시작
//  · touchmove에서 이동 거리가 작으면 도구 사용, 크면 취소 → pan
//  · 또는: 짧은 터치(탭) 후 다음 터치에서 도구 사용
//
//  ★★ 최종 방식:
//  · pendingTool이 있고 toolActivated가 false인 상태에서:
//    - 짧은 탭(TAP) = 도구 활성화 (그리기 도구면 다음 터치에서 그리기 시작)
//    - 길게 누르며 이동(DRAG) = pan 이동
//  · toolActivated가 true인 상태에서:
//    - 터치 = 해당 도구로 동작 (그리기, 텍스트 등)
//    - 사용 완료 후 자동 pan 복귀
// ═══════════════════════════════════════════════════

import * as S from ‘./state.js’;
import { applyT, getVpRect, s2b } from ‘./transform.js’;
import { closeCtx, startLongPress, cancelLongPress } from ‘./contextMenu.js’;
import { deselectAll, showSelRect, highlightLasso, finalizeLasso, hideSelRect, clearLassoHover, doResize } from ‘./selection.js’;
import { startDraw, continueDraw, commitFreehandStroke, previewShape, finalizeShape, eraseAt, commitErase } from ‘./drawing.js’;
import { addText } from ‘./text.js’;
import { updateMinimap } from ‘./layout.js’;
import { focusEditableTouch } from ‘./edit.js’;
import { pushState } from ‘./history.js’;
import { orbLock, toolActivated, tryActivateByTap, scheduleRevertAfterUse } from ‘./toolOrb.js’;

/* ── 탭 판정 상수 ── */
const TAP_MOVE_THRESH = 12;
const TAP_TIME_THRESH = 250;

/* ── 탭 판정 상태 ── */
let tapStartX = 0;
let tapStartY = 0;
let tapStartTime = 0;
let tapPending = false;       // 탭 판정 대기 중
let activatedThisTouch = false; // 이번 터치로 활성화했는지

function cancelSingleFingerActions() {
if (S.drawing) {
S.setDrawing(false);
if (S.livePth && S.livePth.parentNode) S.svgl.removeChild(S.livePth);
S.setLivePth(null); S.setDrawPts([]); S.setShapeA(null);
S.pCtx.clearRect(0, 0, S.pCvs.width, S.pCvs.height);
}
if (S.touchLasso) { S.setTouchLasso(null); hideSelRect(); clearLassoHover(); }
if (S.touchPanOrigin) { S.setTouchPanOrigin(null); document.body.classList.remove(‘panning’); }
if (S.dragging) S.setDragging(null);
if (S.resizing) S.setResizing(null);
cancelLongPress();
}

/* ── 도구 동작 시작 (활성화된 도구에 따라) ── */
function startToolAction(touch) {
const bp = s2b(touch.clientX, touch.clientY);

if (S.tool === ‘pen’ || S.tool === ‘highlight’) {
startDraw(bp);
return true;
}
if (S.tool === ‘eraser’) {
S.setDrawing(true);
eraseAt(bp);
return true;
}
if (S.tool === ‘rect’ || S.tool === ‘circle’ || S.tool === ‘arrow’) {
S.setDrawing(true);
S.setShapeA(bp);
return true;
}
if (S.tool === ‘text’) {
addText(bp);
pushState();
return true;
}
if (S.tool === ‘edit’) {
// edit 모드는 별도 처리
return false;
}
if (S.tool === ‘select’) {
return false;
}
return false;
}

export function initTouchEvents() {
S.vp.addEventListener(‘touchstart’, e => {
if (orbLock) { e.preventDefault(); return; }
cancelLongPress();
activatedThisTouch = false;

```
if (e.touches.length === 2) {
  cancelSingleFingerActions();
  const t0 = e.touches[0], t1 = e.touches[1];
  S.setPinchDist(Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY));
  S.setPinchMid({ x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 });
  S.setPinchActive(true);
  e.preventDefault();
  return;
}
if (e.touches.length !== 1) return;
const t = e.touches[0];
closeCtx();

// ★ pendingTool이 있고 아직 활성화되지 않은 상태
//   → 일단 pan으로 시작하되, 탭 판정을 추적
if (S.pendingTool && !toolActivated) {
  tapStartX = t.clientX;
  tapStartY = t.clientY;
  tapStartTime = Date.now();
  tapPending = true;

  // pan 시작 (드래그 시 화면 이동용)
  const r = getVpRect();
  S.setTouchPanOrigin({ x: t.clientX - r.left - S.T.x, y: t.clientY - r.top - S.T.y });
  document.body.classList.add('panning');
  e.preventDefault();
  return;
}

// ★ pendingTool이 있고 이미 활성화된 상태 → 도구 동작 시작
if (S.pendingTool && toolActivated) {
  // tool은 이미 activatePending()으로 실제 도구로 설정되어 있음
  if (S.tool === 'pen' || S.tool === 'highlight') { startDraw(s2b(t.clientX, t.clientY)); e.preventDefault(); return; }
  if (S.tool === 'eraser') { S.setDrawing(true); eraseAt(s2b(t.clientX, t.clientY)); e.preventDefault(); return; }
  if (S.tool === 'rect' || S.tool === 'circle' || S.tool === 'arrow') { S.setDrawing(true); S.setShapeA(s2b(t.clientX, t.clientY)); e.preventDefault(); return; }
  if (S.tool === 'text') { addText(s2b(t.clientX, t.clientY)); pushState(); e.preventDefault(); return; }
  if (S.tool === 'select') {
    if (!e.target.closest('.el')) {
      deselectAll();
      S.setTouchLasso({ x0: t.clientX, y0: t.clientY, x1: t.clientX, y1: t.clientY });
      startLongPress(e.target, t.clientX, t.clientY);
      showSelRect(S.touchLasso);
      e.preventDefault();
    }
    return;
  }
  if (S.tool === 'edit') {
    const elDiv = e.target.closest('.el');
    if (elDiv) focusEditableTouch(elDiv, t);
    else { const active = document.activeElement; if (active && active !== document.body) active.blur(); }
    return;
  }
  e.preventDefault();
  return;
}

// ── 기존 로직: pendingTool 없을 때 (pan, select, edit 도구 선택 등) ──
if (S.tool === 'pan') {
  const r = getVpRect();
  S.setTouchPanOrigin({ x: t.clientX - r.left - S.T.x, y: t.clientY - r.top - S.T.y });
  document.body.classList.add('panning');
  e.preventDefault(); return;
}

if (S.tool === 'edit') {
  // pan 이동 허용
  const r = getVpRect();
  S.setTouchPanOrigin({ x: t.clientX - r.left - S.T.x, y: t.clientY - r.top - S.T.y });
  document.body.classList.add('panning');
  // 탭 판정도 추적 (터치 끝에서 요소 포커스용)
  tapStartX = t.clientX;
  tapStartY = t.clientY;
  tapStartTime = Date.now();
  tapPending = true;
  e.preventDefault(); return;
}

const bp = s2b(t.clientX, t.clientY);
if (S.tool === 'pen' || S.tool === 'highlight') { startDraw(bp); e.preventDefault(); return; }
if (S.tool === 'eraser') { S.setDrawing(true); eraseAt(bp); e.preventDefault(); return; }
if (S.tool === 'rect' || S.tool === 'circle' || S.tool === 'arrow') { S.setDrawing(true); S.setShapeA(bp); e.preventDefault(); return; }
if (S.tool === 'text') { addText(bp); pushState(); e.preventDefault(); return; }

if (S.tool === 'edit') {
  const elDiv = e.target.closest('.el');
  if (elDiv) {
    focusEditableTouch(elDiv, t);
  } else {
    const active = document.activeElement;
    if (active && active !== document.body) active.blur();
  }
  return;
}

if (S.tool === 'select') {
  if (!e.target.closest('.el')) {
    deselectAll();
    S.setTouchLasso({ x0: t.clientX, y0: t.clientY, x1: t.clientX, y1: t.clientY });
    startLongPress(e.target, t.clientX, t.clientY);
    showSelRect(S.touchLasso);
    e.preventDefault();
  }
}
```

}, { passive: false });

window.addEventListener(‘touchmove’, e => {
if (orbLock) { e.preventDefault(); return; }

```
if (e.touches.length === 2 && S.pinchActive) {
  e.preventDefault();
  tapPending = false; // 핀치 시 탭 취소
  const t0 = e.touches[0], t1 = e.touches[1];
  const newDist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
  const newMid = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
  if (S.pinchMid) { S.T.x += newMid.x - S.pinchMid.x; S.T.y += newMid.y - S.pinchMid.y; }
  if (S.pinchDist && S.pinchDist > 0) {
    const ratio = newDist / S.pinchDist;
    const ns = Math.min(8, Math.max(0.08, S.T.s * ratio));
    const r = getVpRect();
    const mx = newMid.x - r.left, my = newMid.y - r.top;
    S.T.x = mx - (mx - S.T.x) * (ns / S.T.s);
    S.T.y = my - (my - S.T.y) * (ns / S.T.s);
    S.T.s = ns;
  }
  S.setPinchDist(newDist); S.setPinchMid(newMid);
  applyT(); return;
}

if (e.touches.length !== 1) return;
cancelLongPress();
const t = e.touches[0];

// ★ 탭 판정 중: 이동 거리 체크
if (tapPending) {
  const dx = t.clientX - tapStartX;
  const dy = t.clientY - tapStartY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > TAP_MOVE_THRESH) {
    // 드래그로 판정 → 탭 취소, pan 이동 계속
    tapPending = false;
  }
  // 탭 판정 중에도 pan 이동은 진행
}

if (S.tool === 'edit' && !S.touchPanOrigin) return;

if (S.touchPanOrigin) {
  const r = getVpRect();
  S.T.x = t.clientX - r.left - S.touchPanOrigin.x;
  S.T.y = t.clientY - r.top - S.touchPanOrigin.y;
  applyT(); e.preventDefault(); return;
}
if (S.dragging) {
  const bp = s2b(t.clientX, t.clientY);
  if (S.dragging.els) { S.dragging.els.forEach(d => { d.el.style.left = (bp.x - d.ox) + 'px'; d.el.style.top = (bp.y - d.oy) + 'px'; }); }
  else { S.dragging.el.style.left = (bp.x - S.dragging.ox) + 'px'; S.dragging.el.style.top = (bp.y - S.dragging.oy) + 'px'; }
  updateMinimap(); e.preventDefault(); return;
}
if (S.resizing) { doResize(t.clientX, t.clientY); updateMinimap(); e.preventDefault(); return; }
if (S.touchLasso) {
  S.touchLasso.x1 = t.clientX; S.touchLasso.y1 = t.clientY;
  showSelRect(S.touchLasso); highlightLasso(S.touchLasso); e.preventDefault(); return;
}
if (!S.drawing) return;
e.preventDefault();
const bp = s2b(t.clientX, t.clientY);
if (S.tool === 'pen' || S.tool === 'highlight') continueDraw(bp);
if (S.tool === 'eraser') eraseAt(bp);
if ((S.tool === 'rect' || S.tool === 'circle' || S.tool === 'arrow') && S.shapeA) previewShape(S.shapeA, bp);
```

}, { passive: false });

window.addEventListener(‘touchend’, e => {
if (orbLock) return;
cancelLongPress();
document.body.classList.remove(‘panning’);

```
if (e.touches.length === 0 && S.pinchActive) { S.setPinchActive(false); S.setPinchDist(null); S.setPinchMid(null); }

// ★ 탭 판정 완료: 짧은 터치 + 이동 적음 = 탭!
if (tapPending) {
  tapPending = false;
  const elapsed = Date.now() - tapStartTime;
  S.setTouchPanOrigin(null); // pan 동작 취소

  if (elapsed < TAP_TIME_THRESH) {
    // edit 도구: 탭으로 요소 포커스 (pendingTool 없이 직접 처리)
    if (S.tool === 'edit' && !S.pendingTool) {
      const lastT = e.changedTouches[0];
      if (lastT) {
        const elDiv = document.elementFromPoint(lastT.clientX, lastT.clientY)?.closest('.el');
        if (elDiv) focusEditableTouch(elDiv, lastT);
        else { const active = document.activeElement; if (active && active !== document.body) active.blur(); }
      }
      return;
    }

    // 탭으로 판정 → 도구 활성화!
    const activated = tryActivateByTap();
    if (activated) {
      activatedThisTouch = true;
      // 도구가 활성화됨. 다음 터치에서 실제 도구 동작 시작.
      // (텍스트 도구 등 탭 한 번으로 동작하는 것은 여기서 바로 실행)
      if (S.tool === 'text' || S.pendingTool === 'text') {
        const lastT = e.changedTouches[0];
        if (lastT) {
          addText(s2b(lastT.clientX, lastT.clientY));
          pushState();
          scheduleRevertAfterUse();
        }
      }
      return;
    }
  }
  // 탭이 아님 (시간 초과) → pan 종료
  return;
}

if (S.touchPanOrigin) { S.setTouchPanOrigin(null); return; }
if (S.dragging) { S.setDragging(null); updateMinimap(); pushState(); return; }
if (S.resizing) { S.setResizing(null); updateMinimap(); pushState(); return; }
if (S.touchLasso) { finalizeLasso(S.touchLasso); S.setTouchLasso(null); hideSelRect(); clearLassoHover(); return; }
if (!S.drawing) return;
S.setDrawing(false);
S.pCtx.clearRect(0, 0, S.pCvs.width, S.pCvs.height);
const lastT = e.changedTouches[0];
if (S.tool === 'pen' || S.tool === 'highlight') commitFreehandStroke();
if (S.tool === 'eraser') commitErase();
if ((S.tool === 'rect' || S.tool === 'circle' || S.tool === 'arrow') && S.shapeA) {
  if (lastT) {
    const bp = s2b(lastT.clientX, lastT.clientY);
    if (Math.abs(bp.x - S.shapeA.x) > 4 || Math.abs(bp.y - S.shapeA.y) > 4) finalizeShape(S.shapeA, bp);
  }
  S.setShapeA(null);
}

// ★ 도구 사용 완료 → pan 복귀 스케줄
scheduleRevertAfterUse();
```

});
}