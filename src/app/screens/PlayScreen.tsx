import { useEffect, useId, useMemo, useRef } from 'react';
import { InterpretationCard } from '../../components/InterpretationCard';
import { ModeToggle } from '../../components/ModeToggle';
import { PlayControls } from '../../components/PlayControls';
import { PlayLog } from '../../components/PlayLog';
import { ProbabilityTiers } from '../../components/ProbabilityTiers';
import { formatSceneDate } from '../../components/SceneCard';
import { Scorebug } from '../../components/Scorebug';
import { TmiComposer } from '../../components/TmiComposer';
import { WpChart } from '../../components/WpChart';
import { josa } from '../../domain/format';
import { battingWin, canEditTmi, entryChips, selectTiers, stageSceneFor, type SceneSetup } from '../../game';
import { BallparkStage, type StageController } from '../../stage';
import type { Side } from '../../types/domain';
import { useGame } from '../GameProvider';
import { useHashRoute } from '../useHashRoute';
import { usePlayback } from '../usePlayback';
import { useEvaluationPair, useSceneEvaluations } from '../useSceneEvaluations';
import styles from './PlayScreen.module.css';
import screenStyles from './Screen.module.css';

const MAX_TMIS = 3;

/** 다시 치르기 화면. 장면이 열리기 전에는 제목만 */
export function PlayScreen() {
  const { setup, session } = useGame();
  if (!setup || !session.live) {
    return (
      <section className={screenStyles.screen} aria-labelledby="play-title">
        <h2 id="play-title" className={screenStyles.title}>
          장면을 여는 중…
        </h2>
      </section>
    );
  }
  return <PlayBoard key={setup.scene.id} setup={setup} />;
}

