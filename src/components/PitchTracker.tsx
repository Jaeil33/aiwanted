import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties } from 'react';
import { PITCH_CODE_LABEL, PITCH_CODES, PITCH_TYPES } from '../domain/events';
import { DEFAULT_PITCH_ROW } from '../stage/math/pitch';
import type { PitchPlayback, StageController, StageInspect } from '../stage';
import { CALL_COLORS, PITCH_COLORS, createTracker, type Tracker } from '../stage/tracker';
import type { SkyKind } from '../stage/math/sky';
import { useReducedMotion } from '../stage/useReducedMotion';
import type { PitchRow } from '../types/data';
import type { Bases, PitchCode } from '../types/domain';
import styles from './PitchTracker.module.css';

export interface PlayerCaption {
  role: string;
  name: string;
  /** "좌타", "우투" */
  hand: string;
  /** 시즌 기록 한 줄 */
  stats: string;
  color: string;
}

export interface PitchTrackerProps {
  bases: Bases;
  zone: { top: number; bottom: number } | null;
  /** 하늘(경기 시작 시각·돔으로 고른다) */
  sky: SkyKind;
  /** 홈팀 색. 관중석·펜스에 옅게 섞인다 */
  homeColor: string;
  batter: PlayerCaption;
  pitcher: PlayerCaption;
  /** 화면이 높이를 정할 때(시안처럼 남은 높이를 채우기) */
  className?: string;
}

/** usePlayback이 쓰는 StageController + 실제 투구 다시 보기·미리 찍기·건너뛰기 */
export interface PitchTrackerHandle extends StageController {
  replay(rows: readonly PitchRow[]): Promise<void>;
  markPitches(rows: readonly PitchRow[]): void;
  /** 켜면 지금 공을 바로 끝내고, 끌 때까지 playPitch는 번호 원만 남긴다 */
  setSkipping(on: boolean): void;
}

interface Call {
  text: string;
  color: string;
  tone: 'normal' | 'big';
  key: number;
}

const codeOfRow = (row: PitchRow): PitchCode => PITCH_CODES[row[2]] ?? 'X';
const CALL_MS = 1600;
const REPLAY_GAP_MS = 380;

