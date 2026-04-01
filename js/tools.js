// ═══════════════════════════════════════════════════
//  tools.js — 도구, 색상, 선 굵기 전환
//
//  UPDATE: 터치 환경 → 도구 선택 시 pendingTool 예약,
//          실제 tool은 pan 유지
// ═══════════════════════════════════════════════════

import { tool, pendingTool, setToolState, setColorState, setSwState, setPendingTool } from ‘./state.js’;
import { deselectAll } from ‘./selection.js’;
import { closeCtx } from ‘./contextMenu.js’;
import { closePenPanel, togglePenPanel } from ‘./penPanel.js’;
import { showColorBar, hideColorBar, isDrawTool } from ‘./toolbar.js’;
import { notifyToolChanged } from ‘./toolOrb.js’;

/* ── 터치 환경에서도 즉시 활성화할 도구 (pendingTool 불필요) ── */
const DIRECT_TOOLS = new Set([‘pan’, ‘select’, ‘edit’]);

const isTouch = () => ‘ontouchstart’ in window || navigator.maxTouchPoints > 0;

/* ── 내부: state.tool + body data-tool 설정 ── */
function applyInternal(t) {
setToolState(t);
document.body.setAttribute(‘data-tool’, t);
}

/* ── 내부: 툴바 버튼 active 시각 ── */
function applyVisual(t) {
document.querySelectorAll(’.tbtn[id^=“t-”]’).forEach(b => b.classList.remove(‘active’));
const btn = document.getElementById(‘t-’ + t);
if (btn) btn.classList.add(‘active’);
}

/* ══════════════════════════════════════════════════════
setTool — 툴바에서 도구 선택
══════════════════════════════════════════════════════ */
export function setTool(t) {
const prev = tool;

// ★ 터치 환경 & 즉시 활성화 도구가 아닌 경우 → pendingTool에 예약, 실제는 pan
if (isTouch() && !DIRECT_TOOLS.has(t)) {
setPendingTool(t);
applyVisual(t);               // 툴바 UI는 선택한 도구 표시
applyInternal(‘pan’);         // 실제 동작은 pan
notifyToolChanged(t);         // orb에 예약 도구 아이콘
closeCtx();
closePenPanel();
if (isDrawTool(t)) showColorBar(); else hideColorBar();
return;
}

// ── 마우스 환경 또는 pan 직접 선택 ──
setPendingTool(null);
applyInternal(t);
applyVisual(t);
notifyToolChanged(t);

if (t !== ‘select’ && t !== ‘edit’) deselectAll();

if (prev === ‘edit’ && t !== ‘edit’) {
const active = document.activeElement;
if (active && (active.isContentEditable || active.tagName === ‘TEXTAREA’ || active.tagName === ‘INPUT’)) {
active.blur();
}
}

closeCtx();
closePenPanel();
if (isDrawTool(t)) showColorBar(); else hideColorBar();
}

/* ══════════════════════════════════════════════════════
★ activatePending — 예약 도구를 실제 활성화
(화면 탭 시 touch.js에서 호출)
══════════════════════════════════════════════════════ */
export function activatePending() {
if (!pendingTool) return false;
applyInternal(pendingTool);
if (pendingTool !== ‘select’ && pendingTool !== ‘edit’) deselectAll();
closeCtx();
closePenPanel();
if (isDrawTool(pendingTool)) showColorBar(); else hideColorBar();
return true;
}

/* ══════════════════════════════════════════════════════
★ revertToPan — pan으로 되돌리기
(Orb 사라질 때 / 도구 사용 완료 후)
══════════════════════════════════════════════════════ */
export function revertToPan() {
if (!pendingTool) return;
applyInternal(‘pan’);
// 툴바 시각 표시는 pendingTool 그대로 유지 (유저에게 뭘 골랐는지 보여줌)
}

/* ══════════════════════════════════════════════════════ */
export function setToolOrPanel(t) {
if (isTouch() && pendingTool === t) {
togglePenPanel(t);
return;
}
if (tool === t) {
togglePenPanel(t);
} else {
setTool(t);
}
}

export function setColor(el) {
document.querySelectorAll(’#color-bar .cdot’).forEach(d => d.classList.remove(‘active’));
el.classList.add(‘active’);
setColorState(el.dataset.c);
}

export function setStroke(el, v) {
document.querySelectorAll(’#color-bar .sbtn’).forEach(b => b.classList.remove(‘active’));
el.classList.add(‘active’);
setSwState(v);
}