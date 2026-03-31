// ═══════════════════════════════════════════════════
//  sticky.js — 포스트잇 생성
//
//  FIX: 색상 변경이 1회만 작동하던 버그 수정
//  원인: body.style.background는 브라우저가 rgb() 형태로 반환하여
//        STICKY_COLORS의 hex 값과 indexOf 비교 시 항상 -1 반환
//  해결: 별도 인덱스 변수로 현재 색상 추적
// ═══════════════════════════════════════════════════

import * as S from './state.js';
import { s2b } from './transform.js';
import { makeEl, addHandles, attachSelectClick } from './elements.js';
import { onTap } from './utils.js';
import { updateMinimap } from './layout.js';

const STICKY_COLORS = ['#fef3c7', '#fce7f3', '#d1fae5', '#dbeafe', '#ede9fe', '#fee2e2', '#fef9c3'];

export function addSticky() {
  const vr = S.vp.getBoundingClientRect();
  const bp = s2b(vr.left + vr.width / 2, vr.top + vr.height / 2);

  // 랜덤 초기 색상 인덱스
  let colorIdx = Math.floor(Math.random() * STICKY_COLORS.length);
  const bg = STICKY_COLORS[colorIdx];

  const el = makeEl(bp.x - 100, bp.y - 70, 200, 140);

  const body = document.createElement('div');
  body.className = 'el-body sticky-body';
  body.style.background = bg;

  const bar = document.createElement('div');
  bar.className = 'sticky-bar';

  const colorBtn = document.createElement('button');
  colorBtn.className = 'sticky-btn';
  colorBtn.textContent = '🎨';
  onTap(colorBtn, () => {
    // 인덱스 기반으로 다음 색상 순환
    colorIdx = (colorIdx + 1) % STICKY_COLORS.length;
    body.style.background = STICKY_COLORS[colorIdx];
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'sticky-btn';
  closeBtn.textContent = '✕';
  onTap(closeBtn, () => { el.remove(); updateMinimap(); });

  bar.appendChild(colorBtn);
  bar.appendChild(closeBtn);

  const ta = document.createElement('textarea');
  ta.placeholder = '메모를 입력하세요...';
  ta.addEventListener('focus', () => { el.style.zIndex = S.nextZ(); });

  body.appendChild(bar);
  body.appendChild(ta);
  el.appendChild(body);
  addHandles(el);
  attachSelectClick(el);
  S.board.appendChild(el);
  updateMinimap();
}
