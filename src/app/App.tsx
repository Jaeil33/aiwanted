import { useEffect, useRef, useState, type ReactNode } from 'react';
import { APP_DATA } from '../data/appData';
import type { AppData } from '../types/data';
import styles from './App.module.css';
import { GameProvider, useGame } from './GameProvider';
import { localPlatform, type Platform } from './platform';
import { formatRoute, type Route } from './router';
import { AboutScreen } from './screens/AboutScreen';
import { EvidenceScreen } from './screens/EvidenceScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PlayScreen } from './screens/PlayScreen';
import { ResultScreen } from './screens/ResultScreen';
import { useHashRoute } from './useHashRoute';

const SOURCES = '기록·중계: 네이버 스포츠(KBO) · 날씨: Open-Meteo · 확률: TMI 야구 엔진 계산값';

export interface AppProps {
  /** 앱 데이터. 기본은 빌드에 넣은 APP_DATA, null이면 안내 화면 */
  data?: AppData | null;
  /** detectPlatform 결과. 준비되기 전에는 지역 엔진·AI 없음으로 먼저 그린다 */
  platformPromise?: Promise<Platform>;
}

export function App({ data = APP_DATA, platformPromise }: AppProps) {
  const [platform, setPlatform] = useState<Platform>(() => localPlatform());

  useEffect(() => {
    if (!platformPromise) return;
    let alive = true;
    platformPromise.then(
      (detected) => {
        if (alive) setPlatform(detected);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [platformPromise]);

  if (!data) {
    return (
      <Frame current={null}>
        <section className={styles.notice} aria-labelledby="no-data-title">
          <h2 id="no-data-title" className={styles.noticeTitle}>
            데이터를 기다리는 중
          </h2>
          <p>
            앱 데이터가 없어요. <code>npm run data</code>로 만든 뒤 다시 빌드하세요.
          </p>
        </section>
      </Frame>
    );
  }

  return (
    <GameProvider data={data} platform={platform}>
      <Shell />
    </GameProvider>
  );
}

/** 머리말(로고·내비)·본문·출처 푸터 */
function Frame({ current, children }: { current: Route['screen'] | null; children: ReactNode }) {
  const scenesActive = current === 'home' || current === 'play' || current === 'result';
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.bar}>
          <h1 className={styles.brand}>
            <a href="#/" className={styles.brandLink}>
              TMI 야구
            </a>
          </h1>
          <nav aria-label="주 메뉴" className={styles.nav}>
            <a href="#/" className={styles.navLink} aria-current={scenesActive ? 'page' : undefined}>
              장면
            </a>
            <a href="#/evidence" className={styles.navLink} aria-current={current === 'evidence' ? 'page' : undefined}>
              판정소
            </a>
            <a href="#/about" className={styles.navLink} aria-current={current === 'about' ? 'page' : undefined}>
              만든 이유
            </a>
          </nav>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <p className={styles.sources}>{SOURCES}</p>
      </footer>
    </div>
  );
}

/** 해시 라우트 → 화면. play 라우트는 장면을 열고(같은 장면이 열려 있으면 그대로), 모르는 장면·열린 장면 없는 결과는 첫 화면으로 보낸다 */
function Shell() {
  const { data, session, dispatch, actions } = useGame();
  const [route, setRoute] = useHashRoute();
  /** 이미 열기를 요청한 play 해시 (StrictMode에서 effect가 두 번 돌아도 한 번만 연다) */
  const openedFor = useRef<string | null>(null);
  const openSceneId = session.sceneId;

  useEffect(() => {
    if (route.screen === 'play') {
      if (!data.scenes.some((scene) => scene.id === route.sceneId)) {
        setRoute({ screen: 'home' });
        return;
      }
      const key = formatRoute(route);
      if (openSceneId === route.sceneId) {
        openedFor.current = key;
        dispatch({ type: 'navigate', screen: 'play' });
        return;
      }
      if (openedFor.current === key) return;
      openedFor.current = key;
      void actions.openScene(route.sceneId, route.share);
      return;
    }
    if (route.screen === 'result' && openSceneId === null) {
      setRoute({ screen: 'home' });
      return;
    }
    dispatch({ type: 'navigate', screen: route.screen });
  }, [route, data, openSceneId, dispatch, actions, setRoute]);

  let screen: ReactNode;
  switch (route.screen) {
    case 'play':
      screen = data.scenes.some((scene) => scene.id === route.sceneId) ? <PlayScreen /> : <HomeScreen />;
      break;
    case 'result':
      screen = openSceneId === null ? <HomeScreen /> : <ResultScreen />;
      break;
    case 'evidence':
      screen = <EvidenceScreen />;
      break;
    case 'about':
      screen = <AboutScreen />;
      break;
    default:
      screen = <HomeScreen />;
  }
  return <Frame current={route.screen}>{screen}</Frame>;
}
