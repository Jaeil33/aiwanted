import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../stage/useReducedMotion';
import styles from './UniverseDots.module.css';

export interface UniverseGroup {
  label: string;
  /** 1,000경기 중 개수 */
  n: number;
  color: string;
}

export interface UniverseDotsProps {
  /** 채우는 순서대로. 합이 1,000보다 작으면 나머지 칸은 빈 점 */
  groups: readonly UniverseGroup[];
}

const COLS = 40;
const ROWS = 25;
const TOTAL = COLS * ROWS;
const FILL_MS = 1400;
const EMPTY = '#161D26';

/** 평행우주 1,000경기 점(40×25): 묶음 순서대로 easeOutCubic 1,400ms로 채운다. 캔버스 크기는 그릴 때 한 번만 정한다 */
export function UniverseDots({ groups }: UniverseDotsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  const label = `평행우주 1,000경기: ${groups.map((g) => `${g.label} ${g.n}번`).join(', ')}`;
  const key = JSON.stringify(groups.map((g) => [g.n, g.color]));

  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const parsed = (JSON.parse(key) as [number, string][]).map(([n, color]) => ({ n, color }));
    const w = canvas.getBoundingClientRect().width;
    if (!(w > 0)) return;
    const h = (w * ROWS) / COLS;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = w / COLS;
    const row = h / ROWS;
    const colors: string[] = [];
    for (const grp of parsed) for (let j = 0; j < grp.n && colors.length < TOTAL; j++) colors.push(grp.color);
    const paint = (filled: number) => {
      g.clearRect(0, 0, w, h);
      for (let idx = 0; idx < TOTAL; idx++) {
        g.fillStyle = idx < filled && idx < colors.length ? colors[idx] : EMPTY;
        g.beginPath();
        g.arc((idx % COLS) * cell + cell / 2, Math.floor(idx / COLS) * row + row / 2, cell * 0.33, 0, Math.PI * 2);
        g.fill();
      }
    };
    if (reduced) {
      paint(TOTAL);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(Math.max((now - start) / FILL_MS, 0), 1);
      paint(Math.round(TOTAL * (1 - (1 - k) ** 3)));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [key, reduced]);

  return <canvas ref={canvasRef} className={styles.dots} role="img" aria-label={label} />;
}
