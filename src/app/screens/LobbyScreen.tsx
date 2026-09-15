import { useId, useMemo, type CSSProperties } from 'react';
import { BasesGlyph } from '../../components/BroadcastBug';
import controls from '../../components/controls.module.css';
import { weekdayOf } from '../../components/SituationCard';
import { todaySceneIndex } from '../../data/appData';
import { TEAMS, isTeamCode } from '../../domain/teams';
import type { PlayerRecord, SceneRecord } from '../../types/data';
import { useGame } from '../GameProvider';
import { formatRoute } from '../router';
import { useSceneSwings } from '../useSceneSwings';
import styles from './LobbyScreen.module.css';

const byDateDesc = (a: SceneRecord, b: SceneRecord) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const playHref = (sceneId: string) => formatRoute({ screen: 'play', sceneId, share: null });
const colorOf = (code: string) => (isTeamCode(code) ? TEAMS[code].color : '#A3ADB8');

const BATS_LABEL = { L: '좌타', R: '우타', S: '양타' } as const;
const THROWS_LABEL = { L: '좌투', R: '우투' } as const;
/** 승부처 지수 막대가 가득 차는 값(%p) */
const SWING_FULL = 40;

const finite = (v: number | string | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const rate = (x: number) => x.toFixed(3).replace(/^0/, '');

/** "좌타 .342": 타석 방향과 타율. 없는 값은 뺀다 */
function batterBits(p: PlayerRecord | undefined): string {
  if (!p) return '';
  const avg = finite(p.line.avg);
  return [p.bats ? BATS_LABEL[p.bats] : '', avg === null ? '' : rate(avg)].filter(Boolean).join(' ');
}

/** "우투 ERA 2.65": 던지는 손과 평균자책점. 없는 값은 뺀다 */
function pitcherBits(p: PlayerRecord | undefined): string {
  if (!p) return '';
  const era = finite(p.line.era);
  return [p.throws ? THROWS_LABEL[p.throws] : '', era === null ? '' : `ERA ${era.toFixed(2)}`].filter(Boolean).join(' ');
}

/** "8월 11일 (화)" */
function longDate(date: string): string {
  const [, month, day] = date.split('-');
  const weekday = weekdayOf(date);
  return `${Number(month)}월 ${Number(day)}일${weekday ? ` (${weekday})` : ''}`;
}

/** 승부처 지수 글자: 계산 중 "…", 실패 "–", 값은 소수 한 자리 */
function swingText(swing: number | null | undefined): string {
  if (swing === undefined) return '…';
  return swing === null ? '–' : swing.toFixed(1);
}

function Outs({ outs }: { outs: number }) {
  return (
    <span className={styles.outs} role="img" aria-label={`${outs}아웃`}>
      {[0, 1].map((i) => (
        <i key={i} data-on={String(i < outs)} />
      ))}
    </span>
  );
}

/** 로비(중계 시안): 한 줄 소개 → 오늘의 명장면(큰 점수 카드) → 다른 명장면 목록. 실제 결과는 싣지 않는다 */
export function LobbyScreen() {
  const { data, platform } = useGame();
  const { scenes, core } = data;
  const listTitleId = useId();
  const today = scenes.length > 0 ? scenes[todaySceneIndex(platform.today(), scenes.length)] : undefined;
  const rest = useMemo(() => scenes.filter((scene) => scene !== today).sort(byDateDesc), [scenes, today]);
  const ordered = useMemo(() => (today ? [today, ...rest] : rest), [today, rest]);
  const { swings } = useSceneSwings(ordered);

  const playerOf = (id: string) => (Object.hasOwn(core.players, id) ? core.players[id] : undefined);
  const nameOf = (id: string) => playerOf(id)?.name ?? id;
  const swingOf = (id: string) => (Object.hasOwn(swings, id) ? swings[id] : undefined);

  return (
    <div className={styles.lobby}>
      <h2 className={controls.srOnly}>명장면 고르기</h2>
      <p className={styles.tagline}>쓸모없는 변수, 진짜 쓸모없을까?</p>

      {today && <Feature scene={today} batter={playerOf(today.batter)} pitcher={playerOf(today.pitcher)} nameOf={nameOf} swing={swingOf(today.id)} />}

      <section className={styles.listSection} aria-labelledby={listTitleId}>
        <div className={styles.listHead}>
          <h3 id={listTitleId}>다른 명장면</h3>
          <span>{`${rest.length}장면`}</span>
        </div>
        <ul className={styles.games}>
          {rest.map((scene) => (
            <li key={scene.id}>
              <GameRow scene={scene} swing={swingOf(scene.id)} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

interface FeatureProps {
  scene: SceneRecord;
  batter: PlayerRecord | undefined;
  pitcher: PlayerRecord | undefined;
  nameOf(id: string): string;
  swing: number | null | undefined;
}

function Feature({ scene, batter, pitcher, nameOf, swing }: FeatureProps) {
  const { state } = scene;
  const bBits = batterBits(batter);
  const pBits = pitcherBits(pitcher);
  const width = typeof swing === 'number' ? Math.min(Math.max(swing, 0) / SWING_FULL, 1) * 100 : 0;
  const teams = [
    { side: 'away', label: '원정', name: scene.away.name, score: state.away },
    { side: 'home', label: '홈', name: scene.home.name, score: state.home },
  ] as const;
  return (
    <section
      className={styles.feature}
      aria-label="오늘의 명장면"
      style={{ '--away': colorOf(scene.away.code), '--home': colorOf(scene.home.code) } as CSSProperties}
    >
      <p className={styles.eyebrow}>{`오늘의 명장면 · ${longDate(scene.date)} · ${scene.stadium}`}</p>
      <div className={styles.score}>
        <div className={styles.team} data-side="away">
          <small>{teams[0].label}</small>
          <b>{teams[0].name}</b>
          <em>{teams[0].score}</em>
        </div>
        <div className={styles.state}>
          <BasesGlyph bases={state.bases} className={styles.featureBases} />
          <Outs outs={state.outs} />
        </div>
        <div className={styles.team} data-side="home">
          <small>{teams[1].label}</small>
          <b>{teams[1].name}</b>
          <em>{teams[1].score}</em>
        </div>
      </div>
      <h3 className={styles.title}>{scene.title}</h3>
      <p className={styles.matchup}>
        <b>{nameOf(scene.batter)}</b>
        {bBits && ` ${bBits}`} <span className={styles.vs}>vs</span> <b>{nameOf(scene.pitcher)}</b>
        {pBits && ` ${pBits}`}
      </p>
      <div className={styles.swing}>
        <span>승부처 지수</span>
        <div className={styles.swingBar} aria-hidden="true">
          <i style={{ width: `${width}%` }} />
        </div>
        <b>{swingText(swing)}</b>
      </div>
      <a className={`${controls.primary} ${styles.cta}`} href={playHref(scene.id)}>
        이 장면 다시 치르기
      </a>
    </section>
  );
}

function GameRow({ scene, swing }: { scene: SceneRecord; swing: number | null | undefined }) {
  const { state } = scene;
  const rows = [
    { side: 'away', name: scene.away.name, code: scene.away.code, score: state.away, batting: state.half === 0 },
    { side: 'home', name: scene.home.name, code: scene.home.code, score: state.home, batting: state.half === 1 },
  ] as const;
  return (
    <a className={styles.game} href={playHref(scene.id)}>
      <div className={styles.date}>
        <b>{scene.date.slice(5).replace('-', '.')}</b>
        <small>{scene.stadium}</small>
      </div>
      <div className={styles.teams}>
        {rows.map((row) => (
          <div key={row.side} className={styles.row} data-batting={String(row.batting)} style={{ '--c': colorOf(row.code) } as CSSProperties}>
            <i aria-hidden="true" />
            <span>{row.name}</span>
            <em>{row.score}</em>
          </div>
        ))}
      </div>
      <div className={styles.side}>
        <p>{`${state.inning}회${state.half ? '말' : '초'}`}</p>
        <span>
          <BasesGlyph bases={state.bases} className={styles.rowBases} />
          <Outs outs={state.outs} />
        </span>
        <span>{`지수 ${swingText(swing)}`}</span>
      </div>
    </a>
  );
}
