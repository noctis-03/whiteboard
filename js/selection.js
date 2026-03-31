// ═══════════════════════════════════════════════════
//  selection.js — 선택, 올가미, 드래그, 리사이즈
// ═══════════════════════════════════════════════════

import * as S from './state.js';
import { b2s, s2b } from './transform.js';
import { updateMinimap } from './layout.js';

export function select(el, additive = false) {
  if (!additive) deselectAll();
  if (S.selectedEls.includes(el)) return;
  S.pushSelectedEl(el);
  S.setSelected(el);
  el.classList.add('selected');
  const handles = el.querySelector('.el-handles');
  if (handles) handles.style.display = 'block';
}

export function deselectAll() {
  S.selectedEls.forEach(el => {
    el.classList.remove('selected');
    const handles = el.querySelector('.el-handles');
    if (handles) handles.style.display = 'none';
  });
  S.setSelectedEls([]);
  S.setSelected(null);
}

export function showSelRect(l) {
  const x = Math.min(l.x0, l.x1), y = Math.min(l.y0, l.y1);
  const w = Math.abs(l.x1 - l.x0), h = Math.abs(l.y1 - l.y0);
  S.selRect.style.cssText = `display:block;left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
}

export function hideSelRect() { S.selRect.style.display = 'none'; }

export function highlightLasso(l) {
  const sx = Math.min(l.x0, l.x1), sy = Math.min(l.y0, l.y1);
  const ex = Math.max(l.x0, l.x1), ey = Math.max(l.y0, l.y1);
  S.board.querySelectorAll('.el').forEach(el => {
    const bx = parseFloat(el.style.left), by = parseFloat(el.style.top);
    const bw = parseFloat(el.style.width), bh = parseFloat(el.style.height);
    const s2 = b2s(bx, by), se = b2s(bx + bw, by + bh);
    el.classList.toggle('lasso-hover', se.x > sx && s2.x < ex && se.y > sy && s2.y < ey);
  });
}

export function finalizeLasso(l) {
  const sx = Math.min(l.x0, l.x1), sy = Math.min(l.y0, l.y1);
  const ex = Math.max(l.x0, l.x1), ey = Math.max(l.y0, l.y1);
  deselectAll();
  if (ex - sx < 5 && ey - sy < 5) return;
  S.board.querySelectorAll('.el').forEach(el => {
    el.classList.remove('lasso-hover');
    const bx = parseFloat(el.style.left), by = parseFloat(el.style.top);
    const bw = parseFloat(el.style.width), bh = parseFloat(el.style.height);
    const s2 = b2s(bx, by), se = b2s(bx + bw, by + bh);
    if (se.x > sx && s2.x < ex && se.y > sy && s2.y < ey) select(el, true);
  });
}

export function clearLassoHover() {
  S.board.querySelectorAll('.lasso-hover').forEach(el => el.classList.remove('lasso-hover'));
}

export function doResize(cx, cy) {
  const r = S.resizing;
  if (!r) return;
  const { el, dir, r0, m0 } = r;
  const curB = s2b(cx, cy);
  const dx = curB.x - m0.x, dy = curB.y - m0.y;
  let { x, y, w, h } = r0;
  const MW = 60, MH = 40;
  if (dir.includes('e')) { w = Math.max(MW, r0.w + dx); }
  if (dir.includes('s')) { h = Math.max(MH, r0.h + dy); }
  if (dir.includes('w')) { const nw = Math.max(MW, r0.w - dx); x = r0.x + r0.w - nw; w = nw; }
  if (dir.includes('n')) { const nh = Math.max(MH, r0.h - dy); y = r0.y + r0.h - nh; h = nh; }
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.style.width = w + 'px'; el.style.height = h + 'px';
}
