import { useId, useState, type CSSProperties } from 'react';
import { UniverseDots } from '../../components/UniverseDots';
import { EVIDENCE_LABEL, formatDeltaPp, formatPct } from '../../domain/format';
import type { Evaluation } from '../../engine';
import { actualResultText, gradeOf } from '../../game/headline';
import { deciderLine, effectLabel, splitThousand, tmiShortLabel } from '../../game/result';
import { nameOf, type SceneSetup } from '../../game/scene';
import { butterflyPp } from '../../game/selectors';
import type { SessionState } from '../../game/session';
import type { Side } from '../../types/domain';
import { useGame } from '../GameProvider';
import { formatRoute } from '../router';
import { useHashRoute } from '../useHashRoute';
import { useEvaluationPair } from '../useSceneEvaluations';
import styles from './ResultScreen.module.css';

const SOURCES = '기록·중계: 네이버 스포츠(KBO) · 날씨: Open-Meteo · 확률: TMI 야구 엔진 계산값';
const TIE_COLOR = '#3A434D';
const MODE_CHIP = { real: '현실', toon: '만화 ×6' } as const;

type Final = NonNullable<SessionState['final']>;

/** 결과(UI_GUIDE 결과, 중계 시안 4): 최종 점수 머리말 → 평행우주 1,000경기 → 나비효과 → 실제 결과(눌러야 열림) → 다시·공유 */
export function ResultScreen() {
  const { setup, session } = useGame();
  if (!setup || !session.final) {
    return (
      <section className={styles.empty} aria-labelledby="result-empty-title">
        <h2 id="result-empty-title" className={styles.emptyTitle}>
          결과가 아직 없어요
        </h2>
      </section>
    );
  }
  return <ResultBoard key={setup.scene.id} setup={setup} final={session.final} />;
}

const winOf = (ev: Evaluation, side: Side) => (side === 'home' ? ev.winHome : ev.winAway);

