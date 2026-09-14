/* TMI 야구 app: scenario state, "useless variable" interpretation (Claude through the sample capability, offline rules
   otherwise), exact probability tiers, the pitch-by-pitch broadcast loop and the win-probability chart.
   Pure helpers are exported for tests; the page boots only in a browser that carries window.TMI_DATA. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.TMIApp = factory(root.TMI);
}(typeof self !== 'undefined' ? self : this, function (T) {
  'use strict';

  // ---------- pure helpers ----------
  function josa(word, pair) {
    const [withFinal, withoutFinal] = pair.split('/');
    const code = word.charCodeAt(word.length - 1);
    if (code < 0xAC00 || code > 0xD7A3) return word + withoutFinal;
    const jong = (code - 0xAC00) % 28;
    if (pair === '으로/로') return word + (jong === 0 || jong === 8 ? '로' : '으로');
    return word + (jong ? withFinal : withoutFinal);
  }

  const RULES = [
    { re: /짜장|짬뽕|곱빼기|과식|배불|야식|치킨|라면|삼겹|떡볶이|피자|햄버거|폭식/, kind: 'person', batter: ['focus', -1], pitcher: ['stamina', -1], scope: 'game', evidence: 'fun', why: '배가 부르면 몸이 무거워진다는 가정' },
    { re: /든든|보양|삼계탕|장어|홍삼|영양제/, kind: 'person', batter: ['focus', 1], pitcher: ['stamina', 1], scope: 'game', evidence: 'fun', why: '든든하게 먹으면 힘이 난다는 가정' },
    { re: /늦잠|못 ?잤|밤새|피곤|숙취|새벽|불면|졸려|졸음|잠을? ?설쳤/, kind: 'person', batter: ['focus', -1], pitcher: ['stamina', -2], scope: 'game', evidence: 'plausible', why: '잠이 모자라면 반응과 체력이 떨어져요' },
    { re: /로또|당첨|생일|칭찬|용돈|기분 ?좋|축하|결혼|득남|득녀|첫 ?아이|보너스/, kind: 'person', batter: ['focus', 1], pitcher: ['nerve', 1], scope: 'game', evidence: 'fun', why: '기분이 좋으면 집중이 잘 된다는 가정' },
    { re: /이별|헤어|차였|싸웠|혼났|악플|우울|긴장|떨려|떨고|멘붕/, kind: 'person', batter: ['focus', -1], pitcher: ['nerve', -1], scope: 'game', evidence: 'fun', why: '마음이 흔들리면 실수가 늘어난다는 가정' },
    { re: /징크스|루틴|수염|염색|양말|속옷|부적|행운/, kind: 'person', batter: ['focus', 1], pitcher: ['nerve', 1], scope: 'game', evidence: 'fun', why: '징크스는 믿는 만큼 통한다는 가정' },
    { re: /딸꾹질|재채기|기침|하품|먼지|모기|벌레|나방|잠자리|파리/, kind: 'person', batter: ['focus', -1], pitcher: ['control', -1], scope: 'pa', evidence: 'fun', why: '순간 집중이 깨지는 방해 요소' },
    { re: /새 ?배트|배트를? ?바꿨|방망이/, kind: 'person', batter: ['contact', 1], pitcher: null, scope: 'game', evidence: 'fun', why: '새 장비 효과라는 가정' },
    { re: /장갑|글러브|신발|스파이크|모자|헬멧|유니폼|벨트/, kind: 'person', batter: ['contact', -1], pitcher: ['control', -1], scope: 'pa', evidence: 'fun', why: '장비가 신경 쓰이면 동작이 흐트러진다는 가정' },
    { re: /부모님|엄마|아빠|가족|아내|남편|여자 ?친구|남자 ?친구|아들/, kind: 'person', batter: ['focus', 1], pitcher: ['nerve', 1], scope: 'game', evidence: 'fun', why: '가족 앞에서 힘이 난다는 가정' },
    { re: /역풍|맞바람|바람이 ?홈|쌀쌀|추워|추운|한파/, kind: 'env', env: ['carry', -2], scope: 'game', evidence: 'data', why: '맞바람과 찬 공기는 타구 비거리를 줄여요' },
    { re: /순풍|뒷바람|바람이 ?외야|폭염|더워|더운|무더위/, kind: 'env', env: ['carry', 2], scope: 'game', evidence: 'data', why: '뒷바람과 따뜻한 공기는 타구를 더 멀리 보내요' },
    { re: /비가|비 ?온|빗방울|빗줄기|우천|장마|습도|습해|습한|땀/, kind: 'env', env: ['slick', 2], scope: 'game', evidence: 'plausible', why: '젖은 공은 채기 어려워 볼이 늘어요' },
    { re: /햇빛|노을|석양|조명|눈부|그림자|레이저|플래시/, kind: 'env', env: ['glare', 1], scope: 'pa', evidence: 'plausible', why: '공이 잘 안 보이면 헛스윙이 늘어요' },
    { re: /관중|함성|떼창|응원가|만석|매진|응원/, kind: 'crowd', env: ['mood', 1], scope: 'game', evidence: 'plausible', why: '홈 관중의 응원은 홈팀에 힘을 실어줘요' },
  ];

  function ruleInterpret(text, ctx) {
    const mentionsPitcher = text.includes(ctx.pitcher.name) || /투수|포수|마무리|선발|불펜|마운드/.test(text);
    const mentionsBatter = text.includes(ctx.batter.name) || /타자|대타|타석/.test(text);
    const subject = mentionsPitcher && !mentionsBatter ? 'pitcher' : 'batter';
    const effects = [];
    let why = '';
    for (const rule of RULES) {
      if (!rule.re.test(text)) continue;
      let knob;
      let strength;
      let targetKind;
      if (rule.kind === 'person') {
        const pick = rule[subject];
        if (!pick) continue;
        [knob, strength] = pick;
        targetKind = subject;
      } else if (rule.kind === 'crowd') {
        [knob, strength] = rule.env;
        targetKind = ctx.homeBatting ? 'batting_team' : 'fielding_team';
      } else {
        [knob, strength] = rule.env;
        targetKind = 'everyone';
      }
      if (effects.some((e) => e.knob === knob && e.targetKind === targetKind)) continue;
      effects.push({ knob, targetKind, strength, scope: rule.scope, evidence: rule.evidence, why: rule.why });
      why = why || rule.why;
      if (effects.length === 3) break;
    }
    return { refused: false, reason: '', comment: effects.length ? why : '승부와 이어 붙일 방법이 없는 변수로 판정했어요. 차이는 0이에요.', effects };
  }

  const TARGETS = {
    batter: ['batter', 'batting_team', 'everyone'],
    pitcher: ['pitcher', 'fielding_team', 'everyone'],
    field: ['fielding_team', 'everyone'],
    env: ['everyone'],
    team: ['batting_team', 'fielding_team'],
  };

  function normalizeAI(out) {
    if (!out || typeof out !== 'object' || Array.isArray(out)) return null;
    if (out.refused) {
      return { refused: true, reason: String(out.reason || '').slice(0, 80) || '실존 선수에게 민감한 내용이라 계산하지 않았어요.', comment: '', effects: [] };
    }
    const effects = [];
    for (const x of Array.isArray(out.effects) ? out.effects : []) {
      if (!x || typeof x !== 'object' || !T.KNOBS[x.knob]) continue;
      const who = T.KNOBS[x.knob].who;
      const targetKind = who === 'env' ? 'everyone' : String(x.target || '');
      if (!TARGETS[who].includes(targetKind)) continue;
      const strength = Math.max(-3, Math.min(3, Math.round(Number(x.strength))));
      if (!Number.isFinite(strength) || strength === 0) continue;
      effects.push({
        knob: x.knob,
        targetKind,
        strength,
        scope: x.scope === 'pa' ? 'pa' : 'game',
        evidence: ['data', 'plausible', 'fun'].includes(x.evidence) ? x.evidence : 'fun',
        why: String(x.why || '').slice(0, 60),
      });
      if (effects.length === 3) break;
    }
    return { refused: false, reason: '', comment: String(out.comment || '').slice(0, 90), effects };
  }

  function toEngineTarget(kind, c) {
    if (kind === 'batter') return { type: 'player', id: c.batterId };
    if (kind === 'pitcher') return { type: 'player', id: c.pitcherId };
    if (kind === 'batting_team') return { type: 'team', side: c.batSide };
    if (kind === 'fielding_team') return { type: 'team', side: c.batSide === 'away' ? 'home' : 'away' };
    return { type: 'all' };
  }

  const CODE_INDEX = { B: 0, T: 1, S: 2, F: 3, X: 4 };
  const CODE_OF = ['B', 'T', 'S', 'F', 'X'];
  const countBucket = (b, s) => (b > s ? 1 : b < s ? 2 : 0) + (s === 2 ? 10 : 0);

  function pickPitch(rows, code, balls, strikes, stance, rand) {
    const ci = CODE_INDEX[code];
    const want = countBucket(balls, strikes);
    const tiers = [
      (r) => r[2] === ci && r[5] === stance && countBucket(r[3], r[4]) === want,
      (r) => r[2] === ci && r[5] === stance,
      (r) => r[2] === ci,
      () => true,
    ];
    for (const ok of tiers) {
      const pool = rows.filter(ok);
      if (pool.length) return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
    }
    return null;
  }

  function applyPlay(state, branch) {
    const st = Object.assign({}, state);
    const batSide = st.half === 0 ? 'away' : 'home';
    st[batSide] += branch.runs;
    st.outs = branch.outs;
    st.bases = branch.outs >= 3 ? 0 : branch.bases;
    if (batSide === 'away') st.slotAway = (st.slotAway + 1) % 9;
    else st.slotHome = (st.slotHome + 1) % 9;
    let over = null;
    if (st.half === 1 && st.inning >= 9 && st.home > st.away) over = { kind: 'game', winner: 'home', walkoff: true };
    else if (st.outs >= 3) {
      if (st.inning >= 9 && st.half === 0 && st.home > st.away) over = { kind: 'game', winner: 'home', walkoff: false };
      else if (st.inning >= 9 && st.half === 1 && st.away > st.home) over = { kind: 'game', winner: 'away', walkoff: false };
      else if (st.inning >= T.MAX_INN && st.half === 1) over = { kind: 'game', winner: 'tie', walkoff: false };
      else over = { kind: 'half' };
    }
    return { state: st, over };
  }

  function headline(event, branch, result) {
    const walkoff = Boolean(result.over && result.over.walkoff);
    const pre = walkoff ? '끝내기 ' : '';
    const bang = walkoff ? '!' : '';
    const runs = branch.runs;
    if (event === T.EV.K) return '삼진';
    if (event === T.EV.BB) return runs ? `${pre}밀어내기 볼넷${bang}` : '볼넷';
    if (event === T.EV.HR) return runs === 4 ? `${pre}만루 홈런!` : runs === 1 ? `${pre}솔로 홈런!` : `${pre}${runs}점 홈런!`;
    if (event === T.EV.T3 || event === T.EV.D2 || event === T.EV.S1) {
      const label = event === T.EV.T3 ? '3루타' : event === T.EV.D2 ? '2루타' : '안타';
      if (walkoff) return `끝내기 ${label}!`;
      if (runs) return `${runs}타점 ${event === T.EV.S1 ? '적시타' : label}`;
      return label;
    }
    if (branch.play === 'DP') return '병살타';
    if (branch.play === 'SF') return `${pre}희생플라이${bang}`;
    if (branch.play === 'GB') return runs ? `${pre}땅볼 타점${bang}` : '땅볼 아웃';
    if (branch.play === 'FB') return '뜬공 아웃';
    return '직선타 아웃';
  }

  function formatDelta(d) {
    const p = Math.abs(d) * 100;
    if (!(p >= 0.005)) return '±0.00%p';
    return `${d > 0 ? '+' : '−'}${p.toFixed(p < 0.1 ? 2 : 1)}%p`;
  }

  const pct = (x) => (x * 100).toFixed(1);
  const OUTS_TEXT = ['무사', '1사', '2사', '3아웃'];
  function basesText(bases) {
    if (bases === 0) return '주자 없음';
    if (bases === 7) return '만루';
    return `${[1, 2, 3].filter((b) => (bases >> (b - 1)) & 1).join('·')}루`;
  }
  const situationText = (st) => `${st.inning}회${st.half ? '말' : '초'} ${OUTS_TEXT[Math.min(st.outs, 3)]} ${basesText(st.bases)}`;

  // ---------- page ----------
  const TEAM_COLOR = { HT: '#F0474B', LT: '#5C8DF6', NC: '#86A8EE', HH: '#FF8A2A', LG: '#E0457B', OB: '#A3A7EA', SS: '#4C8FF7', SK: '#EF5261', KT: '#D6D6D6', WO: '#C9566C' };
  const EVIDENCE = { data: ['근거 있음', ''], plausible: ['그럴듯함', 'plausible'], fun: ['상상', 'fun'] };
  const WHO_TEXT = { batter: '타자', pitcher: '투수', field: '수비', env: '모두', team: '팀' };
  const KNOB_HINT = {
    contact: '공을 더 잘 맞힘, 삼진 감소', power: '장타·홈런 증가', eye: '볼넷 증가, 삼진 감소', focus: '타자에게 전반적으로 유리', speed: '내야안타·3루타 증가',
    stuff: '삼진 증가, 피안타 감소', control: '볼넷 감소', stamina: '피안타·볼넷 감소', nerve: '위기에서 볼넷·홈런 감소',
    defense: '안타가 아웃으로 바뀜', carry: '홈런·장타 증가 (바람·기온)', slick: '볼넷 증가, 삼진 감소 (비·습도·땀)',
    glare: '타자가 공을 보기 어려워 삼진 증가', mood: '그 팀에 전반적으로 유리',
  };

  function el(tag, props, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'text') node.textContent = v;
      else if (k === 'className') node.className = v;
      else node.setAttribute(k, v);
    }
    for (const c of children || []) node.append(c);
    return node;
  }

  function boot() {
    const D = window.TMI_DATA;
    const Stage = window.Stage;
    const $ = (id) => document.getElementById(id);
    const stage = Stage.createStage($('stage'));
    const S = {
      sc: null, teams: null, pitcher: null, base: null, game: null, st: null, v: null, v0: null,
      count: { b: 0, s: 0 }, paPitch: 0, pitchNo: 0, halfRuns: 0, over: null, nextV: null, nextV0: null,
      effects: [], fxSeq: 0, chart: [], log: [], tally: { runs: 0, zero: 0 },
      busy: false, auto: null, fast: false, interpreting: false, sample: null, startBatSide: 'home', status: '',
    };

    const player = (id) => D.players[id];
    const batSideOf = (st) => (st.half === 0 ? 'away' : 'home');
    const fieldSideOf = (st) => (st.half === 0 ? 'home' : 'away');
    const slotOf = (st) => (st.half === 0 ? st.slotAway : st.slotHome);
    const currentBatterId = () => S.sc.lineups[batSideOf(S.st)][slotOf(S.st)];
    const colorOf = (side) => TEAM_COLOR[S.sc[side].code] || '#EEF2E9';
    const batsVs = (id) => {
      const b = player(id).bats;
      if (b !== 'S') return b;
      return player(S.sc.pitcher).throws === 'R' ? 'L' : 'R';
    };
    const winFor = (side, g) => (side === 'home' ? g.winHome : g.winAway);
    const pause = () => new Promise((resolve) => setTimeout(resolve, S.fast ? 120 : 450));

    // ----- model -----
    function engineEffects() {
      return S.effects.flatMap((e) => e.parts.filter((p) => !p.expired).map((p) => ({ knob: p.knob, strength: p.strength, scope: p.scope, target: p.target })));
    }

    function rebuild() {
      S.game = T.createGame({ lg: D.lg, away: S.teams.away, home: S.teams.home, effects: engineEffects(), countTable: D.countTable });
      if (S.over) {
        if (S.over.kind === 'half') computeNextHalf();
        return;
      }
      S.v = S.game.evaluate(S.st, S.pitcher);
      S.v0 = S.base.evaluate(S.st, S.pitcher);
    }

    function computeNextHalf() {
      const next = Object.assign({}, S.st, { half: 1 - S.st.half, inning: S.st.half === 1 ? S.st.inning + 1 : S.st.inning, outs: 0, bases: 0 });
      const pen = D.bullpens[S.sc[next.half === 0 ? 'home' : 'away'].code];
      S.nextV = S.game.evaluate(next, pen);
      S.nextV0 = S.base.evaluate(next, pen);
    }

    function gauges() {
      if (!S.over) return { g: T.gaugesAtCount(S.v, S.count.b, S.count.s), g0: T.gaugesAtCount(S.v0, S.count.b, S.count.s) };
      const scored = S.halfRuns > 0 ? 1 : 0;
      if (S.over.kind === 'half') {
        const mk = (v) => ({ batterWin: NaN, inningScore: scored, winHome: v.winHome, winAway: v.winAway, tie: v.tie, dist: null });
        return { g: mk(S.nextV), g0: mk(S.nextV0) };
      }
      const w = S.over.winner;
      const fin = { batterWin: NaN, inningScore: scored, winHome: w === 'home' ? 1 : 0, winAway: w === 'away' ? 1 : 0, tie: w === 'tie' ? 1 : 0, dist: null };
      return { g: fin, g0: fin };
    }

    function pushChart(mark) {
      const { g, g0 } = gauges();
      S.chart.push({ v: winFor(S.startBatSide, g), v0: winFor(S.startBatSide, g0), mark: Boolean(mark) });
      drawChart();
    }

    // ----- scenarios -----
    function loadScenario(id) {
      S.auto = null;
      const sc = D.scenarios.find((x) => x.id === id);
      S.sc = sc;
      const side = (s) => ({ lineup: sc.lineups[s].map((pid) => ({ id: pid, rel: player(pid).rel })), bullpen: D.bullpens[sc[s].code] });
      S.teams = { away: side('away'), home: side('home') };
      S.pitcher = { id: sc.pitcher, rel: player(sc.pitcher).rel };
      S.base = T.createGame({ lg: D.lg, away: S.teams.away, home: S.teams.home, effects: [], countTable: D.countTable });
      S.startBatSide = batSideOf(sc.state);
      S.effects = [];
      S.tally = { runs: 0, zero: 0 };
      resetPlay();
      const p = player(sc.pitcher).name;
      const example = `${josa(p, '이/가')} 경기 전 짜장면 곱빼기를 먹었다`;
      addEffect(example, ruleInterpret(example, interpretationContext()), '규칙 해석', true);
      renderScenes();
      renderChips();
    }

    function resetPlay() {
      S.st = Object.assign({}, S.sc.state);
      S.count = { b: 0, s: 0 };
      S.paPitch = 0;
      S.pitchNo = 0;
      S.halfRuns = 0;
      S.over = null;
      S.chart = [];
      S.log = [];
      lastTag = null;
      S.status =`${situationText(S.st)}, ${S.sc.title.split(', ').pop()}. 공을 던져 보세요.`;
      S.effects.forEach((e) => e.parts.forEach((p) => { p.expired = false; }));
      stage.clearMarkers();
      stage.setBases(S.st.bases);
      const bs = batSideOf(S.st);
      const fs = fieldSideOf(S.st);
      stage.setScene({
        bat: { color: colorOf(bs), home: bs === 'home', bats: batsVs(currentBatterId()) },
        fld: { color: colorOf(fs), home: fs === 'home', throws: player(S.sc.pitcher).throws },
        zone: zoneFor(S.sc),
      });
      rebuild();
      pushChart(false);
      renderAll();
    }

    function zoneFor(sc) {
      const rows = sc.actual.pitches;
      if (!rows.length) return { top: 3.4, bot: 1.6 };
      const med = (i) => rows.map((r) => r[i]).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
      return { top: med(14), bot: med(15) };
    }

    // ----- variables -----
    function interpretationContext() {
      const bs = batSideOf(S.st);
      const fs = fieldSideOf(S.st);
      const bid = currentBatterId();
      const b = player(bid);
      const p = player(S.sc.pitcher);
      return {
        batter: { id: bid, name: b.name }, pitcher: { id: S.sc.pitcher, name: p.name }, homeBatting: bs === 'home',
        date: S.sc.date, away: S.sc.away.name, home: S.sc.home.name, awayScore: S.st.away, homeScore: S.st.home,
        situation: situationText(S.st), batTeam: S.sc[bs].name, fldTeam: S.sc[fs].name,
        bats: b.bats === 'L' ? '좌타' : b.bats === 'S' ? '양타' : '우타', throws: p.throws === 'L' ? '좌투' : '우투',
      };
    }

    function buildPrompt(text, c) {
      const knobs = Object.entries(T.KNOBS).map(([k, v]) => `- ${k} (${v.label}) 대상: ${WHO_TEXT[v.who]} / 양수일 때: ${KNOB_HINT[k]}`).join('\n');
      return [
        '너는 KBO 야구 중계석의 "쓸데없는 변수 분석관"이다. 시청자가 적은 사소한 상황을 아래 확률 모델의 손잡이(knob)로 번역한다.',
        `[장면] ${c.date} ${c.away} ${c.awayScore} : ${c.homeScore} ${c.home}, ${c.situation}. 타자 ${c.batter.name} (${c.batTeam}, ${c.bats}). 투수 ${c.pitcher.name} (${c.fldTeam}, ${c.throws}).`,
        '[손잡이]',
        knobs,
        '[규칙]',
        '- strength는 -3~3 정수. 1은 사소함, 2는 눈에 띔, 3은 큼. 대부분의 사소한 변수는 1이나 -1.',
        '- target은 batter, pitcher, batting_team, fielding_team, everyone 중 하나. 손잡이 대상과 맞춰라: 타자 손잡이는 batter나 batting_team, 투수·수비 손잡이는 pitcher나 fielding_team, 모두 손잡이는 everyone, 팀 손잡이(mood)는 batting_team이나 fielding_team.',
        '- scope는 이번 타석에만 해당하면 "pa", 경기 내내 이어지면 "game".',
        '- evidence는 연구·물리 근거가 있으면 "data", 그럴듯하면 "plausible", 순전히 재미면 "fun".',
        '- 효과는 최대 3개. 승부와 전혀 이어지지 않으면 effects는 빈 배열.',
        '- 실존 선수의 범죄, 질병, 부상, 사생활 폭로, 성적인 내용, 비하가 담기면 refused를 true로 하고 reason에 짧은 이유를 적어라.',
        '- comment는 야구 해설위원 말투의 한국어 한 문장(60자 이내). 진지한 척하지만 웃기게.',
        '- why는 효과마다 40자 이내 한국어 근거.',
        '[출력] 다른 글 없이 JSON 하나만:',
        '{"refused":false,"reason":"","comment":"...","effects":[{"knob":"stamina","target":"pitcher","strength":-1,"scope":"game","evidence":"fun","why":"..."}]}',
        `[시청자 변수] ${JSON.stringify(text)}`,
      ].join('\n');
    }

    function addEffect(text, parsed, source, example) {
      const c = { batterId: currentBatterId(), pitcherId: S.sc.pitcher, batSide: batSideOf(S.st) };
      const names = {
        batter: player(c.batterId).name, pitcher: player(c.pitcherId).name, batting_team: S.sc[c.batSide].name,
        fielding_team: S.sc[c.batSide === 'away' ? 'home' : 'away'].name, everyone: '모두',
      };
      S.effects.push({
        id: ++S.fxSeq, text, source, example, comment: parsed.comment || '', refused: Boolean(parsed.refused), reason: parsed.reason || '',
        parts: (parsed.effects || []).map((p) => Object.assign({}, p, { target: toEngineTarget(p.targetKind, c), subjectName: names[p.targetKind], side: p.targetKind === 'batter' || p.targetKind === 'batting_team' ? 'bat' : p.targetKind === 'everyone' ? 'all' : 'fld', expired: false })),
      });
      rebuild();
      pushChart(true);
      renderAll();
    }

    function removeEffect(id) {
      S.effects = S.effects.filter((e) => e.id !== id);
      rebuild();
      pushChart(true);
      renderAll();
    }

    async function submitVariable(raw) {
      const text = raw.trim();
      if (!text || S.interpreting) return;
      S.interpreting = true;
      const status = $('tmi-status');
      status.className = 'tmi-status busy';
      status.textContent = S.sample ? 'AI가 변수를 해석하고 있어요' : '규칙으로 해석하고 있어요';
      renderControls();
      let parsed = null;
      let source = '규칙 해석';
      let note = '';
      if (S.sample) {
        try {
          parsed = normalizeAI(await S.sample.json(buildPrompt(text, interpretationContext()), { modelTier: 'quick' }));
          if (parsed) source = 'AI 해석';
        } catch (err) {
          const code = err && err.code;
          if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(code)) {
            S.sample = null;
            renderInterpMode();
          }
          note = code === 'rate_limited' ? 'AI 호출 한도에 걸려 규칙으로 계산했어요. 잠시 뒤 다시 해 보세요. ' : 'AI 해석을 쓸 수 없어 규칙으로 계산했어요. ';
        }
      }
      if (!parsed) parsed = ruleInterpret(text, interpretationContext());
      addEffect(text, parsed, source, false);
      status.className = 'tmi-status';
      status.textContent = parsed.refused ? `${note}${parsed.reason}` : `${note}${source}: ${parsed.comment || '효과를 반영했어요.'}`;
      $('tmi-input').value = '';
      S.interpreting = false;
      renderControls();
    }

    // ----- playback -----
    async function playOnePitch() {
      if (S.busy || S.over) return false;
      S.busy = true;
      renderControls();
      const q = S.v.count.rates[S.count.b * 3 + S.count.s];
      const u = Math.random();
      const code = u < q[0] ? 'B' : u < q[0] + q[1] ? 'T' : u < q[0] + q[1] + q[2] ? 'S' : u < q[0] + q[1] + q[2] + q[3] ? 'F' : 'X';
      let ending = null;
      if (code === 'X') {
        const event = T.sampleInPlay(S.v.pa, Math.random);
        ending = { event, branch: T.sampleTransition(S.st.bases, S.st.outs, event, Math.random) };
      } else if (code === 'B' && S.count.b === 3) {
        ending = { event: T.EV.BB, branch: T.transitions(S.st.bases, S.st.outs, T.EV.BB)[0] };
      } else if ((code === 'T' || code === 'S') && S.count.s === 2) {
        ending = { event: T.EV.K, branch: T.transitions(S.st.bases, S.st.outs, T.EV.K)[0] };
      }
      const stance = batsVs(currentBatterId()) === 'L' ? 0 : 1;
      const row = pickPitch(D.pitchDB[S.sc.pitcher], code, S.count.b, S.count.s, stance, Math.random);
      await runPitch(row, code, ending, null);
      S.busy = false;
      renderControls();
      return Boolean(ending);
    }

    async function runPitch(row, code, ending, real) {
      const number = S.paPitch + 1;
      const batterId = currentBatterId();
      let result = null;
      let banner = null;
      if (ending) {
        result = applyPlay(S.st, ending.branch);
        const text = headline(ending.event, ending.branch, result);
        const big = ending.event === T.EV.HR || Boolean(result.over && result.over.walkoff) || ending.branch.runs >= 2;
        const sub = real ? real.result.split(' : ').pop() : `${S.sc.away.name} ${result.state.away} : ${result.state.home} ${S.sc.home.name}`;
        banner = { text, sub, tone: big ? 'big' : 'normal' };
      }
      await stage.playPitch({
        row, code, number, fast: S.fast,
        play: ending ? ending.branch.play : null,
        bats: batsVs(batterId),
        moves: ending ? ending.branch.moves : null,
        basesAfter: result ? result.state.bases : undefined,
        banner,
        onRelease: () => showPitchTag(row, number),
      });
      S.paPitch = number;
      S.pitchNo += 1;
      if (!ending) {
        if (code === 'B') S.count.b += 1;
        else if (code === 'T' || code === 'S') S.count.s += 1;
        else if (code === 'F') S.count.s = Math.min(S.count.s + 1, 2);
        pushChart(false);
        renderAll();
        return;
      }
      finishPA(ending, result, batterId, number, real);
    }

    function finishPA(ending, result, batterId, pitches, real) {
      const before = S.st;
      const text = headline(ending.event, ending.branch, result);
      S.log.unshift({
        inn: `${before.inning}회${before.half ? '말' : '초'}`,
        text: `${player(batterId).name} ${text}${ending.branch.runs ? ` · ${ending.branch.runs}득점` : ''} · ${pitches}구${real ? ' · 실제 기록' : ''}`,
        big: ending.branch.runs > 0 || ending.event === T.EV.HR,
      });
      S.st = result.state;
      S.halfRuns += ending.branch.runs;
      S.count = { b: 0, s: 0 };
      S.paPitch = 0;
      stage.clearMarkers();
      S.effects.forEach((e) => e.parts.forEach((p) => { if (p.scope === 'pa') p.expired = true; }));
      const bs = batSideOf(before);
      const fs = fieldSideOf(before);
      if (result.over) {
        S.over = result.over;
        if (!real) S.tally[S.halfRuns > 0 ? 'runs' : 'zero'] += 1;
      } else {
        stage.setScene({ bat: { color: colorOf(bs), home: bs === 'home', bats: batsVs(currentBatterId()) } });
      }
      rebuild();
      if (!S.over) S.status = `${situationText(S.st)} · 다음 타자 ${player(currentBatterId()).name}`;
      else if (S.over.kind === 'half') {
        const nextWin = winFor(bs, S.nextV);
        S.status = `이닝 종료. ${S.halfRuns ? `${S.sc[bs].name} ${S.halfRuns}점 추가` : `${S.sc[fs].name} 무실점`} · 다음 이닝 ${S.sc[bs].name} 승리 확률 ${pct(nextWin)}%`;
      } else if (S.over.winner === 'tie') S.status = '11회까지 승부가 나지 않아 무승부로 끝났어요.';
      else S.status = `경기 끝! ${S.sc[S.over.winner].name} ${S.over.walkoff ? '끝내기 ' : ''}승리`;
      if (real) S.status = `실제 결과: ${real.result} · ${S.status}`;
      pushChart(false);
      renderAll();
    }

    async function autoPlay(mode) {
      S.auto = mode;
      renderControls();
      while (S.auto && !S.over) {
        const ended = await playOnePitch();
        if (mode === 'pa' && ended) break;
        if (S.auto && !S.over) await pause();
      }
      S.auto = null;
      renderControls();
    }

    function realBranch(act) {
      const text = act.result;
      const want = /병살/.test(text) ? 'DP' : /희생/.test(text) ? 'SF' : /플라이|뜬공/.test(text) ? 'FB' : /땅볼/.test(text) ? 'GB' : /라인드라이브|직선/.test(text) ? 'LD' : null;
      const score = (b) => (b.runs === act.runs ? 2 : 0) + (want && b.play === want ? 1 : 0) + b.p * 0.01;
      return T.transitions(S.st.bases, S.st.outs, act.event).slice().sort((a, b) => score(b) - score(a))[0];
    }

    async function playReal() {
      if (S.busy) return;
      S.auto = null;
      resetPlay();
      S.busy = true;
      S.status = '실제 그 타석을 재생해요. 공 궤적과 결과 모두 실제 기록이에요.';
      renderAll();
      const act = S.sc.actual;
      for (let i = 0; i < act.pitches.length; i++) {
        const row = act.pitches[i];
        const last = i === act.pitches.length - 1;
        await runPitch(row, CODE_OF[row[2]], last ? { event: act.event, branch: realBranch(act) } : null, last ? act : null);
        if (!last) await pause();
      }
      S.busy = false;
      renderControls();
    }

    // ----- rendering -----
    function renderAll() {
      document.documentElement.style.setProperty('--bat', colorOf(batSideOf(S.st)));
      document.documentElement.style.setProperty('--fld', colorOf(fieldSideOf(S.st)));
      renderScorebug();
      renderMatchup();
      renderTiers();
      renderChain();
      renderEffects();
      renderLog();
      renderControls();
      $('play-status').textContent = S.status;
      stage.setBoard([`${S.st.away} : ${S.st.home}`, `B${S.count.b} S${S.count.s} O${Math.min(S.st.outs, 3)}`]);
    }

    function renderScenes() {
      $('scenes').replaceChildren(...D.scenarios.map((sc) => {
        const [, m, d] = sc.date.split('-');
        const score = el('span', { className: 'score' }, [`${sc.away.name} `, el('b', { text: `${sc.state.away} : ${sc.state.home}` }), ` ${sc.home.name}`]);
        const b = el('button', { type: 'button', className: 'scene', 'aria-pressed': String(sc.id === S.sc.id) }, [
          el('span', { className: 'when', text: `${Number(m)}월 ${Number(d)}일 · ${sc.stadium}` }),
          el('span', { className: 'sit', text: situationText(sc.state) }),
          el('span', { className: 'who', text: `${player(sc.batter).name} vs ${player(sc.pitcher).name}` }),
          score,
        ]);
        b.addEventListener('click', () => {
          if (sc.id !== S.sc.id && !S.busy) loadScenario(sc.id);
        });
        return b;
      }));
    }

    function renderChips() {
      const b = player(currentBatterId()).name;
      const p = player(S.sc.pitcher).name;
      const texts = [
        `${josa(p, '이/가')} 경기 전 짜장면 곱빼기를 먹었다`,
        `${josa(b, '이/가')} 오늘 아침 로또 5등에 당첨됐다`,
        '관중 2만 명이 떼창 중',
        '외야 쪽으로 강한 뒷바람이 분다',
        `${josa(p, '은/는')} 어젯밤 3시간밖에 못 잤다`,
        '포수가 딸꾹질을 멈추지 못한다',
      ];
      $('chips').replaceChildren(...texts.map((t) => {
        const chip = el('button', { type: 'button', className: 'chip', text: t });
        chip.addEventListener('click', () => submitVariable(t));
        return chip;
      }));
    }

    function renderInterpMode() {
      $('interp-mode').textContent = S.sample ? 'Claude가 해석해요 · 처음 쓸 때 허락을 물어요' : 'AI를 쓸 수 없어 규칙으로 해석해요';
    }

    function renderScorebug() {
      const st = S.st;
      const bs = batSideOf(st);
      const team = (side) => {
        const swatch = el('span', { className: 'swatch' });
        swatch.style.background = colorOf(side);
        return el('div', { className: `bug-team${side === bs && !S.over ? ' batting' : ''}` }, [swatch, el('span', { className: 'name', text: S.sc[side].name }), el('span', { className: 'runs', text: String(st[side]) })]);
      };
      const dots = (cls, n, on) => el('span', { className: cls }, Array.from({ length: n }, (_, i) => el('i', { className: i < on ? 'on' : '' })));
      const outs = Math.min(st.outs, 2);
      const lights = el('div', { className: 'lights', role: 'img', 'aria-label': `볼 ${S.count.b}, 스트라이크 ${S.count.s}, 아웃 ${Math.min(st.outs, 3)}` }, [
        el('span', { text: 'B' }), dots('b', 3, S.count.b), el('span', { text: 'S' }), dots('s', 2, S.count.s), el('span', { text: 'O' }), dots('o', 2, st.outs >= 3 ? 2 : outs),
      ]);
      const bases = el('span', { role: 'img', 'aria-label': basesText(st.bases) });
      const on = (b) => ((st.bases >> (b - 1)) & 1 ? colorOf(bs) : '#1B2A38');
      bases.innerHTML = `<svg class="bases" viewBox="0 0 34 30"><rect x="20" y="12" width="8" height="8" transform="rotate(45 24 16)" fill="${on(1)}" stroke="#74879A"/><rect x="13" y="3" width="8" height="8" transform="rotate(45 17 7)" fill="${on(2)}" stroke="#74879A"/><rect x="6" y="12" width="8" height="8" transform="rotate(45 10 16)" fill="${on(3)}" stroke="#74879A"/></svg>`;
      const count = el('span', { className: 'pitch-count' }, ['이 장면 투구 ', el('b', { text: String(S.pitchNo) })]);
      $('scorebug').replaceChildren(
        team('away'), team('home'),
        el('div', { className: 'bug-cell' }, [el('span', { className: 'bug-inning', text: `${st.inning}회${st.half ? '말' : '초'}` })]),
        el('div', { className: 'bug-cell' }, [lights, bases]),
        el('div', { className: 'bug-cell' }, [count]),
      );
    }

    let pitchTag = null;
    let lastTag = null;
    function fillPitchTag() {
      if (!pitchTag) return;
      if (!lastTag) pitchTag.replaceChildren(el('b', { text: '—' }), '첫 공을 기다리는 중');
      else pitchTag.replaceChildren(el('b', { text: `${lastTag.row[1]}km/h` }), `${D.meta.pitchTypes[lastTag.row[0]]} · ${lastTag.number}구 · 홈까지 ${Stage.plateTime(lastTag.row).toFixed(2)}초`);
    }
    function showPitchTag(row, number) {
      lastTag = { row, number };
      fillPitchTag();
    }

    function renderMatchup() {
      const bs = batSideOf(S.st);
      const fs = fieldSideOf(S.st);
      const b = player(currentBatterId());
      const p = player(S.sc.pitcher);
      const f3 = (x) => x.toFixed(3).replace(/^0/, '');
      const hand = b.bats === 'L' ? '좌타' : b.bats === 'S' ? '양타' : '우타';
      pitchTag = el('div', { className: 'pitch-tag', 'aria-live': 'polite' });
      fillPitchTag();
      $('matchup').replaceChildren(
        el('div', { className: 'card batter' }, [
          el('span', { className: 'role', text: `${slotOf(S.st) + 1}번 타자 · ${S.sc[bs].name}` }),
          el('span', { className: 'pname', text: b.name }),
          el('span', { className: 'line', text: `${hand} · 타율 ${f3(b.line.avg)} · 출루율 ${f3(b.line.obp)} · ${b.line.hr}홈런` }),
        ]),
        pitchTag,
        el('div', { className: 'card pitcher' }, [
          el('span', { className: 'role', text: `투수 · ${S.sc[fs].name}` }),
          el('span', { className: 'pname', text: p.name }),
          el('span', { className: 'line', text: `${p.throws === 'L' ? '좌투' : '우투'} · 평균자책 ${p.line.era.toFixed(2)} · ${p.line.k}삼진 ${p.line.bb}볼넷` }),
        ]),
      );
    }

    function tier(o) {
      const right = 1 - o.value - (o.tie || 0);
      const rightBase = 1 - o.base - (o.tieBase || 0);
      const num = (x) => (Number.isFinite(x) ? [pct(x), el('small', { text: '%' })] : ['—']);
      const delta = (d, side) => {
        const node = el('span', { className: 'delta', text: Number.isFinite(d) ? formatDelta(d) : '' });
        if (Number.isFinite(d) && Math.abs(d) >= 0.00005) node.style.color = d > 0 ? `var(--${side})` : '';
        return node;
      };
      const duel = el('div', { className: 'duel' }, [
        el('div', { className: 'side bat' }, [el('span', { className: 'who', text: o.left }), el('span', { className: 'num' }, num(o.value)), delta(o.value - o.base, 'bat')]),
        o.tie === undefined ? el('span', { className: 'mid' }) : el('span', { className: 'mid' }, [el('b', { text: `${pct(o.tie)}%` }), '무승부']),
        el('div', { className: 'side fld' }, [el('span', { className: 'who', text: o.right }), el('span', { className: 'num' }, num(right)), delta(right - rightBase, 'fld')]),
      ]);
      const bar = el('div', { className: 'bar', role: 'img', 'aria-label': `${o.left} ${Number.isFinite(o.value) ? pct(o.value) : '-'}%, ${o.right} ${Number.isFinite(right) ? pct(right) : '-'}%` });
      if (Number.isFinite(o.value)) {
        const fill = (cls, left, width) => {
          const f = el('i', { className: `fill ${cls}` });
          if (left !== null) f.style.left = `${left * 100}%`;
          f.style.width = `${Math.max(0, width) * 100}%`;
          return f;
        };
        bar.append(fill('bat', null, o.value), fill('tie', o.value, o.tie || 0), fill('fld', null, right));
        const ghost = el('i', { className: 'ghost' });
        ghost.style.left = `${o.base * 100}%`;
        bar.append(ghost);
      }
      const art = el('article', { className: `tier${o.dim ? ' dim' : ''}` }, [
        el('header', { className: 'tier-head' }, [el('h2', { text: o.title }), el('span', { className: 'note', text: o.note })]),
        duel,
        bar,
      ]);
      if (o.mix) art.append(o.mix);
      return art;
    }

    function renderTiers() {
      const { g, g0 } = gauges();
      const bs = batSideOf(S.st);
      const fs = fieldSideOf(S.st);
      const batTeam = S.sc[bs].name;
      const fldTeam = S.sc[fs].name;
      const b = player(currentBatterId());
      const p = player(S.sc.pitcher);
      let mix = null;
      if (g.dist) {
        const d = g.dist;
        const parts = [['삼진', d[0]], ['볼넷', d[1]], ['안타', d[5]], ['장타', d[3] + d[4]], ['홈런', d[2]], ['범타', d[6]]];
        mix = el('div', { className: 'mix' }, parts.map(([label, x]) => el('span', {}, [`${label} `, el('b', { text: pct(x) })])));
      }
      const over = S.over;
      $('tiers').replaceChildren(
        tier({
          title: '타석 승부', note: over ? '타석이 끝났어요' : `${S.count.b}볼 ${S.count.s}스트라이크 · 출루 대 아웃`,
          left: `${b.name} 출루`, right: `${p.name} 아웃`, value: g.batterWin, base: g0.batterWin, mix, dim: Boolean(over),
        }),
        tier({
          title: '이닝 승부', note: over ? `이 장면 이후 ${S.halfRuns}점` : `남은 아웃 ${3 - S.st.outs}개 · 기대 득점 ${S.v.expRuns.toFixed(2)}점`,
          left: `${batTeam} 추가 득점`, right: `${fldTeam} 무실점`, value: g.inningScore, base: g0.inningScore,
        }),
        tier({
          title: '경기 승부', note: over && over.kind === 'game' ? '경기 끝' : over ? '다음 이닝 시작 기준' : `${S.st.inning}회${S.st.half ? '말' : '초'} · ${S.sc.away.name} ${S.st.away} : ${S.st.home} ${S.sc.home.name}`,
          left: `${batTeam} 승리`, right: `${fldTeam} 승리`, value: winFor(bs, g), base: winFor(bs, g0), tie: g.tie, tieBase: g0.tie,
        }),
      );
    }

    function renderChain() {
      const box = $('chain');
      const active = S.effects.filter((e) => e.parts.some((p) => !p.expired));
      const title = el('span', { className: 'title', text: '나비효과' });
      if (!active.length || S.over) {
        box.replaceChildren(title, el('span', { className: 'empty', text: S.over ? '장면이 끝났어요. 처음 상황으로 돌아가 다른 변수를 넣어 보세요.' : '변수를 넣으면 타석, 이닝, 경기로 번지는 차이를 보여줘요.' }));
        return;
      }
      const { g, g0 } = gauges();
      const bs = batSideOf(S.st);
      const first = active[0].parts.find((p) => !p.expired);
      const cause = active.length === 1 ? `“${active[0].text.length > 20 ? `${active[0].text.slice(0, 19)}…` : active[0].text}”` : `변수 ${active.length}개`;
      const knob = active.length === 1 ? `${first.subjectName} ${T.KNOBS[first.knob].label} ${first.strength > 0 ? '+' : '−'}${Math.abs(first.strength)}` : '효과 합산';
      const link = (label, d) => el('span', { className: 'link' }, d === undefined ? [label] : [`${label} `, el('b', { className: 'd', text: formatDelta(d) })]);
      const arrow = () => el('span', { className: 'arrow', text: '→', 'aria-hidden': 'true' });
      const causeNode = el('span', { className: 'link cause', text: cause });
      box.replaceChildren(
        title, causeNode, arrow(), link(knob), arrow(),
        link(`${player(currentBatterId()).name} 출루`, g.batterWin - g0.batterWin), arrow(),
        link(`${S.sc[bs].name} 득점`, g.inningScore - g0.inningScore), arrow(),
        link(`${S.sc[bs].name} 승리`, winFor(bs, g) - winFor(bs, g0)),
      );
    }

    function renderEffects() {
      const list = $('effects');
      if (!S.effects.length) {
        list.replaceChildren(el('li', { className: 'none', text: '넣은 변수가 없어요. 위에 아무 TMI나 적어 보세요.' }));
        return;
      }
      list.replaceChildren(...S.effects.slice().reverse().map((e) => {
        const used = e.parts.length > 0 && e.parts.every((p) => p.expired);
        const remove = el('button', { type: 'button', className: 'fx-remove', text: '×', 'aria-label': `“${e.text}” 변수 빼기` });
        remove.addEventListener('click', () => removeEffect(e.id));
        const li = el('li', { className: `fx${used ? ' used' : ''}` }, [el('div', { className: 'fx-top' }, [el('p', { className: 'fx-quote', text: e.text }), remove])]);
        if (e.refused) li.append(el('p', { className: 'fx-why', text: e.reason }));
        else if (!e.parts.length) li.append(el('p', { className: 'fx-why', text: e.comment || '승부와 이어 붙일 방법이 없는 변수로 판정했어요. 차이는 0이에요.' }));
        else {
          li.append(el('div', { className: 'fx-rows' }, e.parts.map((p) => {
            const power = el('span', { className: 'power', text: (p.strength > 0 ? '▲' : '▼').repeat(Math.abs(p.strength)) });
            if (p.side !== 'all') power.style.color = `var(--${p.side})`;
            const [label, cls] = EVIDENCE[p.evidence];
            return el('div', { className: 'fx-row' }, [
              el('span', { className: 'subject', text: p.subjectName }),
              el('span', { text: T.KNOBS[p.knob].label }),
              power,
              el('span', { className: 'scope', text: p.expired ? '이번 타석 · 끝남' : p.scope === 'pa' ? '이번 타석만' : '경기 내내' }),
              el('span', { className: `tag ${cls}`.trim(), text: label }),
            ]);
          })));
          const why = e.comment || e.parts.map((p) => p.why).filter(Boolean).join(' · ');
          if (why) li.append(el('p', { className: 'fx-why', text: why }));
        }
        const foot = el('p', { className: 'fx-foot' }, [e.source]);
        if (e.example) foot.prepend(el('span', { className: 'tag example', text: '예시' }), ' ');
        li.append(foot);
        return li;
      }));
    }

    function renderLog() {
      const items = S.log.map((x) => el('li', { className: x.big ? 'big' : '' }, [el('span', { className: 'inn', text: x.inn }), el('span', { text: x.text })]));
      $('playlog').replaceChildren(...(items.length ? items : [el('li', { className: 'empty', text: '아직 끝난 타석이 없어요.' })]));
      const t = S.tally;
      const bs = S.sc[S.startBatSide].name;
      const fs = S.sc[S.startBatSide === 'home' ? 'away' : 'home'].name;
      $('tally').textContent = t.runs + t.zero ? `평행우주 ${t.runs + t.zero}번 · ${bs} 득점 ${t.runs} · ${fs} 무실점 ${t.zero}` : '';
    }

    function renderControls() {
      const playing = S.busy || Boolean(S.auto);
      $('btn-pitch').disabled = playing || Boolean(S.over);
      $('btn-pa').disabled = playing || Boolean(S.over);
      const half = $('btn-half');
      half.textContent = S.auto ? '멈추기' : '이닝 끝까지';
      half.disabled = S.auto ? false : playing || Boolean(S.over);
      $('btn-real').disabled = playing;
      $('btn-reset').disabled = S.busy;
      document.querySelectorAll('.scene').forEach((node) => { node.disabled = playing; });
      $('tmi-submit').disabled = S.interpreting;
    }

    function drawChart() {
      const canvas = $('wpchart');
      const g = canvas.getContext('2d');
      const w = Math.max(260, canvas.getBoundingClientRect().width || 640);
      const h = (w * 190) / 640;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const padL = 32;
      const padR = 46;
      const padT = 10;
      const padB = 12;
      const n = S.chart.length;
      const X = (i) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (w - padL - padR));
      const Y = (v) => padT + (1 - v) * (h - padT - padB);
      g.font = '11px "IBM Plex Sans KR", sans-serif';
      g.textAlign = 'right';
      g.textBaseline = 'middle';
      for (const v of [0, 0.5, 1]) {
        g.strokeStyle = v === 0.5 ? '#35506A' : '#223647';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(padL, Y(v));
        g.lineTo(w - padR, Y(v));
        g.stroke();
        g.fillStyle = '#74879A';
        g.fillText(`${v * 100}`, padL - 6, Y(v));
      }
      if (!n) return;
      const color = colorOf(S.startBatSide);
      g.beginPath();
      S.chart.forEach((p, i) => (i ? g.lineTo(X(i), Y(p.v)) : g.moveTo(X(i), Y(p.v))));
      g.lineTo(X(n - 1), Y(0));
      g.lineTo(X(0), Y(0));
      g.closePath();
      g.globalAlpha = 0.14;
      g.fillStyle = color;
      g.fill();
      g.globalAlpha = 1;
      g.setLineDash([4, 4]);
      g.strokeStyle = '#AEBDB7';
      g.lineWidth = 1.5;
      g.beginPath();
      S.chart.forEach((p, i) => (i ? g.lineTo(X(i), Y(p.v0)) : g.moveTo(X(i), Y(p.v0))));
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = color;
      g.lineWidth = 2.5;
      g.beginPath();
      S.chart.forEach((p, i) => (i ? g.lineTo(X(i), Y(p.v)) : g.moveTo(X(i), Y(p.v))));
      g.stroke();
      g.fillStyle = '#FFB547';
      S.chart.forEach((p, i) => {
        if (!p.mark) return;
        g.fillRect(X(i) - 1, padT, 2, 5);
      });
      const last = S.chart[n - 1];
      g.fillStyle = color;
      g.beginPath();
      g.arc(X(n - 1), Y(last.v), 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#EEF2E9';
      g.textAlign = 'left';
      g.font = '17px "VT323", monospace';
      g.fillText(`${pct(last.v)}%`, X(n - 1) + 8, Math.min(h - padB, Math.max(padT + 6, Y(last.v))));
      $('wp-caption').textContent = `${S.sc[S.startBatSide].name} 승리 확률 · 실선은 변수 포함, 점선은 변수 없음, 위쪽 눈금은 변수를 넣거나 뺀 순간`;
    }

    // ----- events -----
    $('btn-pitch').addEventListener('click', () => { playOnePitch(); });
    $('btn-pa').addEventListener('click', () => { autoPlay('pa'); });
    $('btn-half').addEventListener('click', () => {
      if (S.auto) {
        S.auto = null;
        renderControls();
      } else autoPlay('half');
    });
    $('btn-real').addEventListener('click', () => { playReal(); });
    $('btn-reset').addEventListener('click', () => {
      if (S.busy) return;
      S.auto = null;
      resetPlay();
    });
    $('speed').addEventListener('change', (ev) => { S.fast = ev.target.checked; });
    $('tmi-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      submitVariable($('tmi-input').value);
    });
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => drawChart()).observe($('wpchart'));

    renderInterpMode();
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('sample').then((fn) => {
        if (fn) {
          S.sample = fn;
          renderInterpMode();
        }
      }).catch(() => {});
    }
    loadScenario(D.scenarios[0].id);
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined' && window.TMI_DATA) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  return { josa, ruleInterpret, normalizeAI, toEngineTarget, pickPitch, applyPlay, headline, formatDelta, situationText };
}));
