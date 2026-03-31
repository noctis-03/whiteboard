// ═══════════════════════════════════════════════════
//  startup.js — 시작 윈도우 생성
// ═══════════════════════════════════════════════════

import * as S from './state.js';
import { onTap } from './utils.js';

export function createStartupWindow() {
  // 시작 윈도우가 이미 있으면 스킵
  if (document.querySelector('.start-window')) return;

  const vr = S.vp.getBoundingClientRect();
  const w = 280, h = 320;
  const x = (vr.width - w) / 2 / S.T.s;
  const y = (vr.height - h) / 2 / S.T.s;

  const win = document.createElement('div');
  win.className = 'start-window';
  win.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:${S.nextZ()};position:absolute;`;

  win.innerHTML = `
    <div class="start-window-body">
      <div class="start-window-header">
        <div class="start-window-title">∞ Canvas</div>
        <button class="start-window-close">✕</button>
      </div>
      <div class="start-window-content">
        <div class="start-window-note">
          무한 캔버스 화이트보드에 오신 것을 환영합니다.<br>
          좌측 도구바에서 원하는 도구를 선택하세요.
        </div>
        <div class="start-window-actions">
          <button class="launch-btn primary" data-action="new">새 캔버스 시작</button>
          <button class="launch-btn ghost" data-action="shortcuts">단축키 보기</button>
        </div>
      </div>
    </div>
  `;

  S.board.appendChild(win);

  // 닫기 버튼
  const closeBtn = win.querySelector('.start-window-close');
  onTap(closeBtn, () => win.remove());

  // 새 캔버스 버튼
  const newBtn = win.querySelector('[data-action="new"]');
  onTap(newBtn, () => win.remove());

  // 단축키 버튼
  const shortcutBtn = win.querySelector('[data-action="shortcuts"]');
  onTap(shortcutBtn, () => {
    // TODO: 단축키 윈도우 표시
    win.remove();
  });

  // 헤더 드래그
  const header = win.querySelector('.start-window-header');
  let dragState = null;
  header.addEventListener('mousedown', e => {
    dragState = { ox: e.clientX - win.offsetLeft, oy: e.clientY - win.offsetTop };
  });
  window.addEventListener('mousemove', e => {
    if (!dragState) return;
    win.style.left = (e.clientX - dragState.ox) + 'px';
    win.style.top = (e.clientY - dragState.oy) + 'px';
  });
  window.addEventListener('mouseup', () => { dragState = null; });
}