function PlayBoard({ setup }: { setup: SceneSetup }) {
  const { session, actions } = useGame();
  const stageRef = useRef<StageController>(null);
  const evaluations = useSceneEvaluations();
  const start = useEvaluationPair(setup.scene.state, true, true);
  const playback = usePlayback(stageRef);
  const [, setRoute] = useHashRoute();
  const chartTitleId = useId();

  const { scene } = setup;
  const live = session.live;
  const state = live ? live.state : scene.state;
  const batSide: Side = state.half === 0 ? 'away' : 'home';
  const fieldSide: Side = batSide === 'away' ? 'home' : 'away';
  const stageScene = useMemo(() => stageSceneFor(setup, state), [setup, state]);

  // 경기가 이 화면에서 끝나면 결과 화면으로 간다 (이미 끝난 판으로 들어오면 그대로 둔다)
  const previousStatus = useRef(session.status);
  useEffect(() => {
    if (session.status === 'finished' && previousStatus.current !== 'finished') setRoute({ screen: 'result' });
    previousStatus.current = session.status;
  }, [session.status, setRoute]);

  const pitcherName = setup.promptContext.pitcher.name;
  const batterName = setup.promptContext.batter.name;
  const examples = useMemo(
    () => [
      `${josa(pitcherName, '이/가')} 경기 전 짜장면 곱빼기를 먹었다`,
      `${josa(batterName, '이/가')} 새 배트를 들고 나왔다`,
      '오늘 기온 35도, 폭염',
      '원정팀이 버스로 5시간 이동했다',
    ],
    [pitcherName, batterName],
  );

  const { baseGauge, tmiGauge } = evaluations;
  const tiers = baseGauge && tmiGauge ? selectTiers(setup, state, baseGauge, tmiGauge) : [];
  const tones = session.tmis.flatMap((entry) => entryChips(entry).map((chip) => chip.tone));
  const editable = canEditTmi(session);
  const locked = live !== null && (live.paIndex > 0 || live.pitches.length > 0);
  const finished = session.status === 'finished';
  const playing = playback.busy || session.status === 'animating';
  const canPitch = live !== null && session.status === 'ready' && !session.interpreting;

  // 승리확률 흐름: 장면 시작의 TMI 반영 값 + 타석마다 직후 값, 장면 공격 팀 기준. 기준선은 장면 시작의 TMI 없음 값
  const chartSide = setup.batSide;
  const chartTeam = scene[chartSide].name;
  const points = [
    ...(start.tmi ? [{ label: '시작', value: battingWin(start.tmi, chartSide) }] : []),
    ...session.log.flatMap((entry) => {
      if (entry.wpHomeAfter === null) return [];
      const point = playback.trail[entry.index];
      const winHome = point ? point.winHome : entry.wpHomeAfter;
      const value = chartSide === 'home' ? winHome : 1 - winHome - (point ? point.tie : 0);
      return [{ label: `${entry.index + 1}번째 타석`, value }];
    }),
  ];
  const baseline = start.base ? battingWin(start.base, chartSide) : null;

  return (
    <div className={styles.play}>
      <div className={styles.main}>
        <header className={styles.head}>
          <h2 className={styles.title}>{scene.title}</h2>
          <p className={styles.meta}>{`${formatSceneDate(scene.date)} · ${scene.stadium}`}</p>
          <p className={styles.note}>실제 결과는 경기가 끝나면 공개돼요</p>
        </header>
        <div className={styles.stage}>
          <BallparkStage ref={stageRef} scene={stageScene} bases={state.bases} />
        </div>
        <div className={styles.bug}>
          <Scorebug
            awayName={scene.away.name}
            homeName={scene.home.name}
            awayColor={setup.teamColors.away}
            homeColor={setup.teamColors.home}
            awayScore={state.away}
            homeScore={state.home}
            inning={state.inning}
            half={state.half}
            outs={state.outs}
            balls={live ? live.balls : 0}
            strikes={live ? live.strikes : 0}
            bases={state.bases}
          />
        </div>
        <div className={styles.controls}>
          <PlayControls
            canPitch={canPitch}
            canFinish={canPitch}
            busy={playing}
            finished={finished}
            onPitch={() => void playback.throwPitch()}
            onFinishPa={() => void playback.finishPa()}
            onFinishGame={() => void playback.finishGame()}
            onReset={() => {
              stageRef.current?.clearMarkers();
              actions.resetPlay();
            }}
          />
        </div>
        <div className={styles.log}>
          <PlayLog entries={session.log} />
        </div>
        <section className={styles.chart} aria-labelledby={chartTitleId}>
          <h3 id={chartTitleId} className={styles.sectionTitle}>{`${chartTeam} 승리확률 흐름`}</h3>
          <WpChart points={points} baseline={baseline} teamName={chartTeam} color={setup.teamColors[chartSide]} />
        </section>
      </div>

      <div className={styles.side}>
        <div className={styles.tiers}>
          <ProbabilityTiers
            tiers={tiers}
            mode={session.mode}
            tones={tones}
            pending={evaluations.pending || tiers.length === 0}
            batColor={setup.teamColors[batSide]}
            fldColor={setup.teamColors[fieldSide]}
          />
        </div>
        <div className={styles.mode}>
          <ModeToggle mode={session.mode} disabled={!editable || playing} onChange={actions.setMode} />
        </div>
        <div className={styles.tmi}>
          <TmiComposer
            examples={examples}
            disabled={live === null || finished || playing}
            locked={locked}
            busy={session.interpreting}
            count={session.tmis.length}
            max={MAX_TMIS}
            notice={session.notice}
            onSubmit={(text) => void actions.submitTmi(text)}
          />
        </div>
        {session.tmis.length > 0 && (
          <ul className={styles.cards} aria-label="걸린 TMI">
            {session.tmis.map((entry) => {
              const verdict = Object.hasOwn(session.verdicts, entry.id) ? session.verdicts[entry.id] : null;
              const judging = session.judgingId === entry.id;
              return (
                <li key={entry.id}>
                  <InterpretationCard
                    entry={entry}
                    chips={entryChips(entry)}
                    verdict={verdict}
                    judging={judging}
                    canRemove={editable && !playing}
                    canJudge={!entry.interpretation.refused && verdict === null && (session.judgingId === null || judging)}
                    onRemove={() => actions.removeTmi(entry.id)}
                    onJudge={() => void actions.judge(entry.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
