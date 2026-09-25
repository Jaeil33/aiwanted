import { useId, useState, type CSSProperties } from 'react';
import { nameMapOf } from '../../domain/players';
import { TEAMS, isTeamCode } from '../../domain/teams';
import { calendarWeeks, monthOf, monthRange, paList, scoreText, shiftMonth, type CalendarCell } from '../../game';
import type { TeamCode } from '../../types/data';
import type { GameSummary } from '../../types/live';
import { useGame } from '../GameProvider';
import { formatRoute } from '../router';
import { useHashRoute } from '../useHashRoute';
import { useGames, useLiveGame } from '../useLiveData';
import { LiveStatus } from './LiveStatus';
import styles from './TeamScreen.module.css';

/*
 * 한 팀의 월 달력(ADR-032). 칸에는 날짜·승패·상대 팀·스코어를 둔다(내 팀 점수가 앞이다).
 * 날짜를 누르면 달력 아래에 그 경기 카드가 펼쳐져 구장과 승부처를 보여준다.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** 펼친 카드에 두는 승부처 개수 */
const CARD_HIGHLIGHTS = 3;

const colorOf = (code: string | null) => (code !== null && isTeamCode(code) ? TEAMS[code].color : '#6A7581');

/** "2026년 9월" */
const monthText = (month: string) => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`;
/** "9월 2일" */
const dayText = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일`;

export function TeamScreen({ code, month }: { code: TeamCode; month: string | null }) {
  const { platform } = useGame();
  const [, setRoute] = useHashRoute();
  const today = platform.today();
  const shown = month ?? monthOf(today);
  const { data: games, error, loading, refresh } = useGames(platform.liveApi, monthRange(shown));
  // 펼친 날짜에 달·팀을 함께 담는다: 달을 옮기면 저절로 닫힌다(효과 안에서 setState를 부르지 않는다)
  const [picked, setPicked] = useState<{ key: string; date: string } | null>(null);
  const titleId = useId();

  const pageKey = `${code}|${shown}`;
  const openDate = picked !== null && picked.key === pageKey ? picked.date : null;
  const weeks = calendarWeeks(shown, games ?? [], code);
  const open = weeks.flat().find((cell) => cell.date === openDate)?.game ?? null;
  const atLatest = shown >= monthOf(today);
  const openCell = (date: string) => setPicked({ key: pageKey, date });

  return (
    <section className={styles.screen} aria-labelledby={titleId}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.nav}
          onClick={() => setRoute({ screen: 'team', code, month: shiftMonth(shown, -1) })}
        >
          이전 달
        </button>
        <h2 id={titleId} className={styles.title}>
          {`${TEAMS[code].name} · ${monthText(shown)}`}
        </h2>
        <button
          type="button"
          className={styles.nav}
          disabled={atLatest}
          onClick={() => setRoute({ screen: 'team', code, month: shiftMonth(shown, 1) })}
        >
          다음 달
        </button>
      </div>

      <table className={styles.calendar} role="grid" aria-label={`${monthText(shown)} 일정`}>
        <thead>
          <tr>
            {WEEKDAYS.map((day) => (
              <th key={day} scope="col">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, i) => (
            <tr key={week.find((cell) => cell.date !== null)?.date ?? i} role="row">
              {week.map((cell, j) => (
                <Cell key={cell.date ?? `empty-${j}`} cell={cell} open={cell.date !== null && cell.date === openDate} onOpen={openCell} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <LiveStatus
        loading={loading}
        error={error}
        empty={platform.liveApi === null ? '이 화면에서는 일정을 불러올 수 없어요.' : undefined}
        onRetry={refresh}
      />

      {open !== null && <GameCard summary={open} />}
    </section>
  );
}

/** 칸을 읽어 주는 이름: "9월 15일 두산 무 3:3". 색만으로 승패를 알리지 않는다 */
function cellLabel(cell: CalendarCell): string {
  const day = dayText(cell.date as string);
  if (cell.game === null) return day;
  const opponent = TEAMS[cell.opponent as TeamCode]?.name ?? cell.opponent ?? '';
  const score = cell.score === null ? '' : `${cell.score.mine}:${cell.score.theirs}`;
  return [day, opponent, cell.result ?? '', score].filter((part) => part !== '').join(' ');
}

/** 달력 칸 하나. 경기가 없으면 날짜만 */
function Cell({ cell, open, onOpen }: { cell: CalendarCell; open: boolean; onOpen(date: string): void }) {
  if (cell.date === null) return <td className={styles.cell} role="presentation" aria-hidden="true" />;
  const label = cellLabel(cell);
  if (cell.game === null) {
    return (
      <td className={styles.cell} role="gridcell" aria-label={label}>
        <span className={styles.day}>{cell.day}</span>
      </td>
    );
  }
  return (
    <td className={styles.cell} role="gridcell" aria-label={label} data-open={String(open)} data-result={cell.result ?? 'none'}>
      <button
        type="button"
        className={styles.cellButton}
        style={{ '--c': colorOf(cell.opponent) } as CSSProperties}
        aria-label={label}
        aria-expanded={open}
        onClick={() => onOpen(cell.date as string)}
      >
        <span className={styles.top}>
          <span className={styles.day}>{cell.day}</span>
          {cell.result !== null && (
            <span className={styles.result} data-result={cell.result}>
              {cell.result}
            </span>
          )}
        </span>
        <span className={styles.opponent}>
          <i aria-hidden="true" />
          {cell.home ? '' : '@'}
          {TEAMS[cell.opponent as TeamCode]?.name ?? cell.opponent}
        </span>
        {cell.score !== null && <span className={styles.score}>{`${cell.score.mine}:${cell.score.theirs}`}</span>}
      </button>
    </td>
  );
}

/** 펼쳐진 경기 카드: 스코어·구장과 승부처 바로가기 */
function GameCard({ summary }: { summary: GameSummary }) {
  const { platform, data } = useGame();
  const { data: game, error, loading, refresh } = useLiveGame(platform.liveApi, summary.gameId);
  const picks = game === null ? [] : paList(game, { highlights: CARD_HIGHLIGHTS, names: nameMapOf(data.core) }).filter((row) => row.highlight);

  return (
    <div className={styles.card} role="group" aria-label="고른 경기">
      <p className={styles.cardHead}>{`${dayText(summary.date)} · ${summary.stadium || '구장 미상'}`}</p>
      <div className={styles.cardScore}>
        <b>{summary.away.name}</b>
        <em>{scoreText(summary) || '– : –'}</em>
        <b>{summary.home.name}</b>
      </div>
      <ul className={styles.cardPicks}>
        {picks.map((row) => (
          <li key={row.no}>
            <a className={styles.cardPick} href={formatRoute({ screen: 'pa', gameId: summary.gameId, no: row.no, share: null })}>
              <b>{`${row.inningText} ${row.situationText}`}</b>
              <span>{`${row.batter} vs ${row.pitcher}`}</span>
            </a>
          </li>
        ))}
      </ul>
      <LiveStatus loading={loading} error={error} onRetry={refresh} />
      <a className={styles.cardMore} href={formatRoute({ screen: 'game', gameId: summary.gameId })}>
        타석 전체 보기
      </a>
    </div>
  );
}
