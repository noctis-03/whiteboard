// ═══════════════════════════════════════════════════
//  persistence.js — 저장, 불러오기, 자동 저장
// ═══════════════════════════════════════════════════

import * as S from './state.js';
import { snack } from './utils.js';
import { updateMinimap } from './layout.js';

export function saveBoard() {
  const data = {
    version: '0.01',
    strokes: S.strokes.map(s => ({ kind: s.kind, attrs: { ...s.attrs } })),
    elements: [],
    T: { ...S.T }
  };

  S.board.querySelectorAll('.el').forEach(el => {
    data.elements.push({
      html: el.outerHTML,
      x: parseFloat(el.style.left),
      y: parseFloat(el.style.top),
      w: parseFloat(el.style.width),
      h: parseFloat(el.style.height),
      z: parseInt(el.style.zIndex) || 10
    });
  });

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `canvas-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  snack('저장 완료');

  try { localStorage.setItem('canvas-autosave', JSON.stringify(data)); } catch (e) { /* ignore */ }
}

export function loadBoard(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      restoreBoard(data);
      snack('불러오기 완료');
    } catch (err) {
      snack('파일 오류');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

export function restoreBoard(data) {
  // SVG 초기화
  while (S.svgl.firstChild) S.svgl.removeChild(S.svgl.firstChild);
  S.setStrokes([]);

  // 요소 초기화
  S.board.querySelectorAll('.el').forEach(el => el.remove());

  // 스트로크 복원
  if (data.strokes) {
    const { mkSvg, setAttrs } = require_svg();
    data.strokes.forEach(s => {
      let el;
      if (s.kind === 'rect') { el = mkSvg('rect'); }
      else if (s.kind === 'ellipse') { el = mkSvg('ellipse'); }
      else if (s.kind === 'arrow') { el = mkSvg('g'); /* 화살표 복원은 복잡 */ }
      else { el = mkSvg('path'); }
      setAttrs(el, s.attrs);
      S.svgl.appendChild(el);
      S.pushStroke({ kind: s.kind, attrs: s.attrs, svgEl: el });
    });
  }

  // Transform 복원
  if (data.T) { S.T.x = data.T.x; S.T.y = data.T.y; S.T.s = data.T.s; }

  updateMinimap();
}

// svg.js를 동적으로 가져오기 위한 헬퍼 (순환 참조 방지)
function require_svg() {
  // 이 함수는 main.js 초기화 시 주입됨
  return persistence._svg;
}

// SVG 모듈 주입 인터페이스
export const persistence = { _svg: null };

export function clearAll() {
  if (!confirm('모든 내용을 지우시겠습니까?')) return;
  while (S.svgl.firstChild) S.svgl.removeChild(S.svgl.firstChild);
  S.setStrokes([]);
  S.board.querySelectorAll('.el').forEach(el => el.remove());
  try { localStorage.removeItem('canvas-autosave'); } catch (e) { /* ignore */ }
  updateMinimap();
  snack('전체 삭제 완료');
}

export function autoSave() {
  setInterval(() => {
    try {
      const data = {
        version: '0.01',
        strokes: S.strokes.map(s => ({ kind: s.kind, attrs: { ...s.attrs } })),
        elements: [],
        T: { ...S.T }
      };
      S.board.querySelectorAll('.el').forEach(el => {
        data.elements.push({ html: el.outerHTML });
      });
      localStorage.setItem('canvas-autosave', JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }, 30000);
}

export function initPersistence() {
  document.getElementById('load-in').addEventListener('change', loadBoard);
}
