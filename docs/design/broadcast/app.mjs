/* 중계 시안 상호작용. 확률은 TMI 야구 엔진이 이 장면(8/11 창원 KT–NC 9회초 2사 만루)에서 계산한 값이다. */
import { CALL_COLORS, createTracker, inZone, PITCH_COLORS, PITCH_TYPES } from './tracker.mjs';

const $ = (s) => document.querySelector(s);
const TEAM = { KT: '#D6D6D6', NC: '#86A8EE', HH: '#FF8A2A', OB: '#A3A7EA', SS: '#4C8FF7', HT: '#F0474B', WO: '#C9566C', LT: '#5C8DF6', LG: '#E0457B', SK: '#EF5261' };
const NAME = { KT: 'KT', NC: 'NC', HH: '한화', OB: '두산', SS: '삼성', HT: 'KIA', WO: '키움', LT: '롯데', LG: 'LG', SK: 'SSG' };

// 날짜, 구장, 원정, 홈, 이닝, 초0/말1, 아웃, 주자(1루1·2루2·3루4), 원정 점수, 홈 점수, 제목, 승부처 지수(엔진 사전 기대 변화 %p)
const SCENES = [
  ['2026-08-11', '창원', 'KT', 'NC', 9, 0, 2, 7, 3, 3, '9회초 2사 만루', 23.8],
  ['2026-08-12', '잠실', 'HH', 'OB', 9, 1, 2, 2, 3, 2, '9회말 2사 2루', 18.1],
  ['2026-08-13', '창원', 'KT', 'NC', 7, 1, 2, 3, 4, 2, '7회말 2사 1·2루', 9.6],
  ['2026-08-13', '광주', 'SS', 'HT', 9, 0, 1, 3, 7, 8, '9회초 1사 1·2루', 20.0],
  ['2026-08-18', '사직', 'WO', 'LT', 7, 1, 2, 3, 8, 7, '7회말 2사 1·2루', 12.3],
  ['2026-08-19', '사직', 'WO', 'LT', 9, 1, 1, 0, 4, 3, '9회말 1사 주자 없음', 9.6],
  ['2026-08-20', '대전', 'HT', 'HH', 8, 0, 2, 1, 5, 6, '8회초 2사 1루', 7.7],
  ['2026-08-23', '고척', 'HT', 'WO', 9, 1, 2, 7, 7, 4, '9회말 2사 만루', 12.1],
  ['2026-08-25', '광주', 'LT', 'HT', 9, 1, 2, 7, 5, 4, '9회말 2사 만루, 대타', 38.3],
  ['2026-08-25', '잠실', 'NC', 'LG', 8, 1, 1, 5, 2, 0, '8회말 1사 1·3루', 15.4],
  ['2026-08-26', '수원', 'OB', 'KT', 9, 1, 1, 7, 4, 3, '9회말 1사 만루', 25.2],
  ['2026-08-30', '대전', 'NC', 'HH', 10, 0, 2, 6, 7, 7, '10회초 2사 2·3루', 19.8],
  ['2026-09-02', '창원', 'HT', 'NC', 9, 1, 2, 7, 2, 2, '9회말 2사 만루', 24.3],
  ['2026-09-03', '고척', 'SK', 'WO', 9, 1, 2, 4, 2, 2, '9회말 2사 3루', 17.7],
  ['2026-09-04', '광주', 'KT', 'HT', 8, 1, 2, 7, 2, 1, '8회말 2사 만루', 25.7],
  ['2026-09-10', '광주', 'NC', 'HT', 11, 1, 1, 5, 2, 1, '11회말 1사 1·3루, 마지막 이닝', 19.3],
].map(([date, stadium, away, home, inning, half, outs, bases, as, hs, title, swing]) => ({ date, stadium, away, home, inning, half, outs, bases, as, hs, title, swing }));

