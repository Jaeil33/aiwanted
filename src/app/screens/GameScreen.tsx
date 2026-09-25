import { useId, type CSSProperties } from 'react';
import { weekdayOf } from '../../domain/format';
import { nameMapOf } from '../../domain/players';
import { TEAMS, isTeamCode } from '../../domain/teams';
import { halfBlocks, paList, scoreText, type PaListRow } from '../../game';
import type { GameSummary } from '../../types/live';
import { useGame } from '../GameProvider';
import { formatRoute } from '../router';
import { useLiveGame } from '../useLiveData';
import styles from './GameScreen.module.css';
import { LiveStatus } from './LiveStatus';

/*
 * 한 경기의 전 타석(ADR-032). 위에 승부처, 아래에 반이닝마다 묶은 전체 목록.
 * 스포일러 정책: 경기 결과·스코어는 공개하고 **그 타석 결과만** 치른 뒤에 공개한다(목록에 결과 문장이 없다).
 */

/** 위에 따로 두는 승부처 개수 */
const HIGHLIGHTS = 5;

const colorOf = (code: string) => (isTeamCode(code) ? TEAMS[code].color : '#A3ADB8');

/** "9월 15일 (화)" */
function longDate(date: string): string {
  const [, month, day] = date.split('-');
  const weekday = weekdayOf(date);
  return `${Number(month)}월 ${Number(day)}일${weekday ? ` (${weekday})` : ''}`;
}

export function GameScreen({ gameId }: { gameId: string }) {
  const { platform, data } = useGame();
  const { data: game, error, loading, refresh } = useLiveGame(platform.liveApi, gameId);
  const titleId = useId();
  const picksId = useId();
  const listId = useId();

  // 중계에는 투수 이름이 없다: 번들 core 이름표를 함께 넘긴다(ADR-035)
  const rows = game === null ? [] : paList(game, { highlights: HIGHLIGHTS, names: nameMapOf(data.core) });
  const blocks = halfBlocks(rows);
  const picks = rows.filter((row) => row.highlight);

  if (game === null) {
    return (
      <section className={styles.screen} aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.srTitle}>
          타석 고르기
        </h2>
        <LiveStatus
          loading={loading}
          error={error}
          empty={platform.liveApi === null ? '이 화면에서는 경기를 불러올 수 없어요.' : '타석 기록이 없는 경기예요.'}
          onRetry={refresh}
        />
      </section>
    );
  }

  const { summary } = game;
  return (
    <section className={styles.screen} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.srTitle}>
        {`${summary.away.name} 대 ${summary.home.name} 타석 고르기`}
      </h2>
      <GameHead summary={summary} />

      {picks.length > 0 && (
        <section className={styles.block} aria-labelledby={picksId}>
          <h3 id={picksId} className={styles.blockTitle}>
            승부처
          </h3>
          <p className={styles.blockLede}>승부가 갈린 자리예요. 눌러서 그 타석을 다시 쳐 보세요.</p>
          <ul className={styles.picks} aria-label="승부처">
            {picks.map((row) => (
              <li key={row.no}>
                <PaLink gameId={gameId} row={row} showInning />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.block} aria-labelledby={listId}>
        <h3 id={listId} className={styles.blockTitle}>
          {`전체 타석 ${rows.length}개`}
        </h3>
        <ul className={styles.list} aria-label="전체 타석">
          {blocks.map((block) => (
            <li key={`${block.inning}-${block.half}`} className={styles.half}>
              <p className={styles.halfHead}>{block.inningText}</p>
              <ul className={styles.rows}>
                {block.rows.map((row) => (
                  <li key={row.no}>
                    <PaLink gameId={gameId} row={row} showInning={false} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

/**
 * 경기 머리말: 날짜·구장과 최종 점수. 결과는 공개한다(ADR-032).
 * 팀 이름은 그 팀 달력으로 가는 문이다 — 경기 안에서도 다른 일정으로 나갈 길을 둔다(20-browse-ui step 2).
 */
function GameHead({ summary }: { summary: GameSummary }) {
  const score = scoreText(summary);
  const teams = [summary.away, summary.home] as const;
  return (
    <div
      className={styles.head}
      role="group"
      aria-label="경기 결과"
      style={{ '--away': colorOf(summary.away.code), '--home': colorOf(summary.home.code) } as CSSProperties}
    >
      <p className={styles.eyebrow}>{`${longDate(summary.date)} · ${summary.stadium || '구장 미상'}`}</p>
      <div className={styles.score}>
        {teams.map((team, index) => (
          <div key={team.code} className={styles.team} data-side={index === 0 ? 'away' : 'home'}>
            {isTeamCode(team.code) ? (
              <a className={styles.teamLink} href={formatRoute({ screen: 'team', code: team.code, month: null })} aria-label={`${team.name} 일정`}>
                {team.name}
              </a>
            ) : (
              <b>{team.name}</b>
            )}
            <em>{team.score ?? '–'}</em>
          </div>
        ))}
        <span className={styles.colon} aria-hidden="true">
          :
        </span>
      </div>
      {score === '' && <p className={styles.eyebrow}>아직 점수가 없는 경기예요.</p>}
    </div>
  );
}

/** 타석 한 줄. 결과 문장은 담지 않는다 */
function PaLink({ gameId, row, showInning }: { gameId: string; row: PaListRow; showInning: boolean }) {
  return (
    <a className={styles.pa} href={formatRoute({ screen: 'pa', gameId, no: row.no, share: null })}>
      <span className={styles.paWhere}>
        {showInning && <b>{row.inningText}</b>}
        <small>{row.situationText}</small>
      </span>
      <span className={styles.paWho}>
        <b>{row.batter}</b>
        <i aria-hidden="true">vs</i>
        <span>{row.pitcher}</span>
      </span>
      <span className={styles.paSide}>
        <span className={styles.paScore}>{`${row.score.away} : ${row.score.home}`}</span>
        {!row.hasActual && <span className={styles.paNote}>기록 없음</span>}
      </span>
    </a>
  );
}
