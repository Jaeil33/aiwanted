import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BroadcastBug } from '../../components/BroadcastBug';
import controls from '../../components/controls.module.css';
import { PitchTracker, type PitchTrackerHandle, type PlayerCaption } from '../../components/PitchTracker';
import { TmiRail, type QuickTmi, type RailPill, type TmiInvite } from '../../components/TmiRail';
import { TmiSheet } from '../../components/TmiSheet';
import { WpPanel } from '../../components/WpPanel';
import { josa } from '../../domain/format';
import { hitterOf, pitcherOf } from '../../domain/players';
import { batterFor, canEditMode, canEditTmi, canStopHere, pitcherFor, type SituationSetup } from '../../game';
import { sparkSeries, tierReadout, tmiPill, type Tier } from '../../game/broadcast';
import { skyKindOf } from '../../stage/math/sky';
import { gradeOf, statLine } from '../../game/headline';
import { tmiShortLabel } from '../../game/result';
import { nameOf } from '../../game/situation';
import type { Side } from '../../types/domain';
import { useGame } from '../GameProvider';
import { formatRoute } from '../router';
import { useHashRoute } from '../useHashRoute';
import { usePlayback } from '../usePlayback';
import { useSceneEvaluations } from '../useSceneEvaluations';
import { useSparkHistory } from '../useSparkHistory';
import { useTmiContributions } from '../useTmiContributions';
import styles from './PlayScreen.module.css';

const MAX_TMIS = 3;
/** 경기가 끝난 뒤 마지막 콜을 보여주고 결과 화면으로 가는 간격 */
const RESULT_DELAY_MS = 1400;
const BATS_LABEL = { L: '좌타', R: '우타', S: '양타' } as const;
const THROWS_LABEL = { L: '좌투', R: '우투' } as const;

/** 플레이(시안 2번 화면, ADR-025): 스코어버그 → 포수 뒤 트래커 → 승부 확률 판 → 걸린 TMI 줄 → 세 버튼 도크. TMI는 시트 */
export function PlayScreen() {
  const { setup, session } = useGame();
  if (!setup || !session.live) {
    return (
      <section className={styles.opening} aria-labelledby="play-opening-title">
        <h2 id="play-opening-title" className={styles.openingTitle}>
          장면을 여는 중…
        </h2>
      </section>
    );
  }
  return <PlayBoard key={setup.situation.id} setup={setup} />;
}