/** 포수 뒤 트래커(캔버스) + 구종·구속 판, 콜, 타자·투수 자막(DOM). 문서가 숨겨지면 연출을 바로 끝낸다(ADR-018) */
export const PitchTracker = forwardRef<PitchTrackerHandle, PitchTrackerProps>(function PitchTracker({ bases, zone, sky, homeColor, batter, pitcher, className }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trackerRef = useRef<Tracker | null>(null);
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  const skipping = useRef(false);
  const replaySeq = useRef(0);
  const callSeq = useRef(0);
  const callTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [info, setInfo] = useState<{ n: number; type: number; speed: number } | null>(null);
  const [call, setCall] = useState<Call | null>(null);

  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  const getTracker = useCallback((): Tracker | null => {
    if (trackerRef.current) return trackerRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    trackerRef.current = createTracker(canvas, {
      now: () => performance.now(),
      requestFrame: (cb) => requestAnimationFrame(cb),
      cancelFrame: (id) => cancelAnimationFrame(id),
      createCanvas: (width, height) => {
        const off = document.createElement('canvas');
        off.width = width;
        off.height = height;
        return off;
      },
      get reducedMotion() {
        return reducedRef.current;
      },
    });
    return trackerRef.current;
  }, []);

  const clearCall = useCallback(() => {
    if (callTimer.current) clearTimeout(callTimer.current);
    callTimer.current = null;
    setCall(null);
  }, []);

  const showCall = useCallback((text: string, color: string, tone: Call['tone']) => {
    if (callTimer.current) clearTimeout(callTimer.current);
    callSeq.current += 1;
    setCall({ text, color, tone, key: callSeq.current });
    callTimer.current = tone === 'normal' ? setTimeout(() => setCall(null), CALL_MS) : null;
  }, []);

  // 크기: 부모 상자에 맞추고, 글꼴이 늦게 오면 한 번 더 그린다
  useEffect(() => {
    const canvas = canvasRef.current;
    const tracker = getTracker();
    if (!canvas || !tracker) return;
    const box = canvas.parentElement ?? canvas;
    const measure = () => {
      const rect = box.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) tracker.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    };
    measure();
    void document.fonts?.ready.then(measure);
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [getTracker]);

  useEffect(() => {
    getTracker()?.setBases(bases);
  }, [bases, getTracker]);

  useEffect(() => {
    getTracker()?.setSky(sky, homeColor);
  }, [sky, homeColor, getTracker]);

  const zoneTop = zone?.top ?? null;
  const zoneBottom = zone?.bottom ?? null;
  useEffect(() => {
    if (zoneTop !== null && zoneBottom !== null) getTracker()?.setZone(zoneTop, zoneBottom);
  }, [zoneTop, zoneBottom, getTracker]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) trackerRef.current?.skip();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(
    () => () => {
      if (callTimer.current) clearTimeout(callTimer.current);
      replaySeq.current += 1;
      trackerRef.current?.destroy();
      trackerRef.current = null;
    },
    [],
  );

  useImperativeHandle(ref, (): PitchTrackerHandle => {
    const drawable = () => canvasRef.current?.getContext('2d') != null;
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const playPitch = async (p: PitchPlayback): Promise<void> => {
      const tracker = getTracker();
      const row = p.row ?? DEFAULT_PITCH_ROW;
      if (skipping.current) {
        tracker?.mark(row, p.number, p.code);
        return;
      }
      setInfo(p.row ? { n: p.number, type: p.row[0], speed: Math.round(p.row[1]) } : null);
      p.onRelease?.();
      if (tracker) await tracker.throwPitch(row, p.number, p.code, { slow: !p.fast && !skipping.current });
      if (skipping.current) return;
      if (p.banner) showCall(p.banner.text, CALL_COLORS[p.code], 'big');
      else showCall(PITCH_CODE_LABEL[p.code], CALL_COLORS[p.code], 'normal');
    };

    const clearMarkers = () => {
      replaySeq.current += 1;
      trackerRef.current?.reset();
      setInfo(null);
      clearCall();
    };

    const inspect = (): StageInspect => {
      const state = trackerRef.current?.inspect() ?? { busy: false, markers: 0 };
      return { busy: state.busy, bases, markers: state.markers };
    };

    return {
      setBases: (next) => getTracker()?.setBases(next),
      playPitch,
      showBanner: async (banner) => showCall(banner.text, '#FFD23F', 'big'),
      clearMarkers,
      resize: (cssWidth) => {
        const height = canvasRef.current?.parentElement?.getBoundingClientRect().height ?? 0;
        if (cssWidth > 0 && height > 0) getTracker()?.resize(cssWidth, height, window.devicePixelRatio || 1);
      },
      inspect,
      destroy: () => trackerRef.current?.destroy(),
      async replay(rows) {
        clearMarkers();
        const seq = replaySeq.current;
        for (let i = 0; i < rows.length; i++) {
          if (replaySeq.current !== seq) return;
          const row = rows[i];
          await playPitch({ row, code: codeOfRow(row), number: i + 1, fast: i < rows.length - 1 });
          if (i < rows.length - 1 && drawable() && !reducedRef.current) await wait(REPLAY_GAP_MS);
        }
      },
      markPitches(rows) {
        clearMarkers();
        const tracker = getTracker();
        rows.forEach((row, i) => tracker?.mark(row, i + 1, codeOfRow(row)));
      },
      setSkipping(on) {
        skipping.current = on;
        if (on) {
          trackerRef.current?.skip();
          setInfo(null);
          clearCall();
        }
      },
    };
  }, [bases, clearCall, getTracker, showCall]);

  return (
    <div className={[styles.tracker, className].filter(Boolean).join(' ')}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      {info && (
        <div className={styles.info} style={{ '--c': PITCH_COLORS[info.type] ?? PITCH_COLORS[8] } as CSSProperties}>
          <span className={styles.infoType}>
            <i aria-hidden="true" />
            {`${info.n}구 ${PITCH_TYPES[info.type] ?? '기타'}`}
          </span>
          <b className={styles.speed}>
            {info.speed}
            <small>km/h</small>
          </b>
        </div>
      )}
      <div className={styles.call} role="status" aria-live="polite">
        {call && (
          <span key={call.key} data-tone={call.tone} style={{ '--c': call.color } as CSSProperties}>
            {call.text}
          </span>
        )}
      </div>
      <div className={styles.lower}>
        {[batter, pitcher].map((cap, index) => (
          <div key={cap.role} className={styles.cap} data-side={index === 0 ? 'left' : 'right'} style={{ '--c': cap.color } as CSSProperties}>
            {/* 역할은 자리와 색으로 보이지만, 읽어 주려면 글자가 있어야 한다 */}
            <i className={styles.srOnly}>{cap.role}</i>
            <b>
              {cap.name}
              <small>{cap.hand}</small>
            </b>
            <span>{cap.stats}</span>
          </div>
        ))}
        <span className={styles.vs}>VS</span>
      </div>
    </div>
  );
});
