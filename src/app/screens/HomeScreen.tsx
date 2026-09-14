import { useMemo } from 'react';
import { SceneCard } from '../../components/SceneCard';
import { todaySceneIndex } from '../../data/appData';
import type { SceneRecord } from '../../types/data';
import { useGame } from '../GameProvider';
import { formatRoute } from '../router';
import styles from './HomeScreen.module.css';

const byDateDesc = (a: SceneRecord, b: SceneRecord) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const playHref = (sceneId: string) => formatRoute({ screen: 'play', sceneId, share: null });

/** 첫 화면: 부제·오늘의 장면·한 판 흐름·모든 장면. 실제 결과는 보여주지 않는다(PRD) */
export function HomeScreen() {
  const { data, platform } = useGame();
  const scenes = data.scenes;
  const today = scenes[todaySceneIndex(platform.today(), scenes.length)];
  const sorted = useMemo(() => [...scenes].sort(byDateDesc), [scenes]);

  return (
    <div className={styles.home}>
      <section className={styles.intro} aria-labelledby="home-title">
        <h2 id="home-title" className={styles.title}>
          쓸모없는 변수, 진짜 쓸모없을까?
        </h2>
        <p className={styles.lead}>
          실제 KBO 명장면에 쓸데없는 TMI를 걸면, 타석·이닝·경기 승률이 어떻게 바뀌는지 계산하고 그 장면을 다시 치러요.
        </p>
      </section>

      {today && (
        <section className={styles.section} aria-labelledby="today-title">
          <h3 id="today-title" className={styles.sectionTitle}>
            오늘의 장면
          </h3>
          <SceneCard scene={today} />
          <a className={styles.primary} href={playHref(today.id)}>
            이 장면에 TMI 걸기
          </a>
        </section>
      )}

      <section className={styles.section} aria-labelledby="flow-title">
        <h3 id="flow-title" className={styles.sectionTitle}>
          한 판은 이렇게
        </h3>
        <ol className={styles.flow}>
          <li>
            <span className={styles.stepName}>장면 고르기</span>
            <span className={styles.stepText}>2026 시즌 실제 경기의 결정적 순간을 골라요.</span>
          </li>
          <li>
            <span className={styles.stepName}>TMI 한 줄</span>
            <span className={styles.stepText}>쓸데없는 이야기를 적으면 AI가 야구 변수로 바꿔요.</span>
          </li>
          <li>
            <span className={styles.stepName}>다시 치르기</span>
            <span className={styles.stepText}>한 구씩, 또는 경기 끝까지 다시 던져요.</span>
          </li>
        </ol>
      </section>

      <section className={styles.section} aria-labelledby="all-title">
        <h3 id="all-title" className={styles.sectionTitle}>
          모든 장면
        </h3>
        <ul className={styles.list}>
          {sorted.map((scene) => (
            <li key={scene.id} className={styles.item}>
              <SceneCard scene={scene} href={playHref(scene.id)} />
            </li>
          ))}
        </ul>
      </section>

      <nav className={styles.more} aria-label="더 알아보기">
        <a className={styles.textLink} href="#/evidence">
          판정소: 이 변수, 진짜 효과가 있을까?
        </a>
        <a className={styles.textLink} href="#/about">
          만든 이유
        </a>
      </nav>
    </div>
  );
}
