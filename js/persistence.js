// ═══════════════════════════════════════════════════
//  persistence.js — 저장, 불러오기, 자동 저장
//
//  UPDATE: 불러오기/전체 지우기 후 clearHistory()
// ═══════════════════════════════════════════════════

import * as S from './state.js';
import { snack } from './utils.js';
import { updateMinimap } from './layout.js';
import { addRecentFile } from './startup.js';
import { clearHistory } from './history.js';

function buildSaveData() {
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

  return data;
}

export function saveBoard() {
  const data = buildSaveData();
  const filename = `canvas-${new Date().toISOString().slice(0, 10)}.json`;

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  snack('저장 완료');

  addRecentFile(filename, data);

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
      addRecentFile(file.name, data);
      clearHistory();
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
    const { mkSvg, setAttrs } = _getSvgModule();
    data.strokes.forEach(s => {
      let el;
      if (s.kind === 'rect') { el = mkSvg('rect'); }
      else if (s.kind === 'ellipse') { el = mkSvg('ellipse'); }
      else if (s.kind === 'arrow') {
        el = mkSvg('g');
        if (s.attrs.x1 !== undefined) {
          const line = mkSvg('line');
          setAttrs(line, {
            x1: s.attrs.x1, y1: s.attrs.y1,
            x2: s.attrs.x2, y2: s.attrs.y2,
            stroke: s.attrs.stroke,
            'stroke-width': s.attrs['stroke-width'],
            'stroke-linecap': 'round'
          });
          el.appendChild(line);
        }
        if (s.attrs.d) {
          const path = mkSvg('path');
          setAttrs(path, {
            d: s.attrs.d,
            stroke: s.attrs.stroke,
            'stroke-width': s.attrs['stroke-width'],
            'stroke-linecap': 'round',
            fill: 'none'
          });
          el.appendChild(path);
        }
      }
      else { el = mkSvg('path'); }

      if (s.kind !== 'arrow') {
        setAttrs(el, s.attrs);
      }
      S.svgl.appendChild(el);
      S.pushStroke({ kind: s.kind, attrs: s.attrs, svgEl: el });
    });
  }

  // Transform 복원
  if (data.T) { S.T.x = data.T.x; S.T.y = data.T.y; S.T.s = data.T.s; }

  updateMinimap();
}

// SVG 모듈 주입 인터페이스 (순환 참조 방지)
let _svgModule = null;
function _getSvgModule() {
  if (_svgModule) return _svgModule;
  return persistence._svg;
}
export const persistence = { _svg: null };

export function clearAll() {
  if (!confirm('모든 내용을 지우시겠습니까?')) return;
  while (S.svgl.firstChild) S.svgl.removeChild(S.svgl.firstChild);
  S.setStrokes([]);
  S.board.querySelectorAll('.el').forEach(el => el.remove());
  try { localStorage.removeItem('canvas-autosave'); } catch (e) { /* ignore */ }
  updateMinimap();
  snack('전체 삭제 완료');
  clearHistory();
}

export function autoSave() {
  setInterval(() => {
    try {
      const data = buildSaveData();
      localStorage.setItem('canvas-autosave', JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }, 30000);
}

export function initPersistence() {
  document.getElementById('load-in').addEventListener('change', loadBoard);
}
