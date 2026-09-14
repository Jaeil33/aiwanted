/* Broadcast stage for TMI 야구: a catcher-view canvas where a real tracked pitch flies from an animated pitcher to an
   animated batter, batted balls carry into the park, and a mini diamond moves the runners. Pure geometry is exported. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Stage = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const W = 960;
  const H = 540;
  const CAMERA = { y: -14, z: 6, f: 1150, cx: W / 2, hy: 150 }; // feet behind the plate, eye height, focal length in px
  const TRACK_Y0 = 55; // tracking starts every pitch 55 ft from the plate
  const PLATE_Y = 0.7083; // tracking reports the plate crossing 8.5 in in front of the tip
  const MITT_Y = -1.6;
  const GRAVITY = 32.17;
  const DRAG = 0.0012; // per ft; kept low to stand in for backspin lift
  const BALL_R = 0.121;

  // ---------- pure geometry ----------
  function project(x, y, z) {
    const d = y - CAMERA.y;
    return { x: CAMERA.cx + (CAMERA.f * x) / d, y: CAMERA.hy - (CAMERA.f * (z - CAMERA.z)) / d, s: CAMERA.f / d };
  }

  // row: [type, speed, code, balls, strikes, stance, x0, z0, vx0, vy0, vz0, ax, ay, az, topSz, bottomSz]
  function pitchAt(r, t) {
    return {
      x: r[6] + r[8] * t + 0.5 * r[11] * t * t,
      y: TRACK_Y0 + r[9] * t + 0.5 * r[12] * t * t,
      z: r[7] + r[10] * t + 0.5 * r[13] * t * t,
    };
  }

  function timeToY(r, yTarget) {
    const a = 0.5 * r[12];
    const b = r[9];
    const c = TRACK_Y0 - yTarget;
    if (Math.abs(a) < 1e-9) return -c / b;
    return (-b - Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * a);
  }

  function plateTime(r) {
    return timeToY(r, PLATE_Y);
  }

  const lerp = (a, b, u) => a + (b - a) * u;
  const clamp01 = (u) => Math.max(0, Math.min(1, u));
  const smooth = (u) => u * u * (3 - 2 * u);

  // spray: degrees from straight center field, negative toward third base / left field
  function battedPreset(play, bats, u1, u2) {
    const pull = bats === 'L' ? 1 : -1;
    const side = u2 < 0.5 ? -1 : 1;
    switch (play) {
      case 'HR': return { kind: 'HR', ev: lerp(155, 170, u1), la: lerp(24, 32, u2), spray: pull * lerp(8, 38, u1) };
      case '3B': return { kind: 'gap', ev: lerp(145, 155, u1), la: lerp(14, 20, u2), spray: side * lerp(30, 42, u1) };
      case '2B': return { kind: 'gap', ev: lerp(140, 152, u1), la: lerp(12, 20, u2), spray: side * lerp(18, 40, u1) };
      case '1B': return u2 < 0.5
        ? { kind: 'grounder', ev: lerp(125, 140, u1), la: lerp(-4, 4, u2 * 2), spray: lerp(-30, 30, u1), stopAt: 175 }
        : { kind: 'liner', ev: lerp(110, 125, u1), la: lerp(10, 16, (u2 - 0.5) * 2), spray: lerp(-35, 35, u1) };
      case 'GB':
      case 'DP': return { kind: 'grounder', ev: lerp(105, 125, u1), la: lerp(-10, -2, u2), spray: pull * lerp(-10, 30, u1), stopAt: 118 };
      case 'FB':
      case 'SF': return { kind: 'fly', ev: lerp(118, 130, u1), la: lerp(34, 42, u2), spray: lerp(-32, 32, u1) };
      case 'LD': return { kind: 'liner', ev: lerp(125, 140, u1), la: lerp(8, 14, u2), spray: pull * lerp(-5, 25, u1), stopAt: 125 };
      case 'F': return { kind: 'foul', ev: lerp(80, 110, u1), la: lerp(35, 70, u2), spray: (u1 < 0.5 ? -1 : 1) * lerp(100, 150, u2) };
      default: return { kind: 'fly', ev: 120, la: 20, spray: 0 };
    }
  }

  function flight(spec) {
    const dt = 1 / 120;
    const la = (spec.la * Math.PI) / 180;
    const sp = (spec.spray * Math.PI) / 180;
    let x = 0;
    let y = 1.4;
    let z = 2.6;
    let vx = spec.ev * Math.cos(la) * Math.sin(sp);
    let vy = spec.ev * Math.cos(la) * Math.cos(sp);
    let vz = spec.ev * Math.sin(la);
    let t = 0;
    let apex = z;
    let rolling = false;
    const bounces = spec.kind === 'grounder' || spec.kind === 'gap';
    const points = [{ t, x, y, z }];
    for (let i = 1; i <= 120 * 8; i++) {
      const v = Math.hypot(vx, vy, vz);
      if (rolling) {
        const keep = 1 - 1.2 * dt;
        vx *= keep;
        vy *= keep;
      } else {
        vx -= DRAG * v * vx * dt;
        vy -= DRAG * v * vy * dt;
        vz -= (GRAVITY + DRAG * v * vz) * dt;
      }
      x += vx * dt;
      y += vy * dt;
      z += vz * dt;
      t += dt;
      apex = Math.max(apex, z);
      let stop = false;
      if (z <= 0) {
        z = 0;
        if (!bounces) stop = true;
        else if (Math.abs(vz) > 4) {
          vz = -vz * 0.42;
          vx *= 0.86;
          vy *= 0.86;
        } else {
          vz = 0;
          rolling = true;
        }
      }
      const dist = Math.hypot(x, y);
      if (spec.stopAt && dist >= spec.stopAt) stop = true;
      if (rolling && Math.hypot(vx, vy) < 6) stop = true;
      if (spec.kind === 'foul' && (t > 1.4 || y < CAMERA.y + 3)) stop = true;
      if (spec.kind === 'HR' && dist > 470) stop = true;
      if (stop || i % 4 === 0) points.push({ t, x, y, z });
      if (stop) break;
    }
    const last = points[points.length - 1];
    return { points, landing: { x: last.x, y: last.y }, apex, distance: Math.hypot(last.x, last.y), duration: last.t };
  }

  function pathAt(path, t) {
    const pts = path.points;
    if (t <= 0) return pts[0];
    if (t >= pts[pts.length - 1].t) return pts[pts.length - 1];
    let i = 1;
    while (pts[i].t < t) i += 1;
    const a = pts[i - 1];
    const b = pts[i];
    const u = (t - a.t) / (b.t - a.t);
    return { t, x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u) };
  }

  function poseAt(keys, t) {
    const pick = (j) => Object.fromEntries(Object.entries(j).map(([k, v]) => [k, [v[0], v[1]]]));
    if (t <= keys[0].t) return pick(keys[0].j);
    const last = keys[keys.length - 1];
    if (t >= last.t) return pick(last.j);
    let i = 0;
    while (t > keys[i + 1].t) i += 1;
    const a = keys[i];
    const b = keys[i + 1];
    const e = smooth((t - a.t) / (b.t - a.t));
    const out = {};
    for (const name of Object.keys(a.j)) {
      out[name] = [a.j[name][0] + (b.j[name][0] - a.j[name][0]) * e, a.j[name][1] + (b.j[name][1] - a.j[name][1]) * e];
    }
    return out;
  }

  // ---------- figures (feet; pitcher front view with throwing arm on -x, batter profile facing the plate on +x) ----------
  const PITCHER_SET = { head: [0, 5.75], neck: [0, 5.25], shT: [-0.72, 5.0], shG: [0.72, 5.0], elT: [-0.62, 4.25], elG: [0.62, 4.25], haT: [-0.12, 4.35], haG: [0.12, 4.4], hipT: [-0.42, 3.15], hipG: [0.42, 3.15], knT: [-0.5, 1.6], knG: [0.5, 1.6], ftT: [-0.55, 0], ftG: [0.55, 0] };
  const RELEASE_AT = 0.76;
  const PITCHER_KEYS = [
    { t: 0, j: PITCHER_SET },
    { t: 0.32, j: { head: [0.05, 5.8], neck: [0.05, 5.3], shT: [-0.55, 5.05], shG: [0.6, 5.05], elT: [-0.45, 4.35], elG: [0.55, 4.4], haT: [0, 4.55], haG: [0.12, 4.6], hipT: [-0.35, 3.2], hipG: [0.35, 3.25], knT: [-0.42, 1.65], knG: [0.55, 3.45], ftT: [-0.5, 0], ftG: [0.3, 2.35] } },
    { t: 0.62, j: { head: [0.15, 5.4], neck: [0.12, 4.95], shT: [-0.75, 4.75], shG: [0.85, 4.85], elT: [-1.25, 5.05], elG: [1.2, 4.7], haT: [-1.45, 6.0], haG: [1.55, 4.5], hipT: [-0.5, 2.75], hipG: [0.45, 2.75], knT: [-0.75, 1.3], knG: [0.95, 1.35], ftT: [-0.75, 0.05], ftG: [1.05, -0.7] } },
    { t: RELEASE_AT, j: { head: [0.02, 4.95], neck: [0, 4.5], shT: [-0.72, 4.35], shG: [0.78, 4.3], elT: [-0.95, 5.1], elG: [0.95, 3.85], haT: [-0.62, 5.75], haG: [0.7, 3.6], hipT: [-0.45, 2.55], hipG: [0.45, 2.55], knT: [-0.75, 1.45], knG: [0.9, 1.1], ftT: [-0.55, 0.55], ftG: [1.05, -0.7] } },
    { t: 0.92, j: { head: [0.35, 4.35], neck: [0.3, 3.95], shT: [-0.4, 3.85], shG: [0.95, 3.75], elT: [0.25, 3.2], elG: [1.2, 3.35], haT: [0.85, 2.35], haG: [1.15, 2.95], hipT: [-0.35, 2.35], hipG: [0.5, 2.35], knT: [-0.9, 1.9], knG: [0.95, 1.0], ftT: [-1.25, 2.5], ftG: [1.05, -0.7] } },
    { t: 1.05, j: { head: [0.3, 4.9], neck: [0.26, 4.45], shT: [-0.5, 4.3], shG: [0.9, 4.25], elT: [0, 3.6], elG: [1.05, 3.7], haT: [0.5, 3.1], haG: [1.0, 3.3], hipT: [-0.4, 2.7], hipG: [0.5, 2.7], knT: [-0.8, 1.3], knG: [0.95, 1.2], ftT: [-0.9, 0.3], ftG: [1.05, -0.5] } },
    { t: 1.5, j: PITCHER_SET },
  ];
  const BAT = {
    stance: { head: [-0.05, 5.6], neck: [-0.1, 5.15], sh: [-0.2, 4.9], el: [-0.75, 4.55], ha: [-0.55, 5.0], hip: [-0.1, 3.05], knB: [-0.75, 1.55], knF: [0.55, 1.55], ftB: [-0.95, 0], ftF: [0.85, 0], bat: [115, 0] },
    load: { head: [-0.15, 5.55], neck: [-0.2, 5.1], sh: [-0.3, 4.85], el: [-0.95, 4.5], ha: [-0.85, 5.05], hip: [-0.25, 3.0], knB: [-0.8, 1.5], knF: [0.35, 1.8], ftB: [-0.95, 0], ftF: [0.65, 0.25], bat: [125, 0] },
    stride: { head: [0.05, 5.45], neck: [0, 5.0], sh: [-0.1, 4.75], el: [-0.8, 4.4], ha: [-0.75, 4.9], hip: [0, 2.9], knB: [-0.8, 1.4], knF: [0.9, 1.45], ftB: [-0.95, 0], ftF: [1.35, 0], bat: [135, 0] },
    contact: { head: [0.15, 5.4], neck: [0.12, 4.95], sh: [0.2, 4.6], el: [0.35, 3.95], ha: [0.75, 3.95], hip: [0.15, 2.85], knB: [-0.55, 1.2], knF: [1.0, 1.5], ftB: [-0.75, 0.2], ftF: [1.35, 0], bat: [-25, 0] },
    follow: { head: [0.1, 5.45], neck: [0.05, 5.0], sh: [0.05, 4.75], el: [0.5, 4.9], ha: [0.35, 5.2], hip: [0.1, 2.9], knB: [-0.45, 1.35], knF: [0.95, 1.5], ftB: [-0.55, 0.45], ftF: [1.35, 0], bat: [160, 0] },
    take: { head: [-0.05, 5.55], neck: [-0.1, 5.1], sh: [-0.2, 4.85], el: [-0.85, 4.5], ha: [-0.7, 5.0], hip: [-0.05, 3.0], knB: [-0.8, 1.5], knF: [0.8, 1.5], ftB: [-0.95, 0], ftF: [1.1, 0], bat: [122, 0] },
  };
  const BATTER_X = 2.9;
  const FIELDERS = [[-80, 92], [78, 88], [32, 132], [-32, 128], [-155, 262], [0, 318], [155, 262]];
  const BASES = [[0, 0], [63.6, 63.6], [0, 127.3], [-63.6, 63.6], [0, 0]];
  const SKIN = '#D6A583';
  const INK = '#08121C';
  const CHALK = '#EEF2E9';
  const CALLS = { B: ['볼', '#4FD37F'], T: ['스트라이크', '#FFD34E'], S: ['헛스윙', '#FFD34E'], F: ['파울', '#C9D2D8'], X: ['타격', '#EEF2E9'] };

  function mix(hex, other, amount) {
    const a = parseInt(hex.slice(1), 16);
    const b = parseInt(other.slice(1), 16);
    const ch = (v, s) => (v >> s) & 255;
    const m = (s) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * amount);
    return `rgb(${m(16)}, ${m(8)}, ${m(0)})`;
  }

  function uniform(team) {
    return team.home
      ? { jersey: '#ECEFEA', trim: team.color, pants: '#D5DAD3', cap: mix(team.color, '#000000', 0.2) }
      : { jersey: mix(team.color, '#0A1520', 0.3), trim: '#ECEFEA', pants: '#98A1A7', cap: mix(team.color, '#000000', 0.4) };
  }

  function basePoint(q) {
    const i = Math.max(0, Math.min(3, Math.floor(q)));
    const u = q - i;
    return [lerp(BASES[i][0], BASES[i + 1][0], u), lerp(BASES[i][1], BASES[i + 1][1], u)];
  }

  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- canvas stage ----------
  function createStage(canvas) {
    const g = canvas.getContext('2d');
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = {
      bat: { color: '#F0474B', home: true, bats: 'R' },
      fld: { color: '#5C8DF6', home: false, throws: 'R' },
      zone: { top: 3.4, bot: 1.6 },
      bases: 0,
      markers: [],
      board: ['', ''],
    };
    let uBat = uniform(scene.bat);
    let uFld = uniform(scene.fld);
    let scale = 1;
    let ui = 1;
    let bg = null;
    let anim = null;
    let call = null;
    let banner = null;
    let sparks = [];
    let fielders = FIELDERS.map((p) => p.slice());

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const bw = Math.max(320, Math.round((rect.width || W) * dpr));
      canvas.width = bw;
      canvas.height = Math.round((bw * H) / W);
      scale = bw / W;
      ui = Math.min(2.2, Math.max(1, 560 / Math.max(rect.width || W, 1)));
      bg = buildBackground();
    }

    function buildBackground() {
      const c = document.createElement('canvas');
      c.width = Math.round(W * scale);
      c.height = Math.round(H * scale);
      const b = c.getContext('2d');
      b.setTransform(scale, 0, 0, scale, 0, 0);
      const sky = b.createLinearGradient(0, 0, 0, 175);
      sky.addColorStop(0, '#040A11');
      sky.addColorStop(1, '#10263A');
      b.fillStyle = sky;
      b.fillRect(0, 0, W, 180);
      for (const [lx, ly, r] of [[96, 16, 250], [864, 16, 250], [480, -60, 320]]) {
        const glow = b.createRadialGradient(lx, ly, 0, lx, ly, r);
        glow.addColorStop(0, 'rgba(255, 243, 210, 0.30)');
        glow.addColorStop(1, 'rgba(255, 243, 210, 0)');
        b.fillStyle = glow;
        b.fillRect(0, 0, W, 200);
      }
      b.fillStyle = '#FFF4D6';
      for (const lx of [96, 864]) {
        for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) b.fillRect(lx - 30 + k * 9, 8 + r * 6, 6, 3);
      }
      const wallTop = project(0, 385, 10).y;
      const wallBot = project(0, 385, 0).y;
      b.fillStyle = '#0A1622';
      b.fillRect(0, 56, W, wallTop - 56);
      const rnd = mulberry(11);
      const crowd = ['rgba(214, 96, 92, 0.5)', 'rgba(205, 210, 220, 0.38)', 'rgba(96, 136, 214, 0.45)', 'rgba(255, 196, 90, 0.35)'];
      for (let i = 0; i < 2600; i++) {
        b.fillStyle = crowd[Math.floor(rnd() * crowd.length)];
        b.fillRect(rnd() * W, 60 + rnd() * (wallTop - 64), 2, 2);
      }
      b.fillStyle = '#03070C';
      b.fillRect(386, 64, 188, 54);
      b.strokeStyle = '#2A4054';
      b.lineWidth = 1;
      b.strokeRect(386.5, 64.5, 187, 53);
      b.fillStyle = '#0D3325';
      b.fillRect(0, wallTop, W, wallBot - wallTop + 1);
      b.fillStyle = '#E2C443';
      b.fillRect(0, wallTop - 1, W, 2);
      for (let y = 385, i = 0; y > -4; y -= 14, i++) {
        const top = project(0, y, 0).y;
        const bot = project(0, Math.max(y - 14, -4), 0).y;
        b.fillStyle = i % 2 ? '#1D5635' : '#22613D';
        b.fillRect(0, top, W, Math.min(bot, H) - top + 1);
      }
      const poly = (pts, fill, z = 0) => {
        b.beginPath();
        pts.forEach(([x, y], i) => {
          const p = project(x, y, z);
          if (i) b.lineTo(p.x, p.y);
          else b.moveTo(p.x, p.y);
        });
        b.closePath();
        b.fillStyle = fill;
        b.fill();
      };
      const ring = (cx, cy, r, n) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]);
      const arc = [];
      for (let deg = -58; deg <= 58; deg += 4) arc.push([95 * Math.sin((deg * Math.PI) / 180), 60.5 + 95 * Math.cos((deg * Math.PI) / 180)]);
      poly([[-6, -3], [-80, 74], ...arc, [80, 74], [6, -3]], '#83573A');
      poly([[0, 16], [56, 64], [0, 112], [-56, 64]], '#24673F');
      poly(ring(0, 59, 9, 28), '#8F6242');
      poly([[-1, 60.5], [1, 60.5], [1, 61], [-1, 61]], '#F2F2EC', 0.83);
      poly(ring(0, 0.7, 13, 40), '#83573A');
      b.strokeStyle = 'rgba(238, 242, 233, 0.8)';
      b.lineWidth = 2;
      const line = (x1, y1, x2, y2) => {
        const p = project(x1, y1, 0);
        const q = project(x2, y2, 0);
        b.beginPath();
        b.moveTo(p.x, p.y);
        b.lineTo(q.x, q.y);
        b.stroke();
      };
      for (const sx of [-1, 1]) {
        line(sx * 1.2, -2.3, sx * 5.2, -2.3);
        line(sx * 5.2, -2.3, sx * 5.2, 3.7);
        line(sx * 5.2, 3.7, sx * 1.2, 3.7);
        line(sx * 1.2, 3.7, sx * 1.2, -2.3);
        line(sx * 6, 6, sx * 320, 320);
      }
      poly([[-0.708, 1.417], [0.708, 1.417], [0.708, 0.708], [0, 0], [-0.708, 0.708]], '#F4F4EE');
      const vig = b.createRadialGradient(W / 2, 300, 200, W / 2, 300, 640);
      vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vig.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
      b.fillStyle = vig;
      b.fillRect(0, 0, W, H);
      return c;
    }

    const limb = (P, s) => (p, q, w, color) => {
      const a = P(p);
      const c = P(q);
      g.strokeStyle = color;
      g.lineWidth = Math.max(1, w * s);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(a[0], a[1]);
      g.lineTo(c[0], c[1]);
      g.stroke();
    };

    function drawPitcher(pose, holding) {
      const mirror = scene.fld.throws === 'L';
      const a = project(0, 60.5, 0.83);
      const s = a.s;
      const P = (p) => [a.x + (mirror ? -p[0] : p[0]) * s, a.y - p[1] * s];
      const L = limb(P, s);
      g.fillStyle = 'rgba(0, 0, 0, 0.3)';
      g.beginPath();
      g.ellipse(a.x, a.y + 1, 1.4 * s, 0.3 * s, 0, 0, Math.PI * 2);
      g.fill();
      L(pose.hipT, pose.knT, 0.44, uFld.pants);
      L(pose.knT, pose.ftT, 0.36, uFld.pants);
      L(pose.hipG, pose.knG, 0.44, uFld.pants);
      L(pose.knG, pose.ftG, 0.36, uFld.pants);
      g.fillStyle = INK;
      for (const f of [pose.ftT, pose.ftG]) {
        const q = P(f);
        g.beginPath();
        g.ellipse(q[0], q[1], 0.26 * s, 0.13 * s, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.beginPath();
      [pose.shT, pose.shG, pose.hipG, pose.hipT].forEach((p, i) => {
        const q = P(p);
        if (i) g.lineTo(q[0], q[1]);
        else g.moveTo(q[0], q[1]);
      });
      g.closePath();
      g.fillStyle = uFld.jersey;
      g.fill();
      g.strokeStyle = uFld.trim;
      g.lineWidth = Math.max(1, 0.08 * s);
      g.stroke();
      L(pose.shG, pose.elG, 0.3, uFld.jersey);
      L(pose.elG, pose.haG, 0.25, SKIN);
      const glove = P(pose.haG);
      g.fillStyle = '#5A3A22';
      g.beginPath();
      g.arc(glove[0], glove[1], 0.34 * s, 0, Math.PI * 2);
      g.fill();
      const head = P(pose.head);
      g.fillStyle = SKIN;
      g.beginPath();
      g.arc(head[0], head[1], 0.36 * s, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = uFld.cap;
      g.beginPath();
      g.arc(head[0], head[1] - 0.05 * s, 0.38 * s, Math.PI, 0);
      g.fill();
      g.fillRect(head[0] - 0.42 * s, head[1] - 0.08 * s, 0.84 * s, 0.1 * s);
      L(pose.shT, pose.elT, 0.3, uFld.jersey);
      L(pose.elT, pose.haT, 0.25, SKIN);
      const hand = P(pose.haT);
      if (holding) {
        g.fillStyle = CHALK;
        g.beginPath();
        g.arc(hand[0], hand[1], Math.max(1.5, 0.13 * s), 0, Math.PI * 2);
        g.fill();
      }
      return { x: hand[0], y: hand[1] };
    }

    function drawBatter(pose) {
      const mirror = scene.bat.bats === 'L';
      const a = project(mirror ? BATTER_X : -BATTER_X, 0.3, 0);
      const s = a.s;
      const P = (p) => [a.x + (mirror ? -p[0] : p[0]) * s, a.y - p[1] * s];
      const L = limb(P, s);
      g.fillStyle = 'rgba(0, 0, 0, 0.28)';
      g.beginPath();
      g.ellipse(a.x, a.y, 1.6 * s, 0.35 * s, 0, 0, Math.PI * 2);
      g.fill();
      L(pose.hip, pose.knB, 0.52, uBat.pants);
      L(pose.knB, pose.ftB, 0.42, uBat.pants);
      L(pose.hip, pose.knF, 0.52, uBat.pants);
      L(pose.knF, pose.ftF, 0.42, uBat.pants);
      L(pose.neck, pose.hip, 1.0, uBat.jersey);
      L(pose.sh, pose.el, 0.34, uBat.jersey);
      L(pose.el, pose.ha, 0.27, SKIN);
      const rad = (pose.bat[0] * Math.PI) / 180;
      const dir = [Math.cos(rad), Math.sin(rad)];
      const handle = [pose.ha[0] + dir[0] * 1.1, pose.ha[1] + dir[1] * 1.1];
      const tip = [pose.ha[0] + dir[0] * 2.85, pose.ha[1] + dir[1] * 2.85];
      L(pose.ha, handle, 0.11, '#B48A57');
      L(handle, tip, 0.23, '#C9A26B');
      const head = P(pose.head);
      g.fillStyle = SKIN;
      g.beginPath();
      g.arc(head[0], head[1], 0.4 * s, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = uBat.cap;
      g.beginPath();
      g.arc(head[0], head[1] - 0.04 * s, 0.44 * s, Math.PI * 0.95, Math.PI * 2.05);
      g.fill();
      const front = mirror ? -1 : 1;
      g.fillRect(Math.min(head[0], head[0] + front * 0.62 * s), head[1] - 0.1 * s, 0.62 * s, 0.1 * s);
      g.beginPath();
      g.arc(head[0] - front * 0.12 * s, head[1] + 0.12 * s, 0.2 * s, 0, Math.PI * 2);
      g.fill();
      L(pose.sh, pose.ha, 0.3, uBat.jersey);
    }

    function drawFielders() {
      const order = fielders.map((p, i) => ({ p, i })).sort((u, v) => v.p[1] - u.p[1]);
      for (const { p } of order) {
        const foot = project(p[0], p[1], 0);
        if (foot.x < -30 || foot.x > W + 30) continue;
        const s = foot.s;
        g.strokeStyle = uFld.jersey;
        g.lineCap = 'round';
        g.lineWidth = Math.max(1.5, 0.9 * s);
        g.beginPath();
        g.moveTo(foot.x, foot.y - 0.9 * s);
        g.lineTo(foot.x, foot.y - 4.6 * s);
        g.stroke();
        g.fillStyle = uFld.cap;
        g.beginPath();
        g.arc(foot.x, foot.y - 5.4 * s, Math.max(1, 0.4 * s), 0, Math.PI * 2);
        g.fill();
      }
    }

    function drawZone() {
      const tl = project(-0.83, PLATE_Y, scene.zone.top);
      const br = project(0.83, PLATE_Y, scene.zone.bot);
      g.fillStyle = 'rgba(238, 242, 233, 0.05)';
      g.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      g.strokeStyle = 'rgba(238, 242, 233, 0.16)';
      g.lineWidth = 1;
      for (let k = 1; k < 3; k++) {
        const x = lerp(tl.x, br.x, k / 3);
        const y = lerp(tl.y, br.y, k / 3);
        g.beginPath();
        g.moveTo(x, tl.y);
        g.lineTo(x, br.y);
        g.moveTo(tl.x, y);
        g.lineTo(br.x, y);
        g.stroke();
      }
      g.strokeStyle = 'rgba(238, 242, 233, 0.6)';
      g.lineWidth = 1.5;
      g.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      for (const m of scene.markers) {
        const p = project(m.x, PLATE_Y, m.z);
        const r = 9 * Math.min(ui, 1.5);
        g.fillStyle = CALLS[m.code][1];
        g.globalAlpha = 0.9;
        g.beginPath();
        g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
        g.fillStyle = INK;
        g.font = `600 ${Math.round(r * 1.1)}px "IBM Plex Sans KR", sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(m.n), p.x, p.y + 0.5);
      }
      return { tl, br };
    }

    function drawBall(w, trail) {
      const p = project(w.x, w.y, w.z);
      if (w.y - CAMERA.y < 2) return;
      const r = Math.max(1.4, BALL_R * p.s);
      if (w.z > 0.2 && w.z < 14) {
        const sh = project(w.x, w.y, 0);
        g.fillStyle = 'rgba(0, 0, 0, 0.25)';
        g.beginPath();
        g.ellipse(sh.x, sh.y, r * 1.2, r * 0.4, 0, 0, Math.PI * 2);
        g.fill();
      }
      if (trail && !reduced) {
        trail.push([p.x, p.y, r]);
        if (trail.length > 9) trail.shift();
        trail.forEach(([x, y, tr], i) => {
          g.fillStyle = `rgba(238, 242, 233, ${(0.05 * (i + 1)).toFixed(2)})`;
          g.beginPath();
          g.arc(x, y, tr * (0.5 + i / 18), 0, Math.PI * 2);
          g.fill();
        });
      }
      g.fillStyle = '#F7F7F2';
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
      if (r > 5) {
        g.strokeStyle = '#D0453F';
        g.lineWidth = Math.max(1, r * 0.12);
        g.beginPath();
        g.arc(p.x - r * 0.55, p.y, r * 0.7, -0.9, 0.9);
        g.stroke();
      }
    }

    function drawMitt(w, withBall, popAge) {
      const p = project(w.x, MITT_Y, w.z);
      const r = 0.55 * p.s;
      g.fillStyle = '#4E3320';
      g.beginPath();
      g.ellipse(p.x, p.y, r, r * 0.9, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#6E4A2E';
      g.beginPath();
      g.ellipse(p.x, p.y, r * 0.55, r * 0.5, 0, 0, Math.PI * 2);
      g.fill();
      if (withBall) {
        g.fillStyle = '#F7F7F2';
        g.beginPath();
        g.arc(p.x, p.y, r * 0.28, 0, Math.PI * 2);
        g.fill();
      }
      if (popAge < 260 && !reduced) {
        g.strokeStyle = `rgba(255, 244, 214, ${(1 - popAge / 260).toFixed(2)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(p.x, p.y, r * (1 + popAge / 140), 0, Math.PI * 2);
        g.stroke();
      }
    }

    function drawMap(t) {
      const ms = Math.min(1.6, ui);
      const w = 176 * ms;
      const h = 150 * ms;
      const x0 = W - 12 - w;
      const y0 = 12;
      const hx = x0 + w / 2;
      const hy = y0 + h - 12 * ms;
      const k = 0.3 * ms;
      const M = (x, y) => [hx + x * k, hy - y * k];
      g.fillStyle = 'rgba(5, 11, 18, 0.86)';
      g.fillRect(x0, y0, w, h);
      g.strokeStyle = '#253B50';
      g.lineWidth = 1;
      g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
      g.fillStyle = '#143B27';
      g.beginPath();
      g.moveTo(...M(0, 0));
      for (let deg = -45; deg <= 45; deg += 5) g.lineTo(...M(360 * Math.sin((deg * Math.PI) / 180), 360 * Math.cos((deg * Math.PI) / 180)));
      g.closePath();
      g.fill();
      g.fillStyle = '#5E4430';
      g.beginPath();
      [[0, -6], [70, 63.6], [0, 134], [-70, 63.6]].forEach(([x, y], i) => (i ? g.lineTo(...M(x, y)) : g.moveTo(...M(x, y))));
      g.closePath();
      g.fill();
      g.fillStyle = '#24673F';
      g.beginPath();
      [[0, 14], [54, 63.6], [0, 113], [-54, 63.6]].forEach(([x, y], i) => (i ? g.lineTo(...M(x, y)) : g.moveTo(...M(x, y))));
      g.closePath();
      g.fill();
      g.fillStyle = uFld.cap;
      for (const [fx, fy] of fielders) {
        g.beginPath();
        g.arc(...M(fx, fy), 3 * ms, 0, Math.PI * 2);
        g.fill();
      }
      const moving = anim && anim.runs.length && t >= anim.runStart ? anim.runs : [];
      const occupied = anim ? anim.basesBefore : scene.bases;
      for (let b = 1; b <= 3; b++) {
        const [bx, by] = M(BASES[b][0], BASES[b][1]);
        const on = (occupied >> (b - 1)) & 1 && !moving.some((r) => r.from === b);
        g.save();
        g.translate(bx, by);
        g.rotate(Math.PI / 4);
        g.fillStyle = on ? scene.bat.color : CHALK;
        g.fillRect(-3.5 * ms, -3.5 * ms, 7 * ms, 7 * ms);
        g.restore();
      }
      if (anim && anim.batted && t >= anim.batted.startMs) {
        const bt = ((t - anim.batted.startMs) / 1000) * anim.batted.rate;
        const bw = pathAt(anim.batted.path, bt);
        g.setLineDash([3 * ms, 3 * ms]);
        g.strokeStyle = 'rgba(238, 242, 233, 0.6)';
        g.beginPath();
        g.moveTo(...M(0, 0));
        g.lineTo(...M(bw.x, bw.y));
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = CHALK;
        g.beginPath();
        g.arc(...M(bw.x, bw.y), 2.6 * ms, 0, Math.PI * 2);
        g.fill();
      }
      for (const r of moving) {
        const u = clamp01((t - anim.runStart) / (anim.perBase * Math.max(r.dist, 0.5)));
        const q = r.to === -1 ? r.from + 0.5 * u : r.from + (r.to - r.from) * u;
        const [rx, ry] = M(...basePoint(q));
        g.globalAlpha = r.to === -1 ? 1 - clamp01((u - 0.6) / 0.4) : 1;
        g.fillStyle = scene.bat.color;
        g.strokeStyle = CHALK;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(rx, ry, 4 * ms, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.globalAlpha = 1;
      }
    }

    function drawCall(now, zone) {
      if (!call) return;
      const age = now - call.start;
      if (age > 1300) {
        call = null;
        return;
      }
      g.globalAlpha = age > 950 ? 1 - (age - 950) / 350 : 1;
      const size = Math.round(16 * Math.min(ui, 1.8));
      g.font = `700 ${size}px "IBM Plex Sans KR", sans-serif`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      const tw = g.measureText(call.text).width;
      const x = zone.br.x + 14;
      const y = zone.tl.y + 12;
      g.fillStyle = call.color;
      g.fillRect(x, y - size * 0.8, tw + size, size * 1.6);
      g.fillStyle = INK;
      g.fillText(call.text, x + size / 2, y + 1);
      g.globalAlpha = 1;
    }

    function drawBanner(now) {
      if (!banner) return;
      const age = now - banner.start;
      if (age < 0) return;
      const inU = clamp01(age / 240);
      const outU = clamp01((age - banner.hold) / 360);
      const alpha = Math.min(inU, 1 - outU);
      if (alpha <= 0) {
        if (outU >= 1) banner = null;
        return;
      }
      const y = 262;
      const bandH = 104 * Math.min(ui, 1.7);
      g.save();
      g.globalAlpha = alpha;
      const band = g.createLinearGradient(0, 0, W, 0);
      const tone = banner.tone === 'big' ? 'rgba(255, 181, 71, ' : 'rgba(6, 13, 21, ';
      band.addColorStop(0, `${tone}0)`);
      band.addColorStop(0.5, `${tone}0.88)`);
      band.addColorStop(1, `${tone}0)`);
      g.fillStyle = band;
      g.fillRect(0, y - bandH / 2, W, bandH);
      const dx = (1 - smooth(inU)) * -40;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const main = Math.round(56 * Math.min(ui, 1.7));
      g.font = `${main}px "Black Han Sans", "IBM Plex Sans KR", sans-serif`;
      g.lineJoin = 'round';
      g.lineWidth = main * 0.14;
      g.strokeStyle = banner.tone === 'big' ? '#231503' : INK;
      g.strokeText(banner.text, W / 2 + dx, y - (banner.sub ? main * 0.22 : 0));
      g.fillStyle = banner.tone === 'big' ? '#FFF7E6' : CHALK;
      g.fillText(banner.text, W / 2 + dx, y - (banner.sub ? main * 0.22 : 0));
      if (banner.sub) {
        const sub = Math.round(19 * Math.min(ui, 1.7));
        g.font = `600 ${sub}px "IBM Plex Sans KR", sans-serif`;
        g.fillStyle = banner.tone === 'big' ? '#231503' : '#AEBDB7';
        g.fillText(banner.sub, W / 2 + dx, y + main * 0.52);
      }
      g.restore();
    }

    function drawSparks(now) {
      sparks = sparks.filter((p) => now - p.start < 1300);
      for (const p of sparks) {
        const u = (now - p.start) / 1000;
        const x = p.x + p.vx * u;
        const y = p.y + p.vy * u + 90 * u * u;
        g.fillStyle = p.color;
        g.globalAlpha = 1 - u / 1.3;
        g.fillRect(x, y, 3, 3);
      }
      g.globalAlpha = 1;
    }

    function burst(x, y, now) {
      if (reduced) return;
      const colors = ['#FFB547', '#FFF4D6', '#FF5C50', '#4FD37F'];
      for (let i = 0; i < 48; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 170;
        sparks.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 60, color: colors[i % colors.length], start: now });
      }
    }

    function idlePitcher(now) {
      const pose = poseAt(PITCHER_KEYS, 0);
      if (reduced) return pose;
      const b = Math.sin(now / 700) * 0.03;
      for (const k of Object.keys(pose)) if (k !== 'ftT' && k !== 'ftG') pose[k][1] += b;
      return pose;
    }

    function idleBatter(now) {
      const pose = poseAt([{ t: 0, j: BAT.stance }], 0);
      if (!reduced) pose.bat[0] += Math.sin(now / 420) * 5;
      return pose;
    }

    function frame(now) {
      if (!bg) resize();
      g.setTransform(scale, 0, 0, scale, 0, 0);
      g.drawImage(bg, 0, 0, W, H);
      g.fillStyle = '#FFB547';
      g.font = '22px "VT323", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(scene.board[0], 480, 81);
      g.fillText(scene.board[1], 480, 103);

      const t = anim ? now - anim.start : 0;
      if (anim && anim.batted && anim.batted.chaser >= 0 && t > anim.batted.startMs) {
        const i = anim.batted.chaser;
        const [sx, sy] = FIELDERS[i];
        const land = anim.batted.path.landing;
        const dist = Math.hypot(land.x - sx, land.y - sy) || 1;
        const u = clamp01(((t - anim.batted.startMs) / 1000) * anim.batted.rate * 24 / dist);
        fielders[i] = [lerp(sx, land.x, u), lerp(sy, land.y, u)];
      }
      drawFielders();
      const holding = !anim || t < anim.relMs;
      const hand = drawPitcher(anim ? poseAt(PITCHER_KEYS, t / anim.deliveryMs) : idlePitcher(now), holding);
      const zone = drawZone();

      let ball = null;
      let trail = null;
      if (anim && t >= anim.relMs) {
        if (!anim.released) {
          anim.released = true;
          anim.hand = hand;
          if (anim.onRelease) anim.onRelease();
        }
        const tb = (t - anim.relMs) / (1000 * anim.slow);
        const pitchEnd = anim.batted ? anim.plateMs : anim.mittMs;
        if (t < pitchEnd) {
          const w = pitchAt(anim.row, tb);
          const start = project(anim.row[6], TRACK_Y0, anim.row[7]);
          const fade = 1 - smooth(clamp01(tb / (0.35 * anim.tPlate)));
          const p = project(w.x, w.y, w.z);
          const offX = ((anim.hand.x - start.x) * fade) / p.s;
          const offZ = (-(anim.hand.y - start.y) * fade) / p.s;
          ball = { x: w.x + offX, y: w.y, z: w.z + offZ };
          trail = anim.trail;
        } else if (anim.batted && t < anim.batted.endMs + 500) {
          const bt = ((t - anim.batted.startMs) / 1000) * anim.batted.rate;
          ball = pathAt(anim.batted.path, bt);
          trail = anim.trail;
          if (anim.batted.hr && !anim.batted.burst && Math.hypot(ball.x, ball.y) > 340) {
            anim.batted.burst = true;
            const p = project(ball.x, ball.y, ball.z);
            burst(Math.max(80, Math.min(W - 80, p.x)), Math.max(40, Math.min(170, p.y)), now);
          }
        }
        if (!anim.marked && t >= anim.plateMs) {
          anim.marked = true;
          scene.markers.push({ x: anim.loc.x, z: anim.loc.z, n: anim.number, code: anim.code });
          if (anim.code === 'F' || anim.code === 'X') call = { text: CALLS[anim.code][0], color: CALLS[anim.code][1], start: now };
        }
        if (!anim.called && !anim.batted && t >= anim.mittMs) {
          anim.called = true;
          call = { text: CALLS[anim.code][0], color: CALLS[anim.code][1], start: now };
        }
      }
      if (ball && ball.y > 2.5) drawBall(ball, trail);
      drawBatter(anim ? poseAt(anim.batterKeys, t) : idleBatter(now));
      if (ball && ball.y <= 2.5) drawBall(ball, trail);
      if (anim && !anim.batted && t >= anim.plateMs - 140) drawMitt(anim.loc, t >= anim.mittMs, t - anim.mittMs);
      drawSparks(now);
      drawCall(now, zone);
      if (anim && anim.banner && !anim.bannerShown && t >= anim.bannerStart) {
        anim.bannerShown = true;
        banner = { text: anim.banner.text, sub: anim.banner.sub, tone: anim.banner.tone, start: now, hold: anim.bannerHold };
      }
      drawBanner(now);
      drawMap(t);
      if (anim && t >= anim.endMs) {
        const done = anim;
        anim = null;
        fielders = FIELDERS.map((p) => p.slice());
        if (done.basesAfter !== undefined) scene.bases = done.basesAfter;
        done.resolve();
      }
      requestAnimationFrame(frame);
    }

    function nearestFielder(landing) {
      let best = -1;
      let bestD = Infinity;
      FIELDERS.forEach(([x, y], i) => {
        const d = Math.hypot(landing.x - x, landing.y - y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      return best;
    }

    function batterKeys(a) {
      if (!a.swing) {
        return [{ t: 0, j: BAT.stance }, { t: a.relMs, j: BAT.load }, { t: a.plateMs, j: BAT.take }, { t: a.plateMs + 700, j: BAT.stance }];
      }
      const swingMs = 330 * a.slow;
      const mirror = scene.bat.bats === 'L';
      const handX = mirror ? BATTER_X - 0.75 : -BATTER_X + 0.75;
      const dx = mirror ? handX - a.loc.x : a.loc.x - handX;
      let theta = (Math.atan2(a.loc.z - 3.95, dx) * 180) / Math.PI;
      if (a.code === 'S') theta += 14;
      const contact = Object.assign({}, BAT.contact, { bat: [theta, 0] });
      return [
        { t: 0, j: BAT.stance },
        { t: a.relMs, j: BAT.load },
        { t: Math.max(a.relMs + 1, a.plateMs - swingMs), j: BAT.stride },
        { t: a.plateMs, j: contact },
        { t: a.plateMs + 240, j: BAT.follow },
        { t: a.plateMs + 1100, j: BAT.follow },
        { t: a.plateMs + 1700, j: BAT.stance },
      ];
    }

    function playPitch(p) {
      return new Promise((resolve) => {
        const fast = Boolean(p.fast) || reduced;
        const slow = fast ? 1 : 2.2;
        const deliveryMs = fast ? 700 : 1650;
        const relMs = deliveryMs * RELEASE_AT;
        const tPlate = plateTime(p.row);
        const plateMs = relMs + tPlate * 1000 * slow;
        const mittMs = relMs + timeToY(p.row, MITT_Y) * 1000 * slow;
        const loc = pitchAt(p.row, tPlate);
        let batted = null;
        if (p.code === 'X' || p.code === 'F') {
          const spec = battedPreset(p.code === 'F' ? 'F' : p.play, p.bats || scene.bat.bats, Math.random(), Math.random());
          const path = flight(spec);
          const rate = Math.max(1, path.duration / (fast ? 1.5 : 2.6));
          batted = { path, rate, startMs: plateMs, endMs: plateMs + (path.duration / rate) * 1000, hr: p.play === 'HR', chaser: p.code === 'X' && p.play !== 'HR' ? nearestFielder(path.landing) : -1 };
        }
        const runs = (p.moves || []).filter(([from, to]) => from !== to).map(([from, to]) => ({ from, to, dist: to === -1 ? 0.5 : to - from }));
        const runStart = batted ? plateMs + 150 : mittMs + 180;
        const perBase = fast ? 360 : 640;
        const runEnd = runs.length ? runStart + perBase * Math.max(...runs.map((r) => Math.max(r.dist, 0.5))) : 0;
        const phaseEnd = Math.max(batted ? batted.endMs : mittMs + 420, runEnd);
        const bannerHold = fast ? 850 : 1500;
        const bannerStart = phaseEnd + 60;
        const endMs = p.banner ? bannerStart + bannerHold + 400 : phaseEnd + (fast ? 120 : 280);
        anim = {
          start: performance.now(), row: p.row, code: p.code, number: p.number, slow, deliveryMs, relMs, plateMs, mittMs, tPlate, loc,
          swing: p.code === 'S' || p.code === 'F' || p.code === 'X', batted, runs, runStart, perBase,
          basesBefore: scene.bases, basesAfter: p.basesAfter, banner: p.banner || null, bannerStart, bannerHold, endMs,
          onRelease: p.onRelease, resolve, released: false, marked: false, called: false, bannerShown: false, trail: [],
        };
        anim.batterKeys = batterKeys(anim);
      });
    }

    function showBanner(text, sub, tone) {
      return new Promise((resolve) => {
        const hold = reduced ? 700 : 1400;
        banner = { text, sub, tone, start: performance.now(), hold };
        setTimeout(resolve, hold + 420);
      });
    }

    function setScene(next) {
      Object.assign(scene, next);
      uBat = uniform(scene.bat);
      uFld = uniform(scene.fld);
    }

    if (typeof ResizeObserver === 'function') new ResizeObserver(() => resize()).observe(canvas);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { bg = null; });
    requestAnimationFrame(frame);

    return {
      playPitch,
      showBanner,
      setScene,
      setBases: (bases) => { scene.bases = bases; },
      setBoard: (lines) => { scene.board = lines; },
      clearMarkers: () => { scene.markers = []; },
      busy: () => Boolean(anim),
    };
  }

  return { W, H, CAMERA, PLATE_Y, project, pitchAt, plateTime, battedPreset, flight, poseAt, createStage };
}));
