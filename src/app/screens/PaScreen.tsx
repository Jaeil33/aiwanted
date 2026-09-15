import { useEffect, useMemo, useRef, useState } from 'react';
import { BroadcastBug } from '../../components/BroadcastBug';
import controls from '../../components/controls.module.css';
import { OddsPanel } from '../../components/OddsPanel';
import { PitchTracker, type PitchTrackerHandle, type PlayerCaption } from '../../components/PitchTracker';
import { ResultSheet } from '../../components/ResultSheet';
import { TmiSheet } from '../../components/TmiSheet';
import { EVIDENCE_LABEL, josa } from '../../domain/format';
import { batterFor, canEditTmi, type SceneSetup } from '../../game';
import { actualResultText, eventValue, gradeOf, oddsHeadline, statLine, thousandSplit, winLine } from '../../game/headline';
import { useGame } from '../GameProvider';
import { formatRoute } from '../router';
import { usePaOdds } from '../usePaOdds';
import { usePlayback } from '../usePlayback';
import styles from './PaScreen.module.css';

const MAX_TMIS = 3;
/** 타석이 끝난 뒤 마지막 콜을 보여주고 결과 카드를 여는 간격 */
const RESULT_DELAY_MS = 1100;
const BATS_LABEL = { L: '좌타', R: '우타', S: '양타' } as const;
const THROWS_LABEL = { L: '좌투', R: '우투' } as const;

/** 타석 화면(ADR-016): 스코어버그 → 트래커 → 실제 결과 → 확률 판 → 걸린 TMI → 도크. TMI·결과는 시트 */
export function PaScreen() {
  const { setup, session } = useGame();
  if (!setup || !session.live) {
    return (
      <section className={styles.opening} aria-labelledby="pa-opening-title">
        <h2 id="pa-opening-title" className={styles.openingTitle}>
          타석을 여는 중…
        </h2>
      </section>
    );
  }
  return <PaBoard key={setup.scene.id} setup={setup} />;
}