function PlayBoard({ setup }: { setup: SituationSetup }) {
  const { session, actions, data } = useGame();
  const trackerRef = useRef<PitchTrackerHandle>(null);
  const evaluations = useSceneEvaluations();
  const playback = usePlayback(trackerRef);
  const contributions = useTmiContributions();
  const history = useSparkHistory(evaluations.tmiGauge, evaluations.pending);
  const [, setRoute] = useHashRoute();
  const [tier, setTier] = useState<Tier>('game');
  const [sheetOpen, setSheetOpen] = useState(false);
  /** 초대 판·"+ TMI 걸기"로 열면 입력칸에 바로 초점을 둔다 */
  const [sheetFocus, setSheetFocus] = useState(false);

  const { situation, promptContext } = setup;
  const live = session.live;
  const state = live ? live.state : situation.state;
  const batSide: Side = state.half === 0 ? 'away' : 'home';
  const fieldSide: Side = batSide === 'away' ? 'home' : 'away';

  const batter = batterFor(setup, state);
  const batterRecord = hitterOf(data.core, batter.id) ?? undefined;
  const pitcherId = pitcherFor(setup, state).id;
  const pitcherName = nameOf(setup, pitcherId);
  const pitcherRecord = pitcherOf(data.core, pitcherId) ?? undefined;
  const pitcherThrows = Object.hasOwn(setup.hands, pitcherId) ? setup.hands[pitcherId].throws : undefined;

  const batterCaption = useMemo<PlayerCaption>(
    () => ({ role: '타자', name: batter.name, hand: BATS_LABEL[batterRecord?.bats ?? 'R'], stats: statLine(batterRecord, 'H'), color: setup.teamColors[batSide] }),
    [batter.name, batterRecord, setup, batSide],
  );
  const pitcherCaption = useMemo<PlayerCaption>(
    () => ({ role: '투수', name: pitcherName, hand: THROWS_LABEL[pitcherThrows ?? 'R'], stats: statLine(pitcherRecord, 'P'), color: setup.teamColors[fieldSide] }),
    [pitcherName, pitcherThrows, pitcherRecord, setup, fieldSide],
  );
  const zone = useMemo(() => {
    const first = situation.actual?.pitches[0];
    return first ? { top: first[14], bottom: first[15] } : null;
  }, [situation]);
  const names = useMemo(
    () => ({
      batter: promptContext.batter.name,
      pitcher: promptContext.pitcher.name,
      battingTeam: promptContext.battingTeam,
      fieldingTeam: promptContext.fieldingTeam,
    }),
    [promptContext],
  );
  const examples = useMemo(() => {
    const batterIs = josa(promptContext.batter.name, '이/가');
    const pitcherIs = josa(promptContext.pitcher.name, '이/가');
    return [
      `${pitcherIs} 경기 전 짜장면 곱빼기를 먹었다`,
      `${batterIs} 어젯밤 3시간밖에 못 잤다`,
      '오늘 기온 35도, 폭염',
      `${batterIs} 빨간 팬티를 입고 왔다`,
      `${pitcherIs} 악플 보고 멘붕`,
      '원정팀이 버스로 5시간 이동했다',
    ];
  }, [promptContext]);
  /** 초대 판의 바로 걸기 칩(ADR-026): 누르면 시트 없이 그 문장을 건다 */
  const quick = useMemo<QuickTmi[]>(() => {
    const batterIs = josa(promptContext.batter.name, '이/가');
    const pitcherIs = josa(promptContext.pitcher.name, '이/가');
    return [
      { label: '짜장면 곱빼기', text: `${pitcherIs} 경기 전 짜장면 곱빼기를 먹었다` },
      { label: '3시간밖에 못 잠', text: `${batterIs} 어젯밤 3시간밖에 못 잤다` },
      { label: '갑자기 똥 신호', text: `${batterIs} 갑자기 똥이 마려웠다` },
      { label: '폭염 35도', text: '오늘 기온 35도, 폭염' },
      { label: '로또 1등', text: `${pitcherIs} 어제 로또 1등에 당첨됐다` },
      { label: '홈 팬 떼창', text: '홈 팬들 떼창이 경기장을 흔든다' },
    ];
  }, [promptContext]);

  const { baseGauge, tmiGauge } = evaluations;
  const readout = baseGauge && tmiGauge ? tierReadout({ tier, setup, state, base: baseGauge, tmi: tmiGauge }) : null;
  const hasTmi = session.tmis.length > 0;
  const grade = gradeOf(session.tmis);
  const spark = live ? sparkSeries(history, tier, setup, { paIndex: live.paIndex, inning: state.inning, half: state.half }) : [];
  const pills: RailPill[] = session.tmis.map((entry) => ({
    ...tmiPill(entry),
    short: tmiShortLabel(entry.text, [promptContext.batter.name, promptContext.pitcher.name], 40),
    deltaPp: contributions[entry.id] ?? null,
  }));

  const editable = canEditTmi(session);
  const finished = session.status === 'finished';
  const playing = playback.busy || session.status === 'animating';
  /** 한 타석을 치른 뒤 타석 사이: 이어서 칠지 여기서 멈출지 고를 수 있다(ADR-033) */
  const betweenPas = canStopHere(session) && !playing && !finished;
  const lastPlay = session.log[session.log.length - 1];
  const canPlay = session.status === 'ready' && !session.interpreting && !playback.busy;

  // 연출이 끝나면 건너뛰기를 끈다
  useEffect(() => {
    if (!playing) trackerRef.current?.setSkipping(false);
  }, [playing]);

  // 이 화면에서 경기가 끝나면 마지막 콜을 보여준 뒤 결과 화면으로 간다(이미 끝난 판으로 들어오면 그대로 둔다)
  const previousStatus = useRef(session.status);
  useEffect(() => {
    const was = previousStatus.current;
    previousStatus.current = session.status;
    if (session.status !== 'finished' || was === 'finished') return;
    const timer = setTimeout(() => setRoute({ screen: 'result' }), RESULT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [session.status, setRoute]);

  const reset = () => {
    trackerRef.current?.setSkipping(false);
    trackerRef.current?.clearMarkers();
    actions.resetPlay();
  };
  const stopHere = () => {
    trackerRef.current?.setSkipping(false);
    actions.stopHere();
    setRoute({ screen: 'result' });
  };
  const openSheet = (focus: boolean) => {
    setSheetFocus(focus);
    setSheetOpen(true);
  };
  // 아직 TMI가 없고 걸 수 있으면 칩 줄 자리에 큰 초대 판(ADR-026)
  const invite: TmiInvite | null =
    editable && !playing && !finished && session.tmis.length === 0
      ? { onOpen: () => openSheet(true), quick, onQuick: (text) => void actions.submitTmi(text), busy: session.interpreting }
      : null;

  const railAction = finished
    ? null
    : editable
      ? session.tmis.length < MAX_TMIS
        ? { label: '+ TMI 걸기', onClick: () => openSheet(true) }
        : null
      : playing
        ? null
        : { label: '↺ 처음부터', onClick: reset };

  let dock: ReactNode;
  if (finished) {
    dock = (
      <>
        <button type="button" className={controls.secondary} onClick={reset}>
          처음부터
        </button>
        <button type="button" className={controls.primary} onClick={() => setRoute({ screen: 'result' })}>
          결과 보기
        </button>
      </>
    );
  } else if (playing) {
    dock = (
      <>
        <button type="button" className={controls.secondary} disabled>
          타석 끝까지
        </button>
        <button type="button" className={controls.primary} onClick={() => trackerRef.current?.setSkipping(true)}>
          건너뛰기
        </button>
        <button type="button" className={controls.secondary} disabled>
          경기 끝까지
        </button>
      </>
    );
  } else {
    dock = (
      <>
        <button type="button" className={controls.secondary} disabled={!canPlay} onClick={() => void playback.finishPa()}>
          타석 끝까지
        </button>
        <button type="button" className={controls.primary} disabled={!canPlay} onClick={() => void playback.throwPitch()}>
          한 구 던지기
        </button>
        <button type="button" className={controls.secondary} disabled={!canPlay} onClick={() => void playback.finishGame()}>
          경기 끝까지
        </button>
      </>
    );
  }

  return (
    <div className={styles.screen}>
      <h2 className={controls.srOnly}>{setup.title}</h2>
      <BroadcastBug
        away={{ name: situation.away.name, color: setup.teamColors.away, score: state.away }}
        home={{ name: situation.home.name, color: setup.teamColors.home, score: state.home }}
        inning={state.inning}
        half={state.half}
        outs={state.outs}
        bases={state.bases}
        balls={live ? live.balls : 0}
        strikes={live ? live.strikes : 0}
        backHref={formatRoute({ screen: 'home' })}
      />
      <PitchTracker
        ref={trackerRef}
        className={styles.tracker}
        bases={state.bases}
        zone={zone}
        sky={skyKindOf(situation.context.startTime, situation.context.dome)}
        homeColor={setup.teamColors.home}
        batter={batterCaption}
        pitcher={pitcherCaption}
      />
      {/* 아직 TMI가 없으면 초대 판을 타자·투수 바로 아래에 둔다. 확률 판 아래(시안 자리)면 트래커에 밀려 눈에 안 들어온다(ADR-026) */}
      {invite && <TmiRail pills={pills} onOpen={() => openSheet(false)} action={railAction} invite={invite} />}
      <WpPanel
        readout={readout}
        tier={tier}
        onTier={setTier}
        mode={session.mode}
        onMode={actions.setMode}
        modeLocked={!canEditMode(session) || playing}
        hasTmi={hasTmi}
        grade={grade}
        spark={spark}
      />
      {!invite && <TmiRail pills={pills} onOpen={() => openSheet(false)} action={railAction} invite={null} />}
      {betweenPas && (
        <div className={styles.carryOn} role="group" aria-label="이어가기">
          <p className={styles.carryOnText}>{lastPlay ? `${lastPlay.batterName} ${lastPlay.headline}` : '타석 끝'}</p>
          <button type="button" className={controls.secondary} onClick={reset}>
            처음부터
          </button>
          <button type="button" className={controls.secondary} onClick={stopHere}>
            여기까지
          </button>
        </div>
      )}
      <nav className={styles.dock} data-count={finished ? 2 : 3} aria-label="다시 치르기">
        {dock}
      </nav>

      <TmiSheet
        open={sheetOpen}
        autoFocus={sheetFocus}
        onClose={() => setSheetOpen(false)}
        odds={readout ? { label: readout.label, base: readout.base, value: readout.value, hasTmi } : null}
        tmis={session.tmis}
        verdicts={session.verdicts}
        judgingId={session.judgingId}
        canEdit={editable && !playing}
        busy={session.interpreting}
        max={MAX_TMIS}
        notice={session.notice}
        examples={examples}
        names={names}
        onSubmit={(text) => void actions.submitTmi(text)}
        onRemove={(id) => actions.removeTmi(id)}
        onJudge={(id) => void actions.judge(id)}
      />
    </div>
  );
}
