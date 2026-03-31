// ═══════════════════════════════════════════════════
//  startup.js — 시작 윈도우 & 단축키 윈도우 & 최근 파일
//
//  FIX: 파일 불러오기 / 최근 사용한 파일 / 단축키 보기 클릭 시
//       시작 윈도우가 사라지지 않도록 수정
// ═══════════════════════════════════════════════════

import * as S from './state.js';
import { onTap } from './utils.js';

// ── 최근 파일 관리 ──
const RECENT_KEY = 'canvas-recent-files';
const MAX_RECENT = 10;

export function getRecentFiles() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch { return []; }
}

export function addRecentFile(name, data) {
  const list = getRecentFiles();
  const filtered = list.filter(f => f.name !== name);
  filtered.unshift({
    name,
    date: new Date().toISOString(),
    data: JSON.stringify(data)
  });
  while (filtered.length > MAX_RECENT) filtered.pop();
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(filtered)); } catch { /* ignore */ }
}

export function removeRecentFile(name) {
  const list = getRecentFiles().filter(f => f.name !== name);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

// ── 드래그 가능한 윈도우 헬퍼 ──
function makeDraggableHeader(win, header) {
  let dragState = null;
  header.addEventListener('mousedown', e => {
    if (e.target.tagName === 'BUTTON') return;
    dragState = { ox: e.clientX - win.offsetLeft, oy: e.clientY - win.offsetTop };
    e.preventDefault();
  });
  const onMove = e => {
    if (!dragState) return;
    win.style.left = (e.clientX - dragState.ox) + 'px';
    win.style.top = (e.clientY - dragState.oy) + 'px';
  };
  const onUp = () => { dragState = null; };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  header.addEventListener('touchstart', e => {
    if (e.target.tagName === 'BUTTON') return;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    dragState = { ox: t.clientX - win.offsetLeft, oy: t.clientY - win.offsetTop };
  }, { passive: true });
  window.addEventListener('touchmove', e => {
    if (!dragState || e.touches.length !== 1) return;
    const t = e.touches[0];
    win.style.left = (t.clientX - dragState.ox) + 'px';
    win.style.top = (t.clientY - dragState.oy) + 'px';
  }, { passive: true });
  window.addEventListener('touchend', () => { dragState = null; });
}

// ── 시작 윈도우 ──
export function createStartupWindow() {
  if (document.querySelector('.start-window')) return;

  const vr = S.vp.getBoundingClientRect();
  const w = 300, h = 360;
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
          <button class="launch-btn primary" data-sw-action="new">새 캔버스 시작</button>
          <button class="launch-btn" data-sw-action="load-file">📂 파일 불러오기</button>
          <button class="launch-btn" data-sw-action="recent">🕐 최근 사용한 파일</button>
          <button class="launch-btn ghost" data-sw-action="shortcuts">⌨️ 단축키 보기</button>
        </div>
      </div>
    </div>
  `;

  S.board.appendChild(win);

  // 닫기
  const closeBtn = win.querySelector('.start-window-close');
  onTap(closeBtn, () => win.remove());

  // 새 캔버스 — 시작 윈도우만 닫음
  const newBtn = win.querySelector('[data-sw-action="new"]');
  onTap(newBtn, () => win.remove());

  // 파일 불러오기 — 시작 윈도우 유지, 파일 선택 다이얼로그만 열림
  const loadBtn = win.querySelector('[data-sw-action="load-file"]');
  onTap(loadBtn, () => {
    document.getElementById('load-in').click();
  });

  // 최근 사용한 파일 — 시작 윈도우 유지, 최근 파일 윈도우 추가로 열림
  const recentBtn = win.querySelector('[data-sw-action="recent"]');
  onTap(recentBtn, () => {
    createRecentFilesWindow();
  });

  // 단축키 보기 — 시작 윈도우 유지, 단축키 윈도우 추가로 열림
  const shortcutBtn = win.querySelector('[data-sw-action="shortcuts"]');
  onTap(shortcutBtn, () => {
    createShortcutWindow();
  });

  makeDraggableHeader(win, win.querySelector('.start-window-header'));
}

// ── 단축키 윈도우 ──
export function createShortcutWindow() {
  document.querySelectorAll('.shortcut-window').forEach(el => el.remove());

  const vr = S.vp.getBoundingClientRect();
  const w = 320, h = 440;
  const x = (vr.width - w) / 2 / S.T.s + 30;
  const y = (vr.height - h) / 2 / S.T.s + 20;

  const win = document.createElement('div');
  win.className = 'start-window shortcut-window';
  win.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:${S.nextZ()};position:absolute;`;

  const shortcuts = [
    ['V', '선택 도구'],
    ['H', '이동 (팬)'],
    ['P', '펜'],
    ['L', '형광펜'],
    ['E', '지우개'],
    ['S', '포스트잇 추가'],
    ['W', '카드 창 추가'],
    ['T', '텍스트'],
    ['R', '사각형'],
    ['C', '원 (타원)'],
    ['A', '화살표'],
    ['G', '그리드 토글'],
    ['Space', '임시 팬 모드'],
    ['Ctrl+S', '저장'],
    ['Ctrl+Z', '실행 취소'],
    ['Del', '선택 삭제'],
    ['Shift+클릭', '다중 선택'],
    ['휠 스크롤', '줌 인/아웃'],
    ['핀치', '줌 (모바일)'],
  ];

  let rowsHtml = '';
  shortcuts.forEach(([key, desc]) => {
    rowsHtml += `
      <div class="shortcut-row">
        <span class="shortcut-key">${key}</span>
        <span class="shortcut-desc">${desc}</span>
      </div>`;
  });

  win.innerHTML = `
    <div class="start-window-body">
      <div class="start-window-header">
        <div class="start-window-title">⌨️ 단축키</div>
        <button class="start-window-close">✕</button>
      </div>
      <div class="start-window-content" style="overflow-y:auto;max-height:${h - 60}px;">
        <div class="shortcut-list">
          ${rowsHtml}
        </div>
      </div>
    </div>
  `;

  S.board.appendChild(win);

  const closeBtn = win.querySelector('.start-window-close');
  onTap(closeBtn, () => win.remove());

  makeDraggableHeader(win, win.querySelector('.start-window-header'));
}

// ── 최근 파일 윈도우 ──
export function createRecentFilesWindow() {
  document.querySelectorAll('.recent-window').forEach(el => el.remove());

  const vr = S.vp.getBoundingClientRect();
  const w = 340, h = 400;
  const x = (vr.width - w) / 2 / S.T.s + 30;
  const y = (vr.height - h) / 2 / S.T.s + 20;

  const win = document.createElement('div');
  win.className = 'start-window recent-window';
  win.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:${S.nextZ()};position:absolute;`;

  win.innerHTML = `
    <div class="start-window-body">
      <div class="start-window-header">
        <div class="start-window-title">🕐 최근 사용한 파일</div>
        <button class="start-window-close">✕</button>
      </div>
      <div class="start-window-content" style="overflow-y:auto;max-height:${h - 60}px;">
        <div class="recent-list" id="recent-list-container"></div>
      </div>
    </div>
  `;

  S.board.appendChild(win);

  const closeBtn = win.querySelector('.start-window-close');
  onTap(closeBtn, () => win.remove());

  makeDraggableHeader(win, win.querySelector('.start-window-header'));

  renderRecentList(win);
}

function renderRecentList(win) {
  const container = win.querySelector('#recent-list-container');
  const files = getRecentFiles();

  if (files.length === 0) {
    container.innerHTML = `
      <div class="recent-empty">
        최근 사용한 파일이 없습니다.<br>
        캔버스를 저장하면 여기에 표시됩니다.
      </div>`;
    return;
  }

  container.innerHTML = '';
  files.forEach(file => {
    const item = document.createElement('div');
    item.className = 'recent-item';

    const dateStr = formatDate(file.date);
    item.innerHTML = `
      <div class="recent-main">
        <div class="recent-name">${escapeHtml(file.name)}</div>
        <div class="recent-meta">${dateStr}</div>
      </div>
      <div class="recent-actions">
        <button class="launch-btn small primary recent-open-btn">열기</button>
        <button class="launch-btn small ghost recent-del-btn">삭제</button>
      </div>
    `;

    const openBtn = item.querySelector('.recent-open-btn');
    onTap(openBtn, () => {
      try {
        const data = JSON.parse(file.data);
        import('./persistence.js').then(mod => {
          mod.restoreBoard(data);
          win.remove();
          // 시작 윈도우도 같이 닫기
          document.querySelectorAll('.start-window').forEach(sw => sw.remove());
        });
      } catch {
        alert('파일을 열 수 없습니다.');
      }
    });

    const delBtn = item.querySelector('.recent-del-btn');
    onTap(delBtn, () => {
      removeRecentFile(file.name);
      renderRecentList(win);
    });

    container.appendChild(item);
  });
}

function formatDate(isoStr) {
  try {
    const d = new Date(isoStr);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return isoStr; }
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
