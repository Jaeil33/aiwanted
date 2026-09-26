import { useId, type CSSProperties } from 'react';
import { TeamStrip } from '../../components/TeamStrip';
import { weekdayOf } from '../../domain/format';
import { nameMapOf } from '../../domain/players';
import { TEAMS, isTeamCode } from '../../domain/teams';
import { addDays, paList, recentFinished, type PaListRow } from '../../game';
import type { GameSummary, LiveGame } from '../../types/live';
import { useGame } from '../GameProvider';
import { formatRoute, situationIdOf } from '../router';
import { useGames, useLiveGame } from '../useLiveData';
import styles from './HomeScreen.module.css';
import { LiveStatus } from './LiveStatus';

/*
 * 홈: 추천 승부처 피드(ADR-032). **늘 리그 전체에서, 최근에 끝난 경기부터.**
 *
 * 응원팀 개념은 없앴다(ADR-039). 거르는 값도, 저장하는 값도 없다 — 누구나 같은 홈을 본다.
 * 특정 팀 경기는 맨 위 구단 띠로 한 번에 간다.
 *
 * 일정은 요청 한 번(기간 조회)이고, 경기는 아래 FEED_GAMES개만 더 받는다. 끝난 경기 응답은 CDN이 하루 캐시한다.
 * 타석 결과는 싣지 않는다: 그 타석 결과만 치른 뒤에 공개한다(ADR-032 스포일러 정책).
 */

/** 피드에 세우는 경기 수. 훅은 개수가 고정이어야 해서 상수다. 하루 다섯 경기 = 최근 한 경기일 */
const FEED_GAMES = 5;
/** 최근 며칠 일정을 훑을지 */
const FEED_DAYS = 14;
/** 경기마다 뽑는 승부처 수 */
const PICKS_PER_GAME = 2;

/*
 * 히어로가 보여 주는 TMI 예시(22-home-hero).
 * 넷 다 규칙 사전이 실제로 잡는 문장이다(잠·음식·날씨·징크스) — AI 키가 없어도 눌렀을 때 효과가 난다.
 * 실존 선수 이름은 쓰지 않는다: 공개 저장소이고 공개 배포다(ADR-005).
 */
const EXAMPLES: readonly string[] = [
  '경기 전에 짜장면 곱빼기를 먹었다',
  '어젯밤 3시간밖에 못 잤대',
  '오늘 폭염이라 35도까지 올랐다',
  '주머니에 부적을 넣고 나왔다',
];

const colorOf = (code: string) => (isTeamCode(code) ? TEAMS[code].color : '#6A7581');

/** "9.25 (금)" */
function dateText(date: string): string {
  const day = `${Number(date.slice(5, 7))}.${Number(date.slice(8))}`;
  const weekday = weekdayOf(date);
  return weekday ? `${day} (${weekday})` : day;
}

export function HomeScreen() {
  const { platform, data } = useGame();
  const today = platform.today();
  const { data: games, error, loading, refresh } = useGames(platform.liveApi, { from: addDays(today, -FEED_DAYS), to: today });
  const feedId = useId();

  const picked = recentFinished(games ?? [], FEED_GAMES);
  // 훅은 개수가 고정이어야 한다: 자리 다섯을 미리 잡고 없으면 null을 넣는다
  const first = useLiveGame(platform.liveApi, picked[0]?.gameId ?? null);
  const second = useLiveGame(platform.liveApi, picked[1]?.gameId ?? null);
  const third = useLiveGame(platform.liveApi, picked[2]?.gameId ?? null);
  const fourth = useLiveGame(platform.liveApi, picked[3]?.gameId ?? null);
  const fifth = useLiveGame(platform.liveApi, picked[4]?.gameId ?? null);
  const slots = [first, second, third, fourth, fifth];

  // 중계에는 투수 이름이 없다: 번들 core 이름표를 함께 넘긴다(ADR-035)
  const names = nameMapOf(data.core);
  const cards = picked.map((summary, i) => ({
    summary,
    picks: picksOf(slots[i].data, summary.gameId, names),
    waiting: slots[i].data === null && slots[i].error === null,
  }));

  // 히어로의 예시·버튼이 데려갈 타석: 제일 최근 경기의 첫 승부처. 아직 못 받았으면 null
  const withPicks = cards.find((card) => card.picks.length > 0);
  const target = withPicks ? { gameId: withPicks.summary.gameId, no: withPicks.picks[0].no } : null;

  return (
    <div className={styles.screen}>
      <Hero target={target} />

      <div className={styles.head}>
        <TeamStrip />
      </div>

      <section className={styles.feed} aria-labelledby={feedId}>
        <h2 id={feedId} className={styles.feedTitle}>
          최근 승부처
        </h2>
        <p className={styles.lede}>승부가 갈린 타석이에요. 눌러서 그 자리에 들어가 다시 쳐 보세요.</p>

        <ul className={styles.cards} aria-label="추천 승부처">
          {cards.map(({ summary, picks, waiting }) => (
            <li key={summary.gameId}>
              <GameFeedCard summary={summary} picks={picks} waiting={waiting} />
            </li>
          ))}
        </ul>

        <LiveStatus
          loading={loading}
          error={error}
          empty={
            platform.liveApi === null
              ? '이 화면에서는 경기를 불러올 수 없어요.'
              : cards.length === 0
                ? '최근 2주에 끝난 경기가 없어요.'
                : undefined
          }
          onRetry={refresh}
        />
      </section>
    </div>
  );
}

interface HeroProps {
  /** 예시·버튼이 데려갈 타석. 아직 경기를 못 받았으면 null */
  target: { gameId: string; no: number } | null;
}

