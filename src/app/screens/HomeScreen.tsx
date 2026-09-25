import { useId, useState, type CSSProperties } from 'react';
import { TeamStrip } from '../../components/TeamStrip';
import { weekdayOf } from '../../domain/format';
import { nameMapOf } from '../../domain/players';
import { TEAMS, isTeamCode } from '../../domain/teams';
import { addDays, gamesOfTeam, paList, recentFinished, type PaListRow } from '../../game';
import type { TeamCode } from '../../types/data';
import type { GameSummary, LiveGame } from '../../types/live';
import { useGame } from '../GameProvider';
import { formatRoute } from '../router';
import { useFavouriteTeam } from '../useFavouriteTeam';
import { useGames, useLiveGame } from '../useLiveData';
import styles from './HomeScreen.module.css';
import { LiveStatus } from './LiveStatus';

/*
 * 홈: 추천 승부처 피드(ADR-032). **늘 리그 전체에서 뽑는다.**
 *
 * 응원팀은 거르는 값이 아니다(20-browse-ui step 1). 한 번 팀을 골랐다고 계속 그 팀만 보이면
 * 다른 경기로 갈 길이 사라진다. 응원팀은 "내 팀" 표와 거르기 단추로만 쓰고, 그 단추는 저장하지 않는다 —
 * 다시 들어오면 리그 전체다(저장하는 값은 응원팀 하나뿐, ADR-034).
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

const colorOf = (code: string) => (isTeamCode(code) ? TEAMS[code].color : '#6A7581');

/** "9.25 (금)" */
function dateText(date: string): string {
  const day = `${Number(date.slice(5, 7))}.${Number(date.slice(8))}`;
  const weekday = weekdayOf(date);
  return weekday ? `${day} (${weekday})` : day;
}

export function HomeScreen() {
  const { platform, data } = useGame();
  const [team] = useFavouriteTeam();
  // 거르기는 이 화면을 떠나면 사라진다: 주소에도 저장소에도 두지 않는다
  const [mineOnly, setMineOnly] = useState(false);
  const today = platform.today();
  const { data: games, error, loading, refresh } = useGames(platform.liveApi, { from: addDays(today, -FEED_DAYS), to: today });
  const feedId = useId();

  const filtered = mineOnly && team !== null;
  const picked = recentFinished(gamesOfTeam(games ?? [], filtered ? team : null), FEED_GAMES);
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

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <p className={styles.tagline}>쓸모없는 변수, 진짜 쓸모없을까?</p>
        <TeamStrip />
      </div>

      <section className={styles.feed} aria-labelledby={feedId}>
        <div className={styles.feedHead}>
          <h2 id={feedId} className={styles.feedTitle}>
            {filtered ? `${TEAMS[team].name} 승부처` : '최근 승부처'}
          </h2>
          {team !== null && (
            <div className={styles.filter} role="group" aria-label="보기">
              <button type="button" className={styles.chip} aria-pressed={!mineOnly} onClick={() => setMineOnly(false)}>
                전체
              </button>
              <button
                type="button"
                className={styles.chip}
                style={{ '--c': colorOf(team) } as CSSProperties}
                aria-pressed={mineOnly}
                onClick={() => setMineOnly(true)}
              >
                {`${TEAMS[team].name}만`}
              </button>
            </div>
          )}
        </div>
        <p className={styles.lede}>승부가 갈린 타석이에요. 눌러서 그 자리에 들어가 다시 쳐 보세요.</p>

        <ul className={styles.cards} aria-label="추천 승부처">
          {cards.map(({ summary, picks, waiting }) => (
            <li key={summary.gameId}>
              <GameFeedCard summary={summary} picks={picks} waiting={waiting} team={team} />
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
                ? filtered
                  ? `최근 2주에 끝난 ${TEAMS[team].name} 경기가 없어요.`
                  : '최근 2주에 끝난 경기가 없어요.'
                : undefined
          }
          onRetry={refresh}
        />
      </section>
    </div>
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
  team: TeamCode | null;
}

/** 경기 한 판: 날짜·구장 / 큰 스코어 / 승부처 두 줄 / 타석 전체. 이긴 쪽 점수를 밝게 둔다 */
function GameFeedCard({ summary, picks, waiting, team }: GameFeedCardProps) {
  const { away, home } = summary;
  const mine = team !== null && (away.code === team || home.code === team);
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
        {mine && <em className={styles.mine}>내 팀</em>}
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
        {picks.length === 0 && (
          <li className={styles.waiting}>{waiting ? '승부처를 고르는 중…' : '되돌려볼 타석이 없어요.'}</li>
        )}
      </ul>

      <a className={styles.more} href={formatRoute({ screen: 'game', gameId: summary.gameId })}>
        이 경기 타석 전체
        <i aria-hidden="true">›</i>
      </a>
    </article>
  );
}
