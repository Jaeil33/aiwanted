import { useEffect, useRef, useState, type ReactNode } from 'react';
import { weekdayOf } from '../components/SituationCard';
import { TabBar, type TabBarTab } from '../components/TabBar';
import { APP_DATA } from '../data/appData';
import type { AppData } from '../types/data';
import styles from './App.module.css';
import { GameProvider, useGame } from './GameProvider';
import { localPlatform, type Platform } from './platform';
import { formatRoute } from './router';
import { AboutScreen } from './screens/AboutScreen';
import { EvidenceScreen } from './screens/EvidenceScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { PaScreen } from './screens/PaScreen';
import { useHashRoute } from './useHashRoute';

/** 출처 한 줄(ADR-005): MenuFrame에 둔다. 타석 화면의 출처는 결과 카드가 싣는다 */
const SOURCES = '기록·중계: 네이버 스포츠(KBO) · 날씨: Open-Meteo · 확률: TMI 야구 엔진 계산값';

/** 상단 바 오늘 날짜: "2026-09-15" → "9월 15일 (화)" */
export function todayText(date: string): string {
  const [, month, day] = date.split('-');
  const weekday = weekdayOf(date);
  return `${Number(month)}월 ${Number(day)}일${weekday ? ` (${weekday})` : ''}`;
}

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
      <MenuFrame current="lobby">
        <section className={styles.notice} aria-labelledby="no-data-title">
          <h2 id="no-data-title" className={styles.noticeTitle}>
            데이터를 기다리는 중
          </h2>
          <p>
            앱 데이터가 없어요. <code>npm run data</code>로 만든 뒤 다시 빌드하세요.
          </p>
        </section>
      </MenuFrame>
    );
  }

  return (
    <GameProvider data={data} platform={platform}>
      <Shell />
    </GameProvider>
  );
}

interface MenuFrameProps {
  current: TabBarTab;
  /** 상단 바 오른쪽 한 줄(로비의 오늘 날짜) */
  meta?: string;
  children: ReactNode;
}

/** 로비·만든 이유: 상단 바 52px(브랜드) + 본문 + 출처 한 줄 + 하단 TabBar */
function MenuFrame({ current, meta, children }: MenuFrameProps) {
  return (
    <div className={styles.column}>
      <header className={styles.topbar}>
        <h1 className={styles.brand}>
          <a href="#/" className={styles.brandLink}>
            TMI <span className={styles.brandAccent}>야구</span>
          </a>
        </h1>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </header>
      <main className={styles.menuMain}>{children}</main>
      <p className={styles.sources}>{SOURCES}</p>
      <TabBar current={current} />
    </div>
  );
}

/** 타석: 머리말·푸터·탭바 없는 전체 화면. 문서 제목(h1)은 스크린리더에만 둔다 */
function GameFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.column}>
      <h1 className={styles.srOnly}>TMI 야구</h1>
      <main className={styles.gameMain}>{children}</main>
    </div>
  );
}

/** 해시 라우트 → 틀과 화면. 타석 라우트는 장면을 열고(같은 장면이 열려 있으면 그대로), 결과 해시는 열린 타석으로, 모르는 장면은 첫 화면으로 보낸다 */
function Shell() {
  const { data, session, dispatch, actions, platform } = useGame();
  const [route, setRoute] = useHashRoute();
  /** 이미 열기를 요청한 타석 해시 (StrictMode에서 effect가 두 번 돌아도 한 번만 연다) */
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
    if (route.screen === 'result') {
      setRoute(openSceneId === null ? { screen: 'home' } : { screen: 'play', sceneId: openSceneId, share: null });
      return;
    }
    dispatch({ type: 'navigate', screen: route.screen });
  }, [route, data, openSceneId, dispatch, actions, setRoute]);

  const lobby = (
    <MenuFrame current="lobby" meta={todayText(platform.today())}>
      <LobbyScreen />
    </MenuFrame>
  );

  switch (route.screen) {
    case 'play':
      return data.scenes.some((scene) => scene.id === route.sceneId) ? (
        <GameFrame>
          <PaScreen />
        </GameFrame>
      ) : (
        lobby
      );
    case 'result':
      return openSceneId === null ? (
        lobby
      ) : (
        <GameFrame>
          <PaScreen />
        </GameFrame>
      );
    case 'evidence':
      return (
        <MenuFrame current="about">
          <EvidenceScreen />
        </MenuFrame>
      );
    case 'about':
      return (
        <MenuFrame current="about">
          <AboutScreen />
        </MenuFrame>
      );
    default:
      return lobby;
  }
}
