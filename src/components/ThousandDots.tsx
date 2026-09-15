import { useEffect, useRef } from 'react';
import { EV, EVENT_LABEL } from '../domain/events';
import { useReducedMotion } from '../stage/useReducedMotion';
import type { EventIndex } from '../types/domain';
import styles from './ThousandDots.module.css';

export interface ThousandDotsProps {
  /** 사건 순서 7개, 합 1,000 */
  counts: number[];
  /** 큰 숫자의 사건. null이면 출루(삼진·범타를 뺀 합) */
  highlight: EventIndex | null;
}

/** 강조 사건 색: 삼진 --out, 볼넷 --ball, 홈런 --accent, 3루타·2루타·안타 --inplay 계열, 범타 회색 */
const EVENT_COLORS = ['#FF4D4F', '#2FD27A', '#FFD23F', '#4DA3FF', '#4DA3FF', '#7FBDFF', '#8A96A3'];
/** 나머지 사건 색: 같은 계열을 바탕 가까이 가라앉혀 강조 사건만 눈에 띄게 한다 */
const MUTED_COLORS = ['#4A2A30', '#1D4432', '#4E4423', '#213A55', '#213A55', '#2A4460', '#28313C'];
const ON_BASE_COLOR = '#2FD27A';
const COLS = 40;
const ROWS = 25;
const FILL_MS = 1200;

interface Group {
  label: string;
  n: number;
  color: string;
  strong: boolean;
}

function groupsOf(counts: number[], highlight: EventIndex | null): Group[] {
  const n = (i: number) => counts[i] ?? 0;
  if (highlight === null) {
    const onBase = [EV.BB, EV.HR, EV.T3, EV.D2, EV.S1].reduce((sum, i) => sum + n(i), 0);
    return [
      { label: '출루', n: onBase, color: ON_BASE_COLOR, strong: true },
      { label: EVENT_LABEL[EV.K], n: n(EV.K), color: MUTED_COLORS[EV.K], strong: false },
      { label: EVENT_LABEL[EV.OUT], n: n(EV.OUT), color: MUTED_COLORS[EV.OUT], strong: false },
    ];
  }
  const order = [highlight, ...[0, 1, 2, 3, 4, 5, 6].filter((i) => i !== highlight)];
  return order.map((i) => ({ label: EVENT_LABEL[i], n: n(i), color: i === highlight ? EVENT_COLORS[i] : MUTED_COLORS[i], strong: i === highlight }));
}

/** 1,000타석 점(40×25): 큰 숫자의 사건부터 채우고 나머지는 흐리게. 채우는 비율은 easeOutCubic 1,200ms */
export function ThousandDots({ counts, highlight }: ThousandDotsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const groups = groupsOf(counts, highlight);
  const label = `1,000번 중 ${groups.map((g) => `${g.label} ${g.n}번`).join(', ')}`;
  const key = groups.map((g) => `${g.n}:${g.color}`).join('|');

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const parsed = key.split('|').map((part, index) => {
      const [n, color] = part.split(':');
      return { n: Number(n), color, strong: index === 0 };
    });
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = (w * ROWS) / COLS;
    if (!(w > 0)) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = w / COLS;
    const paint = (filled: number) => {
      g.clearRect(0, 0, w, h);
      let idx = 0;
      for (const grp of parsed) {
        for (let j = 0; j < grp.n && idx < COLS * ROWS; j++, idx++) {
          const x = (idx % COLS) * cell + cell / 2;
          const y = Math.floor(idx / COLS) * cell + cell / 2;
          g.fillStyle = idx < filled ? grp.color : '#141A22';
          g.beginPath();
          g.arc(x, y, cell * 0.34, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.globalAlpha = 1;
    };
    if (reduced) {
      paint(COLS * ROWS);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min((now - start) / FILL_MS, 1);
      paint(Math.round(COLS * ROWS * (1 - (1 - k) ** 3)));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [key, reduced]);

  return <canvas ref={canvasRef} className={styles.dots} role="img" aria-label={label} />;
}