// 카운트별 엔진 값: bat 타자 출루, inn 공격 팀 이번 이닝 득점, away/tie/home 경기
const C = (bat, home, tie, away) => ({ bat, inn: bat, home, tie, away });
const COUNTS = {
  '0-0': { base: C(0.4066, 0.3233, 0.1341, 0.5426), tmi: C(0.4136, 0.3202, 0.1327, 0.547), toon: C(0.4492, 0.3047, 0.1256, 0.5698) },
  '1-0': { base: C(0.4678, 0.3018, 0.1229, 0.5753), tmi: C(0.4748, 0.2987, 0.1216, 0.5797), toon: C(0.5096, 0.2833, 0.1145, 0.6022) },
  '1-1': { base: C(0.3861, 0.3313, 0.138, 0.5307), tmi: C(0.3924, 0.3285, 0.1368, 0.5348), toon: C(0.4249, 0.3141, 0.1302, 0.5556) },
  '2-1': { base: C(0.4716, 0.3014, 0.1225, 0.5761), tmi: C(0.4777, 0.2986, 0.1212, 0.5802), toon: C(0.5087, 0.2846, 0.1149, 0.6006) },
};

// 이용준 PTS 표본
const POOL = [
  [3, 126, 0, 0, 1, 1, -1.785, 5.993, 6.52, -114.278, -3.436, -0.426, 17.726, -29.067, 3.234, 1.568],
  [7, 134, 0, 0, 2, 0, -1.63, 5.874, 7.663, -121.145, -8.66, -12.749, 26.934, -25.097, 3.29, 1.596],
  [3, 131, 3, 0, 0, 1, -1.737, 6.062, 5.263, -118.459, -1.853, -1.791, 21.13, -28.617, 3.234, 1.568],
  [0, 144, 0, 1, 1, 1, -1.503, 6.051, 6.638, -130.487, -2.212, -13.468, 29.927, -13.881, 3.234, 1.568],
  [7, 129, 3, 0, 2, 0, -1.443, 5.981, 4.422, -117.507, 0.322, -11.82, 22.64, -28.093, 3.29, 1.596],
  [0, 147, 3, 2, 2, 0, -1.645, 5.942, 5.386, -133.458, -5.875, -12.96, 30.399, -12.37, 3.29, 1.596],
  [0, 144, 0, 2, 1, 1, -1.462, 5.955, 8.054, -129.673, -10.146, -12.954, 26.764, -12.163, 3.234, 1.568],
  [0, 143, 1, 3, 1, 1, -1.673, 5.975, 6.359, -129.873, -6.775, -14.222, 28.371, -15.56, 3.234, 1.568],
];
const SCRIPT = ['B', 'S', 'B'];

const pct = (v) => (v * 100).toFixed(1);
function fmtDelta(pp) {
  const a = Math.abs(pp);
  if (a < 0.005) return '±0.00';
  return (pp > 0 ? '+' : '−') + (a < 1 ? a.toFixed(2) : a.toFixed(1));
}
const halfName = (s) => `${s.inning}회${s.half ? '말' : '초'}`;
const basesSvg = (b, size = '') =>
  `<svg class="bases" ${size} viewBox="0 0 30 24" aria-hidden="true">${[[15, 1, 2], [24, 10, 1], [6, 10, 4]]
    .map(([x, y, bit]) => `<path d="M${x} ${y}l6 6-6 6-6-6z" fill="${b & bit ? '#ffd23f' : 'none'}" stroke="${b & bit ? '#ffd23f' : '#3a4553'}" stroke-width="1.5"/>`)
    .join('')}</svg>`;