/*
 * 첫 화면이 이 앱이 무엇인지 말하는 유일한 자리(22-home-hero).
 *
 * 그 전에는 경기 목록만 있었다 — 정체성인 TMI가 홈에 한 글자도 없어서, 처음 연 사람은
 * 이게 그냥 경기 기록 앱인 줄 알고 나갔다.
 *
 * 예시 칩은 장식이 아니라 **한 탭 데모**다: 공유 값(`?t=`)이 이미 TMI 문장을 싣고 다니므로
 * (`src/game/share.ts`) 누르면 그 문장이 걸린 실제 타석이 열리고 확률이 이미 움직여 있다.
 * 확률 숫자를 히어로에 직접 쓰지는 않는다 — 숫자는 언제나 엔진이 낸다(CLAUDE.md).
 */
function Hero({ target }: HeroProps) {
  const heroId = useId();
  const ctaHref = target === null ? '#/teams' : formatRoute({ screen: 'pa', ...target, share: null });
  const exampleHref = (text: string) =>
    target === null
      ? null
      : formatRoute({
          screen: 'pa',
          ...target,
          share: { sceneId: situationIdOf(target.gameId, target.no), texts: [text], mode: 'real' },
        });

  return (
    <section className={styles.hero} aria-labelledby={heroId}>
      <p className={styles.tagline}>쓸모없는 변수, 진짜 쓸모없을까?</p>

      <h2 id={heroId} className={styles.heroTitle}>
        <span>방금 그 타석,</span> <em>만약 그랬다면?</em>
      </h2>

      <p className={styles.heroLede}>
        쓸데없는 <b>TMI 한 줄</b>이면 그 타석 확률이 바뀝니다. AI가 그 말을 야구 변수로 옮기고, 엔진이 얼마나 바뀌는지
        정확히 계산해요.
      </p>

      <ul className={styles.examples} aria-label="TMI 예시">
        {EXAMPLES.map((text) => {
          const href = exampleHref(text);
          const quoted = `“${text}”`;
          return (
            <li key={text}>
              {href === null ? (
                <span className={styles.example}>{quoted}</span>
              ) : (
                <a className={styles.example} href={href}>
                  {quoted}
                </a>
              )}
            </li>
          );
        })}
      </ul>

      {/* 목적지는 바뀌어도 글은 안 바뀐다: 1.7초 뒤에 버튼 글자가 뒤집히면 그게 더 어수선하다 */}
      <a className={styles.cta} href={ctaHref}>
        아무 타석에나 TMI 걸기
        <i aria-hidden="true">›</i>
      </a>
    </section>
  );
}

/** 그 경기의 승부처 줄. 아직 못 받았으면 빈 목록 */
function picksOf(game: LiveGame | null, gameId: string, names: Record<string, string>): PaListRow[] {
  if (game === null || game.summary.gameId !== gameId) return [];
  return paList(game, { highlights: PICKS_PER_GAME, names }).filter((row) => row.highlight);
}

interface GameFeedCardProps {
  summary: GameSummary;
  picks: PaListRow[];
  /** 그 경기를 아직 받는 중 */
  waiting: boolean;
}

/** 경기 한 판: 날짜·구장 / 큰 스코어 / 승부처 두 줄 / 타석 전체. 이긴 쪽 점수를 밝게 둔다 */
function GameFeedCard({ summary, picks, waiting }: GameFeedCardProps) {
  const { away, home } = summary;
  const wonBy =
    away.score === null || home.score === null
      ? null
      : away.score > home.score
        ? 'away'
        : home.score > away.score
          ? 'home'
          : null;

  return (
    <article className={styles.card} style={{ '--away': colorOf(away.code), '--home': colorOf(home.code) } as CSSProperties}>
      <p className={styles.cardHead}>
        <b>{dateText(summary.date)}</b>
        {summary.stadium && <span>{summary.stadium}</span>}
      </p>

      <p className={styles.score}>
        <span className={styles.side} data-won={String(wonBy === 'away')}>
          <i aria-hidden="true" style={{ background: colorOf(away.code) }} />
          <b>{away.name}</b>
          <em>{away.score ?? '–'}</em>
        </span>
        <span className={styles.colon} aria-hidden="true">
          :
        </span>
        <span className={styles.side} data-side="home" data-won={String(wonBy === 'home')}>
          <em>{home.score ?? '–'}</em>
          <b>{home.name}</b>
          <i aria-hidden="true" style={{ background: colorOf(home.code) }} />
        </span>
      </p>

      <ul className={styles.picks}>
        {picks.map((row) => (
          <li key={row.no}>
            <a className={styles.pick} href={formatRoute({ screen: 'pa', gameId: summary.gameId, no: row.no, share: null })}>
              <span className={styles.pickText}>
                <b>{`${row.inningText} ${row.situationText}`}</b>
                <span>{`${row.batter} vs ${row.pitcher}`}</span>
              </span>
              <i className={styles.go} aria-hidden="true">
                ›
              </i>
            </a>
          </li>
        ))}
        {/* 승부처가 붙기까지 실측 1.7초. 그동안 빈 상자를 두면 그게 첫인상이라 들어올 줄의 뼈대를 대신 둔다 */}
        {picks.length === 0 &&
          (waiting ? (
            <>
              <li className={styles.skeleton} data-skeleton="pick" aria-hidden="true" />
              <li className={styles.skeleton} data-skeleton="pick" aria-hidden="true" />
              <li className={styles.srOnly}>승부처를 고르는 중</li>
            </>
          ) : (
            <li className={styles.waiting}>되돌려볼 타석이 없어요.</li>
          ))}
      </ul>

      <a className={styles.more} href={formatRoute({ screen: 'game', gameId: summary.gameId })}>
        이 경기 타석 전체
        <i aria-hidden="true">›</i>
      </a>
    </article>
  );
}
