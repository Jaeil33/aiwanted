import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { Bases } from '../types/domain';
import styles from './BallparkStage.module.css';
import { createStage } from './render/controller';
import type { StageController, StageScene } from './render/types';
import { useReducedMotion } from './useReducedMotion';

export interface BallparkStageProps {
  scene: StageScene | null;
  bases?: Bases;
  board?: [string, string];
  className?: string;
  label?: string;
}

const DEFAULT_LABEL = '경기장: 투수와 타자가 공을 주고받는 화면';

/**
 * 경기장 캔버스. 연출은 모두 명령형 컨트롤러(createStage)가 맡고, 이 컴포넌트는 컨트롤러를 만들고
 * prop(scene·bases·board)과 컨테이너 폭을 넘기기만 한다. ref로 컨트롤러를 그대로 받는다.
 */
export const BallparkStage = forwardRef<StageController, BallparkStageProps>(function BallparkStage(
  { scene, bases, board, className, label },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<StageController | null>(null);
  // 컨트롤러는 마운트할 때 한 번만 만든다: 그때의 동작 줄이기 설정을 쓴다.
  const reducedAtMount = useRef(useReducedMotion());

  // useImperativeHandle보다 먼저 선언해야 핸들이 만들어진 컨트롤러를 가리킨다(레이아웃 효과는 선언 순서로 돈다).
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stage = createStage(canvas, { reducedMotion: reducedAtMount.current });
    stageRef.current = stage;
    return () => {
      stageRef.current = null;
      stage.destroy();
    };
  }, []);

  useImperativeHandle(ref, () => stageRef.current as StageController, []);

  useEffect(() => {
    if (scene) stageRef.current?.setScene(scene);
  }, [scene]);

  useEffect(() => {
    if (bases !== undefined) stageRef.current?.setBases(bases);
  }, [bases]);

  const line1 = board?.[0];
  const line2 = board?.[1];
  useEffect(() => {
    if (line1 !== undefined && line2 !== undefined) stageRef.current?.setBoard([line1, line2]);
  }, [line1, line2]);

  useEffect(() => {
    const container = containerRef.current;
    const stage = stageRef.current;
    if (!container || !stage) return;
    const fit = (width: number) => stage.resize(width, window.devicePixelRatio || 1);
    const measure = () => fit(container.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) fit(last.contentRect.width);
        else measure();
      });
      observer.observe(container);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div ref={containerRef} className={className ? `${styles.stage} ${className}` : styles.stage}>
      <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={label ?? DEFAULT_LABEL} />
    </div>
  );
});