const outsHtml = (n) => `<span class="outs" aria-label="${n}아웃">${[0, 1].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;

/* ---------- 로비 ---------- */
function renderLobby() {
  const [f, ...rest] = SCENES;
  const feat = $('#feature');
  feat.style.setProperty('--away', TEAM[f.away]);
  feat.style.setProperty('--home', TEAM[f.home]);
  feat.innerHTML = `
    <p class="f-eyebrow">오늘의 명장면 · 8월 11일 (화) · ${f.stadium}</p>
    <div class="f-score">
      <div class="f-team"><small>원정</small><b>${NAME[f.away]}</b><em>${f.as}</em></div>
      <div class="f-state">${basesSvg(f.bases, 'style="width:46px;height:37px"')}${outsHtml(f.outs)}</div>
      <div class="f-team home"><small>홈</small><b>${NAME[f.home]}</b><em>${f.hs}</em></div>
    </div>
    <p class="f-title">${f.title}</p>
    <p class="f-matchup"><b>최원준</b> 좌타 .342 &nbsp;vs&nbsp; <b>이용준</b> 우투 ERA 2.65</p>
    <div class="swing"><span>승부처 지수</span><div class="swing-bar"><i style="width:${Math.min(f.swing / 40, 1) * 100}%"></i></div><b>${f.swing.toFixed(1)}</b></div>
    <button class="btn primary" type="button">이 장면 다시 치르기</button>`;
  $('#games-count').textContent = `${rest.length}장면`;
  $('#games').innerHTML = [...rest]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map(
      (s) => `<li class="game">
        <div class="g-date"><b>${s.date.slice(5).replace('-', '.')}</b><small>${s.stadium}</small></div>
        <div class="g-teams">
          <div class="g-row ${s.half === 0 ? 'bat' : ''}" style="--c:${TEAM[s.away]}"><i></i><span>${NAME[s.away]}</span><em>${s.as}</em></div>
          <div class="g-row ${s.half === 1 ? 'bat' : ''}" style="--c:${TEAM[s.home]}"><i></i><span>${NAME[s.home]}</span><em>${s.hs}</em></div>
        </div>
        <div class="g-side"><p>${halfName(s)}</p><span>${basesSvg(s.bases, 'style="width:24px;height:19px"')}${outsHtml(s.outs)}</span><span>지수 ${s.swing.toFixed(1)}</span></div>
      </li>`,
    )
    .join('');
}

/* ---------- 플레이 ---------- */
const bugHtml = (count, live) => `
  <button class="bug-back" type="button" aria-label="명장면으로">‹</button>
  <div class="bug-teams">
    <div class="bug-team bat" style="--c:${TEAM.KT}"><i></i><b>KT</b><em>3</em></div>
    <div class="bug-team" style="--c:${TEAM.NC}"><i></i><b>NC</b><em>3</em></div>
  </div>
  <span class="bug-sep"></span>
  <div class="bug-inning"><small>▲</small>9</div>
  ${basesSvg(7)}
  <div class="bug-count"><b ${live ? 'id="count"' : ''}>${count}</b>${outsHtml(2)}</div>`;

const st = { tier: 'game', mode: 'real', count: '0-0', seq: ['0-0'], pitchNo: 0, busy: false, lastType: -1, used: new Set() };

function pick(values) {
  const cur = st.mode === 'toon' ? values.toon : values.tmi;
  const key = st.tier === 'game' ? 'away' : st.tier === 'inning' ? 'inn' : 'bat';
  return { cur, base: values.base, v: cur[key], b: values.base[key] };
}

function renderWp() {
  const { cur, base, v, b } = pick(COUNTS[st.count]);
  const labels = { game: 'KT 승리확률', inning: 'KT 이번 이닝 득점확률', pa: '최원준 출루확률' };
  $('#wp-label').textContent = labels[st.tier];
  $('#wp-num').innerHTML = `${pct(v)}<small>%</small>`;
  const d = (v - b) * 100;
  const delta = $('#wp-delta');
  delta.className = `delta ${d > 0.005 ? 'up' : d < -0.005 ? 'down' : 'flat'}`;
  delta.innerHTML = `<small>TMI</small>${fmtDelta(d)}%p`;

  const bar = $('#wp-bar');
  bar.style.setProperty('--a', TEAM.KT);
  bar.style.setProperty('--b', TEAM.NC);
  const tie = st.tier === 'game' ? cur.tie : 0;
  const right = st.tier === 'game' ? cur.home : 1 - v;
  bar.querySelector('.seg-a').style.flexBasis = `${v * 100}%`;
  bar.querySelector('.seg-t').style.flexBasis = `${tie * 100}%`;
  bar.querySelector('.seg-t').style.display = tie ? '' : 'none';
  bar.querySelector('.seg-b').style.flexBasis = `${right * 100}%`;
  bar.querySelector('.ghost').style.left = `calc(${b * 100}% - 1px)`;

  const mode = st.mode === 'toon' ? '만화 모드 · 효과 6배 과장' : '현실 모드';
  const subs = {
    game: `TMI 없이 <b>${pct(b)}%</b> · 무승부 ${pct(cur.tie)}% · NC ${pct(cur.home)}% · ${mode}`,
    inning: `TMI 없이 <b>${pct(b)}%</b>${st.count === '0-0' && st.mode === 'real' ? ' · 기대 득점 0.93→0.95점' : ''} · ${mode}`,
    pa: `TMI 없이 <b>${pct(b)}%</b> · 이용준 아웃 ${pct(1 - v)}% · ${mode}`,
  };
  $('#wp-sub').innerHTML = subs[st.tier];
  drawSpark();
  renderPills();
}

function drawSpark() {
  const canvas = $('#spark');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const vals = st.seq.map((k) => pick(COUNTS[k]).v);
  const lo = Math.min(...vals) - 0.03;
  const hi = Math.max(...vals) + 0.03;
  const x = (i) => 4 + (i * (w - 8)) / 3;
  const y = (v) => h - 4 - ((v - lo) / (hi - lo)) * (h - 8);
  g.strokeStyle = '#2a3441';
  g.setLineDash([2, 3]);
  g.beginPath();
  g.moveTo(0, y(vals[0]));
  g.lineTo(w, y(vals[0]));
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = '#ffd23f';
  g.lineWidth = 2;
  g.lineJoin = 'round';
  g.beginPath();
  vals.forEach((v, i) => (i ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v))));
  g.stroke();
  const last = vals.length - 1;
  g.fillStyle = '#ffd23f';
  g.beginPath();
  g.arc(x(last), y(vals[last]), 3, 0, Math.PI * 2);
  g.fill();
}

function renderPills() {
  const c = COUNTS['0-0'];
  const cur = st.mode === 'toon' ? c.toon : c.tmi;
  const d = (cur.away - c.base.away) * 100;
  $('#pills').innerHTML = `
    <button class="pill" type="button" style="--c:var(--g-fun)"><i></i><span class="p-text">짜장면 곱빼기</span><span class="p-knob">투수 체력 ↓</span><b>${fmtDelta(d)}%p</b></button>
    <button class="pill add" type="button">+ TMI 걸기</button>`;
}

let tracker;
const pitchBtn = () => $('#pitch');

function pickRow(call) {
  const ok = POOL.map((row, i) => ({ row, i })).filter(({ row, i }) => !st.used.has(i) && (inZone(row) ? 'S' : 'B') === call);
  return (ok.find(({ row }) => row[0] !== st.lastType) ?? ok[0]).i;
}

async function onPitch() {
  if (st.busy) {
    tracker.skip();
    return;
  }
  if (st.pitchNo >= SCRIPT.length) {
    resetPlay();
    return;
  }
  const call = SCRIPT[st.pitchNo];
  const i = pickRow(call);
  const row = POOL[i];
  st.used.add(i);
  st.lastType = row[0];
  st.busy = true;
  pitchBtn().textContent = '건너뛰기';
  const info = $('#pitch-info');
  info.hidden = false;
  info.innerHTML = `<span class="pi-type" style="--c:${PITCH_COLORS[row[0]]}"><i></i>${st.pitchNo + 1}구 ${PITCH_TYPES[row[0]]}</span><b class="pi-speed">${row[1]}<small>km/h</small></b>`;
  $('#call').innerHTML = '';
  await tracker.throwPitch(row, st.pitchNo + 1, call);
  st.pitchNo += 1;
  const [b, s] = st.count.split('-').map(Number);
  st.count = call === 'B' ? `${b + 1}-${s}` : `${b}-${s + 1}`;
  st.seq.push(st.count);
  $('#call').innerHTML = `<span style="--c:${CALL_COLORS[call]}">${call === 'B' ? '볼' : '스트라이크'}</span>`;
  $('#count').textContent = st.count;
  renderWp();
  st.busy = false;
  pitchBtn().textContent = st.pitchNo >= SCRIPT.length ? '처음부터' : '한 구 던지기';
}

function resetPlay() {
  tracker.reset();
  Object.assign(st, { count: '0-0', seq: ['0-0'], pitchNo: 0, busy: false, lastType: -1, used: new Set() });
  $('#pitch-info').hidden = true;
  $('#call').innerHTML = '';
  $('#count').textContent = '0-0';
  pitchBtn().textContent = '한 구 던지기';
  renderWp();
}

function initPlay() {
  $('#bug').innerHTML = bugHtml('0-0', true);
  document.querySelector('[data-bug="static"]').innerHTML = bugHtml('0-0', false);
  $('#lower-third').innerHTML = `
    <div class="lt-p" style="--c:${TEAM.KT}"><small>타자 · 좌타</small><b>최원준</b><span>타율 .342 · OPS .884</span></div>
    <span class="lt-vs">VS</span>
    <div class="lt-p right" style="--c:${TEAM.NC}"><small>투수 · 우투</small><b>이용준</b><span>ERA 2.65 · WHIP 1.53</span></div>`;
  tracker = createTracker($('#tracker'), { bases: 7 });
  const still = createTracker(document.querySelector('[data-tracker="static"]'), { bases: 7 });
  tracker.resize();
  still.resize();
  document.fonts.ready.then(() => {
    tracker.draw();
  });
  pitchBtn().addEventListener('click', onPitch);
  document.querySelectorAll('.seg [data-tier]').forEach((btn) =>
    btn.addEventListener('click', () => {
      st.tier = btn.dataset.tier;
      document.querySelectorAll('.seg [data-tier]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
      renderWp();
    }),
  );
  document.querySelectorAll('.mode [data-mode]').forEach((btn) =>
    btn.addEventListener('click', () => {
      st.mode = btn.dataset.mode;
      document.querySelectorAll('.mode [data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
      renderWp();
    }),
  );
  renderWp();
}

/* ---------- 결과 ---------- */
function initResult() {
  const final = $('#final');
  final.style.setProperty('--win', TEAM.KT);
  final.innerHTML = `
    <p class="eyebrow">경기 종료 · 다시 치른 결과(예시)</p>
    <div class="final-score"><div class="fs-team win"><b>KT</b><em>5</em></div><span class="fs-colon">:</span><div class="fs-team"><b>NC</b><em>3</em></div></div>
    <h2>KT 승리</h2>
    <p class="decider">9회초 2사 만루에서 2점, 9회말 삼자범퇴</p>`;
  const groups = [
    { label: 'KT 승', n: 547, base: 543, color: TEAM.KT },
    { label: '무승부', n: 133, base: 134, color: '#3a434d' },
    { label: 'NC 승', n: 320, base: 323, color: TEAM.NC },
  ];
  $('#legend').innerHTML = groups
    .map((grp) => {
      const d = grp.n - grp.base;
      const diff = d ? ` <span class="${d > 0 ? 'up' : ''}">${d > 0 ? '+' : '−'}${Math.abs(d)}</span>` : '';
      return `<div style="--c:${grp.color}"><small>${grp.label}</small><b>${grp.n}</b><em>TMI 없이 ${grp.base}${diff}</em></div>`;
    })
    .join('');
  const canvas = $('#dots');
  // 크기는 한 번만 정한다: 프레임마다 캔버스 속성 폭을 clientWidth×dpr로 바꾸면 auto 격자 트랙이 따라 커지며 무한히 자란다
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.parentElement.clientWidth - 32;
  const h = Math.round((w * 25) / 40);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const start = performance.now();
  const paint = (now) => {
    g.clearRect(0, 0, w, h);
    const k = Math.min((now - start) / 1400, 1);
    const filled = Math.round(1000 * (1 - (1 - k) ** 3));
    const cell = w / 40;
    let idx = 0;
    for (const grp of groups) {
      for (let j = 0; j < grp.n; j++, idx++) {
        const cxp = (idx % 40) * cell + cell / 2;
        const cyp = Math.floor(idx / 40) * (h / 25) + h / 50;
        g.fillStyle = idx < filled ? grp.color : '#161d26';
        g.beginPath();
        g.arc(cxp, cyp, cell * 0.33, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (k < 1) requestAnimationFrame(paint);
  };
  requestAnimationFrame(paint);
  $('#open').addEventListener('click', () => {
    $('#sealed').innerHTML = `<div class="truth"><b>실제: 최원준 우익수 앞 1루타, 2점</b><span>최종 KT 7 : 3 NC · 네이버 NC 승리확률 47.5% → 8.9%</span></div>`;
  });
}

renderLobby();
initPlay();
initResult();

// ?shot: 캡처용 한 줄 배치, ?demo=N: 공 N개를 연출 없이 바로 던진다(헤드리스 캡처용)
const params = new URLSearchParams(location.search);
if (params.has('shot')) {
  document.querySelector('.page-head').hidden = true;
  document.querySelectorAll('.shot figcaption').forEach((f) => (f.hidden = true));
  Object.assign(document.querySelector('.gallery').style, { flexWrap: 'nowrap', justifyContent: 'flex-start', gap: '16px', padding: '16px' });
}
if (params.has('demo')) {
  (async () => {
    const n = Math.min(Number(params.get('demo')) || 3, SCRIPT.length);
    for (let i = 0; i < n; i++) {
      const pending = onPitch();
      tracker.skip();
      await pending;
    }
  })();
}
