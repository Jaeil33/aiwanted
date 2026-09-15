import { useMemo } from 'react';
import { SituationCard } from '../../components/SituationCard';
import { todaySceneIndex } from '../../data/appData';
import type { SceneRecord } from '../../types/data';
import { useGame } from '../GameProvider';
import { formatRoute } from '../router';
import styles from './LobbyScreen.module.css';

const byDateDesc = (a: SceneRecord, b: SceneRecord) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const playHref = (sceneId: string) => formatRoute({ screen: 'play', sceneId, share: null });

/** 로비: 한 줄 소개 → 오늘의 타석(큰 카드) → 지난 경기 승부처 목록 → 한 판 흐름. 실제 결과는 싣지 않는다 */
export function LobbyScreen() {
  const { data, platform } = useGame();
  const { scenes, core } = data;
  const today = scenes[todaySceneIndex(platform.today(), scenes.length)];
  const sorted = useMemo(() => [...scenes].sort(byDateDesc), [scenes]);
  const nameOf = (id: string) => (Object.hasOwn(core.players, id) ? core.players[id].name : id);

  return (
    <div className={styles.lobby}>
      <section className={styles.intro} aria-labelledby="lobby-title">
        <h2 id="lobby-title" className={styles.title}>
          방금 그 타석, 만약 그랬다면?
        </h2>
        <p className={styles.lead}>실제 KBO 타석에 쓸데없는 TMI를 걸면, 그 결과가 나올 확률이 얼마나 바뀌는지 엔진이 계산하고 그 타석을 다시 쳐봐요.</p>
      </section>

      {today && (
        <section className={styles.section} aria-label="오늘의 타석">
          <SituationCard scene={today} batterName={nameOf(today.batter)} pitcherName={nameOf(today.pitcher)} href={playHref(today.id)} variant="feature" />
        </section>
      )}

      <section className={styles.section} aria-labelledby="lobby-past-title">
        <div className={styles.listHead}>
          <h3 id="lobby-past-title" className={styles.sectionTitle}>
            지난 경기 승부처
          </h3>
          <span className={styles.count}>{`${sorted.length}타석`}</span>
        </div>
        <ul className={styles.list}>
          {sorted.map((scene) => (
            <li key={scene.id}>
              <SituationCard scene={scene} batterName={nameOf(scene.batter)} pitcherName={nameOf(scene.pitcher)} href={playHref(scene.id)} />
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="lobby-how-title">
        <h3 id="lobby-how-title" className={styles.sectionTitle}>
          한 판은 이렇게
        </h3>
        <ol className={styles.how}>
          <li>
            <b>타석 고르기</b>
            <span>2026 시즌 실제 경기의 승부처 타석을 골라요.</span>
          </li>
          <li>
            <b>TMI 한 줄</b>
            <span>쓸데없는 이야기를 적으면 야구 변수로 바뀌고, 엔진이 확률을 다시 계산해요.</span>
          </li>
          <li>
            <b>한 타석 쳐보기</b>
            <span>그 투수의 실제 투구 궤적으로 타석을 다시 쳐보고 1,000번 결과와 비교해요.</span>
          </li>
        </ol>
      </section>
    </div>
  );
}