function PaBoard({ setup }: { setup: SceneSetup }) {
  const { session, actions, data, platform } = useGame();
  const trackerRef = useRef<PitchTrackerHandle>(null);
  const odds = usePaOdds();
  const playback = usePlayback(trackerRef);
  const [sheet, setSheet] = useState<'tmi' | 'result' | null>(null);
  const [shareNote, setShareNote] = useState('');

  const { scene } = setup;
  const { state } = scene;
  const player = (id: string) => (Object.hasOwn(data.core.players, id) ? data.core.players[id] : undefined);
  const batter = batterFor(setup, state);
  const batterRecord = player(batter.id);
  const pitcherRecord = player(scene.pitcher);
  const pitcherName = setup.promptContext.pitcher.name;

  const batterCaption = useMemo<PlayerCaption>(
    () => ({
      role: '타자',
      name: batter.name,
      hand: BATS_LABEL[batterRecord?.bats ?? 'R'],
      stats: statLine(batterRecord, 'H'),
      color: setup.teamColors[setup.batSide],
    }),
    [batter.name, batterRecord, setup],
  );
  const pitcherCaption = useMemo<PlayerCaption>(
    () => ({
      role: '투수',
      name: pitcherName,
      hand: THROWS_LABEL[pitcherRecord?.throws ?? 'R'],
      stats: statLine(pitcherRecord, 'P'),
      color: setup.teamColors[setup.fieldSide],
    }),
    [pitcherName, pitcherRecord, setup],
  );
  const zone = useMemo(() => {
    const first = scene.actual.pitches[0];
    return first ? { top: first[14], bottom: first[15] } : null;
  }, [scene]);

  const effective = session.tmis.filter((entry) => !entry.interpretation.refused);
  const hasTmi = effective.length > 0;
  const headline = odds.base && odds.tmi ? oddsHeadline({ batterName: batter.name, actualEvent: scene.actual.event, base: odds.base.pa, tmi: odds.tmi.pa }) : null;
  const win = odds.base && odds.tmi ? winLine({ teamName: scene[setup.batSide].name, batSide: setup.batSide, base: odds.base, tmi: odds.tmi }) : null;
  const toon = hasTmi && odds.toon ? eventValue(odds.toon.pa, scene.actual.event) : null;
  const counts = useMemo(
    () => ({ tmi: odds.tmi ? thousandSplit(odds.tmi.pa) : [], base: odds.base ? thousandSplit(odds.base.pa) : [] }),
    [odds.tmi, odds.base],
  );

  const played = session.log.length > 0;
  const playing = playback.busy || session.status === 'animating';
  const canEdit = canEditTmi(session) && !playing;

  // 열 때·다시 할 때: 실제 결과의 투구를 번호 원으로 찍어 둔다
  useEffect(() => {
    if (!played && !playing) trackerRef.current?.markPitches(scene.actual.pitches);
  }, [played, playing, scene]);

  // 타석이 끝나면 마지막 콜을 잠깐 보여준 뒤 결과 카드를 연다
  const logLength = session.log.length;
  useEffect(() => {
    if (logLength === 0) return;
    trackerRef.current?.setSkipping(false);
    const timer = setTimeout(() => setSheet('result'), RESULT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [logLength]);

  // 화면의 확률은 모두 현실 모드다(ADR-019): 공유 링크가 만화 모드로 열었으면 되돌린다
  const { mode } = session;
  const editable = canEditTmi(session);
  useEffect(() => {
    if (mode !== 'real' && editable) actions.setMode('real');
  }, [mode, editable, actions]);

  const examples = useMemo(
    () => [
      `${josa(pitcherName, '이/가')} 경기 전 짜장면 곱빼기를 먹었다`,
      `${josa(batter.name, '이/가')} 어젯밤 3시간밖에 못 잤다`,
      '오늘 기온 35도, 폭염',
      '원정팀이 버스로 5시간 이동했다',
    ],
    [pitcherName, batter.name],
  );

  const startPa = () => {
    setShareNote('');
    void playback.finishPa();
  };
  const again = () => {
    setSheet(null);
    setShareNote('');
    trackerRef.current?.setSkipping(false);
    actions.resetPlay();
  };
  const share = async () => {
    const texts = effective.map((entry) => entry.text);
    const hash = formatRoute({ screen: 'play', sceneId: scene.id, share: texts.length > 0 ? { sceneId: scene.id, texts, mode: 'real' } : null });
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

  const [, month, day] = scene.date.split('-');
  const backHref = formatRoute({ screen: 'home' });

  let dock: React.ReactNode;
  if (playing) {
    dock = (
      <button type="button" className={controls.primary} onClick={() => trackerRef.current?.setSkipping(true)}>
        건너뛰기
      </button>
    );
  } else if (played) {
    dock = (
      <>
        <button type="button" className={`${controls.secondary} ${styles.small}`} onClick={again}>
          같은 TMI로 다시
        </button>
        <button type="button" className={controls.primary} onClick={() => setSheet('result')}>
          결과 보기
        </button>
      </>
    );
  } else if (!hasTmi) {
    dock = (
      <>
        <button type="button" className={`${controls.secondary} ${styles.small}`} onClick={() => void trackerRef.current?.replay(scene.actual.pitches)}>
          실제 투구 보기
        </button>
        <button type="button" className={controls.primary} onClick={() => setSheet('tmi')}>
          TMI 걸기
        </button>
        <button type="button" className={`${controls.secondary} ${styles.small}`} onClick={startPa}>
          한 타석 쳐보기
        </button>
      </>
    );
  } else {
    dock = (
      <>
        <button type="button" className={`${controls.secondary} ${styles.small}`} onClick={() => setSheet('tmi')}>
          TMI 추가
        </button>
        <button type="button" className={controls.primary} onClick={startPa}>
          한 타석 쳐보기
        </button>
        <button type="button" className={`${controls.secondary} ${styles.small}`} onClick={() => void trackerRef.current?.replay(scene.actual.pitches)}>
          실제 투구 보기
        </button>
      </>
    );
  }
  const dockCount = playing ? 1 : played ? 2 : 3;

  return (
    <div className={styles.screen}>
      <BroadcastBug
        away={{ name: scene.away.name, color: setup.teamColors.away, score: state.away }}
        home={{ name: scene.home.name, color: setup.teamColors.home, score: state.home }}
        inning={state.inning}
        half={state.half}
        outs={state.outs}
        bases={state.bases}
        balls={session.live ? session.live.balls : 0}
        strikes={session.live ? session.live.strikes : 0}
        backHref={backHref}
      />
      <PitchTracker ref={trackerRef} bases={state.bases} zone={zone} batter={batterCaption} pitcher={pitcherCaption} />
      <div className={styles.context}>
        <h2 className={controls.srOnly}>{scene.title}</h2>
        <span className={styles.when}>{`${Number(month)}월 ${Number(day)}일 · ${scene.stadium}`}</span>
        <span className={styles.actual}>{`실제: ${actualResultText(scene.actual.result)}`}</span>
      </div>
      <OddsPanel headline={headline} hasTmi={hasTmi} grade={gradeOf(session.tmis)} win={win} teamColor={setup.teamColors[setup.batSide]} />
      {session.tmis.length > 0 && (
        <div className={styles.rail}>
          <ul className={styles.pills}>
            {session.tmis.map((entry) => {
              const grade = entry.interpretation.refused ? null : gradeOf([entry]);
              return (
                <li key={entry.id}>
                  <button type="button" className={styles.pill} data-grade={grade ?? 'refused'} onClick={() => setSheet('tmi')} aria-label={`TMI ${entry.text} 보기`}>
                    <i aria-hidden="true" />
                    <span className={styles.pillText}>{entry.text}</span>
                    <small>{grade ? EVIDENCE_LABEL[grade] : '계산 안 함'}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className={styles.fill} />
      <nav className={styles.dock} data-count={dockCount} aria-label="타석 조작">
        {dock}
      </nav>

      <TmiSheet
        open={sheet === 'tmi'}
        onClose={() => setSheet(null)}
        headline={headline}
        hasTmi={hasTmi}
        tmis={session.tmis}
        verdicts={session.verdicts}
        judgingId={session.judgingId}
        canEdit={canEdit}
        busy={session.interpreting}
        max={MAX_TMIS}
        notice={session.notice}
        examples={examples}
        onSubmit={(text) => void actions.submitTmi(text)}
        onRemove={(id) => actions.removeTmi(id)}
        onJudge={(id) => void actions.judge(id)}
      />
      {headline && played && (
        <ResultSheet
          open={sheet === 'result'}
          onClose={() => setSheet(null)}
          playedHeadline={session.log[0].headline}
          actualText={`실제: ${actualResultText(scene.actual.result)}`}
          headline={headline}
          counts={counts}
          hasTmi={hasTmi}
          win={win}
          toon={toon}
          onReplay={again}
          onShare={() => void share()}
          shareNote={shareNote}
        />
      )}
    </div>
  );
}
