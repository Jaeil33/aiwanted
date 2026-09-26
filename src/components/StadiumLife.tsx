import type { CSSProperties } from 'react';
import { rgbaOf, skyPalette, type SkyKind } from '../stage/math/sky';
import styles from './StadiumLife.module.css';

/*
 * 살아 있는 관중석(21-pitch-stage step 3).
 *
 * 캔버스는 사건이 있을 때만 다시 그린다 — 던지는 1초를 빼면 완전한 정지 화면이었다.
 * 그 1초 바깥이 사용자가 이 화면에서 보내는 시간의 거의 전부다(TMI를 쓰고 확률을 보는 시간).
 *
 * 그렇다고 상시 rAF 루프를 돌리지는 않는다(/grill-me Q18 c). **움직임을 CSS로 옮긴다** —
 * 컴포지터가 돌리므로 JS가 한 줄도 안 돌고, 배터리를 거의 안 쓰며, `prefers-reduced-motion`도 CSS가 지킨다.
 *
 * 캔버스 **위**에 놓지만 `mix-blend-mode: screen`이라 빛을 더하기만 한다. 릴리스 순간 공은 관중석 높이에 있는데,
 * 흰 공 위에 빛을 더해도 흰 공이라 가려지지 않는다. 뒤에 깔면 캔버스 배경이 덮어 버린다.
 */

/** 관중석에 터지는 카메라 플래시. 자리와 때는 지어낸 값이다(/grill-me Q6 a) */
const FLASHES: ReadonlyArray<{ left: number; top: number; delay: number; size: number }> = [
  { left: 9, top: 5.5, delay: 0, size: 3 },
  { left: 23, top: 3.2, delay: 2.7, size: 2.4 },
  { left: 37, top: 6.8, delay: 5.1, size: 2.8 },
  { left: 52, top: 2.6, delay: 1.4, size: 2.2 },
  { left: 66, top: 6.1, delay: 6.6, size: 3.2 },
  { left: 79, top: 3.8, delay: 3.9, size: 2.6 },
  { left: 91, top: 6.4, delay: 8.2, size: 2.4 },
];

export interface StadiumLifeProps {
  sky: SkyKind;
}

export function StadiumLife({ sky }: StadiumLifeProps) {
  const palette = skyPalette(sky);
  const style = {
    '--light': palette.light,
    '--bloom': rgbaOf(palette.light, 0.14 * palette.glow),
    '--bloom-0': rgbaOf(palette.light, 0),
    '--crowd': rgbaOf(palette.light, Math.max(0.1, palette.crowdAlpha)),
  } as CSSProperties;

  return (
    <div className={styles.life} data-testid="stadium-life" data-sky={sky} aria-hidden="true" style={style}>
      {/* 같은 점무늬 두 장을 엇갈려 밝힌다. opacity만 움직이므로 컴포지터가 처리한다 */}
      <i className={styles.crowd} data-part="crowd" data-phase="a" />
      <i className={styles.crowd} data-part="crowd" data-phase="b" />

      {palette.glow > 0 && (
        <>
          <i className={styles.glow} data-part="glow" data-side="left" />
          <i className={styles.glow} data-part="glow" data-side="right" />
        </>
      )}

      {palette.flashes &&
        FLASHES.map((f) => (
          <i
            key={`${f.left}-${f.top}`}
            className={styles.flash}
            data-part="flash"
            style={{ left: `${f.left}%`, top: `${f.top}%`, width: f.size, height: f.size, animationDelay: `${f.delay}s` }}
          />
        ))}
    </div>
  );
}