function ResultBoard({ setup, final }: { setup: SceneSetup; final: Final }) {
  const { session, actions, platform } = useGame();
  const [, setRoute] = useHashRoute();
  // 평행우주·나비효과는 장면 시작 상태의 평가: TMI 없음(현실) 대 세션 TMI·모드
  const pair = useEvaluationPair(setup.scene.state, true, true);
  const [opened, setOpened] = useState(false);
  const [shareNote, setShareNote] = useState('');
  const dotsTitleId = useId();

  const { scene, batSide, fieldSide } = setup;
  const { mode } = session;
  const effective = session.tmis.filter((entry) => !entry.interpretation.refused);
  const hasTmi = effective.length > 0;
  const grade = hasTmi ? gradeOf(session.tmis) : null;

  const winner = final.winner;
  const winColor = winner === 'tie' ? TIE_COLOR : setup.teamColors[winner];
  const heading = winner === 'tie' ? '무승부' : `${scene[winner].name} 승리`;
  const decider = deciderLine({ title: scene.title, start: scene.state, log: session.log, final, teams: { away: scene.away.name, home: scene.home.name } });

  const legend =
    pair.base && pair.tmi
      ? (() => {
          const split = (ev: Evaluation) => splitThousand([winOf(ev, batSide), ev.tie, winOf(ev, fieldSide)]);
          const now = split(pair.tmi);
          const before = split(pair.base);
          const probs = [winOf(pair.tmi, batSide), pair.tmi.tie, winOf(pair.tmi, fieldSide)];
          return [
            { label: `${scene[batSide].name} 승`, color: setup.teamColors[batSide] },
            { label: '무승부', color: TIE_COLOR },
            { label: `${scene[fieldSide].name} 승`, color: setup.teamColors[fieldSide] },
          ].map((g, i) => ({ ...g, n: now[i], base: before[i], p: probs[i] }));
        })()
      : null;

  const pp = pair.base && pair.tmi ? butterflyPp(pair.base, pair.tmi, batSide) : null;
  const ppText = pp === null ? null : formatDeltaPp(pp / 100);
  const trend = ppText === null ? null : ppText.startsWith('+') ? 'up' : ppText.startsWith('−') ? 'down' : 'flat';
  const first = effective[0];
  // 선수 이름 먼저, 그다음 "투수가 …" 같은 일반 주어를 뗀다
  const names = [setup.promptContext.batter.name, setup.promptContext.pitcher.name, '투수', '타자', '포수', '감독'];
  const firstPart = first?.interpretation.parts[0];

  const truthLine = `실제: ${nameOf(setup, scene.batter)} ${actualResultText(scene.actual.result)}${scene.actual.runs ? `, ${scene.actual.runs}점` : ''}`;
  const naver =
    scene.naverWpBeforeHome !== null && scene.actual.wpAfterHome !== null
      ? ` · 네이버 ${scene.home.name} 승리확률 ${formatPct(scene.naverWpBeforeHome)} → ${formatPct(scene.actual.wpAfterHome)}`
      : '';
  const finalLine = `최종 ${scene.away.name} ${scene.away.final} : ${scene.home.final} ${scene.home.name}${naver}`;

  const replay = () => {
    setShareNote('');
    actions.resetPlay();
    setRoute({ screen: 'play', sceneId: scene.id, share: null });
  };
  const share = async () => {
    const texts = effective.map((entry) => entry.text);
    const hash = formatRoute({ screen: 'play', sceneId: scene.id, share: texts.length > 0 ? { sceneId: scene.id, texts, mode } : null });
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    if (!platform.shareLink) {
      setShareNote('이 화면에서는 공유할 수 없어요. 주소창의 링크를 복사해 주세요.');
      return;
    }
    const outcome = await platform.shareLink(url, `TMI 야구 — ${scene.title}`);
    setShareNote(
      outcome === 'shared' ? '공유했어요.' : outcome === 'copied' ? '링크를 복사했어요.' : outcome === 'cancelled' ? '' : '공유하지 못했어요. 주소창의 링크를 복사해 주세요.',
    );
  };

  const teams = [
    { side: 'away', name: scene.away.name, score: final.state.away },
    { side: 'home', name: scene.home.name, score: final.state.home },
  ] as const;

  return (
    <div className={styles.screen}>
      <header className={styles.final} style={{ '--win': winColor } as CSSProperties}>
        <p className={styles.eyebrow}>경기 종료 · 다시 치른 결과</p>
        <div className={styles.finalScore} role="group" aria-label={`최종 점수 ${teams[0].name} ${teams[0].score}, ${teams[1].name} ${teams[1].score}`}>
          {teams.map((team, index) => (
            <div key={team.side} className={styles.fsTeam} data-win={String(winner === team.side)} data-tie={String(winner === 'tie')} style={{ order: index * 2 }}>
              <b>{team.name}</b>
              <em>{team.score}</em>
            </div>
          ))}
          <span className={styles.colon} aria-hidden="true">
            :
          </span>
        </div>
        <h2 className={styles.title}>{heading}</h2>
        <p className={styles.decider}>{decider}</p>
      </header>

      <div className={styles.body}>
        <section className={styles.card} aria-labelledby={dotsTitleId}>
          <div className={styles.cardHead}>
            <h3 id={dotsTitleId}>평행우주 1,000경기</h3>
            <span className={styles.headSide}>
              {hasTmi && mode === 'toon' && (
                <span className={styles.chip} data-mode="toon">
                  {MODE_CHIP.toon}
                </span>
              )}
              {grade && (
                <span className={styles.grade} data-grade={grade}>
                  {EVIDENCE_LABEL[grade]}
                </span>
              )}
              <span className={styles.cardNote}>엔진 확률의 기대값</span>
            </span>
          </div>
          {legend ? (
            <>
              <div className={styles.dotsBox}>
                <UniverseDots groups={legend.map(({ label, n, color }) => ({ label, n, color }))} />
              </div>
              <ul className={styles.legend} aria-label="범례">
                {legend.map((g) => {
                  const d = g.n - g.base;
                  return (
                    <li key={g.label} style={{ '--c': g.color } as CSSProperties}>
                      <small>{g.label}</small>
                      <b>{g.n}</b>
                      {hasTmi ? (
                        <em>
                          {`TMI 없이 ${g.base}`}
                          {d !== 0 && <span data-trend={d > 0 ? 'up' : 'down'}>{` ${d > 0 ? '+' : '−'}${Math.abs(d)}`}</span>}
                        </em>
                      ) : (
                        <em>{formatPct(g.p)}</em>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className={styles.pending} aria-busy="true">
              계산 중…
            </p>
          )}
        </section>

        <section className={`${styles.card} ${styles.butterfly}`} aria-label="나비효과">
          <div className={styles.bfText}>
            <p className={styles.kicker}>나비효과</p>
            {first ? (
              <p className={styles.bfLine}>
                <span>{tmiShortLabel(first.text, names)}</span>
                {/* 줄이 넘치면 화살표와 효과가 함께 다음 줄로 간다 */}
                <span className={styles.effect}>
                  <i aria-hidden="true">→</i>
                  <span>{firstPart ? effectLabel(firstPart) : '효과 없음'}</span>
                </span>
                {effective.length > 1 && <span className={styles.more}>{`외 ${effective.length - 1}개`}</span>}
              </p>
            ) : (
              <p className={styles.bfLine}>TMI 없이 다시 치렀어요</p>
            )}
            <p className={styles.chips}>
              <span className={styles.chip} data-mode={mode}>
                {MODE_CHIP[mode]}
              </span>
              {grade && (
                <span className={styles.grade} data-grade={grade}>
                  {EVIDENCE_LABEL[grade]}
                </span>
              )}
            </p>
          </div>
          {ppText === null ? (
            <b className={styles.bfNum} data-trend="flat" aria-busy="true">
              …
            </b>
          ) : (
            <b className={styles.bfNum} data-trend={trend ?? 'flat'} aria-label={`${scene[batSide].name} 승리확률 변화 ${ppText}`}>
              {ppText.replace('%p', '')}
              <small>%p</small>
            </b>
          )}
        </section>

        <section className={`${styles.card} ${styles.sealed}`} aria-label="실제 결과">
          {opened ? (
            <div className={styles.truth} aria-live="polite">
              <b>{truthLine}</b>
              <span>{finalLine}</span>
            </div>
          ) : (
            <>
              <p>실제 경기는 어떻게 끝났을까요?</p>
              <button type="button" className={`${styles.btn} ${styles.quiet} ${styles.small}`} onClick={() => setOpened(true)}>
                실제 결과 열기
              </button>
            </>
          )}
        </section>

        <p className={styles.sources}>{SOURCES}</p>
      </div>

      <nav className={styles.dock} aria-label="결과 조작">
        <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={replay}>
          같은 TMI로 다시
        </button>
        <button type="button" className={`${styles.btn} ${styles.quiet}`} onClick={() => void share()}>
          결과 카드 공유
        </button>
        {shareNote && (
          <p className={styles.note} aria-live="polite">
            {shareNote}
          </p>
        )}
      </nav>
    </div>
  );
}
