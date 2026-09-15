/* 포수 뒤 시점 투구 트래커(시안). 궤적은 PTS 행의 등가속도 식(src/stage/math/pitch.ts와 같은 식)으로 계산한다. */
export const PITCH_TYPES = ['직구', '투심', '커터', '슬라이더', '스위퍼', '커브', '체인지업', '포크', '기타'];
export const PITCH_COLORS = ['#ef4444', '#f97316', '#c2703a', '#facc15', '#e0a93b', '#38bdf8', '#34d399', '#2dd4bf', '#94a3b8'];
export const CALL_COLORS = { B: '#2fd27a', S: '#ffb020', F: '#ffb020', X: '#4da3ff' };

const TRACK_Y0 = 55;
const PLATE_Y = 1.417;
const HALF_PLATE = 0.708;
const BALL_R = 0.121;
const CAM = { y: -30, z: 4.6 };
const SLOW = 2400;

export function pitchAt(row, t) {
  return {
    x: row[6] + row[8] * t + 0.5 * row[11] * t * t,
    y: TRACK_Y0 + row[9] * t + 0.5 * row[12] * t * t,
    z: row[7] + row[10] * t + 0.5 * row[13] * t * t,
  };
}

export function timeToY(row, yTarget) {
  const a = 0.5 * row[12];
  const b = row[9];
  const c = TRACK_Y0 - yTarget;
  if (Math.abs(a) < 1e-9) return -c / b;
  return (-b - Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * a);
}

export function plateCross(row) {
  const t = timeToY(row, PLATE_Y);
  const p = pitchAt(row, t);
  return { t, x: p.x, z: p.z };
}

export function inZone(row) {
  const p = plateCross(row);
  return Math.abs(p.x) <= HALF_PLATE + BALL_R && p.z <= row[14] + BALL_R && p.z >= row[15] - BALL_R;
}

export function createTracker(canvas, opts = {}) {
  const g = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let dpr = 1;
  let f = 1;
  let cx = 0;
  let cy = 0;
  let backdrop = null;
  let bases = opts.bases ?? 0;
  let zone = { top: 3.26, bottom: 1.58 };
  const markers = [];
  let trail = null;
  let frame = 0;
  let skipNow = null;

  function project(x, y, z) {
    const d = y - CAM.y;
    if (d <= 0.25) return null;
    const s = f / d;
    return { x: cx + x * s, y: cy - (z - CAM.z) * s, s };
  }

  const groundPts = (pts) => pts.map(([x, y]) => project(x, y, 0)).filter(Boolean);

  function circle(x0, y0, r, a0 = 0, a1 = Math.PI * 2, n = 72) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push([x0 + r * Math.sin(a), y0 + r * Math.cos(a)]);
    }
    return out;
  }

  function poly(c, pts, fill, stroke, width = 1) {
    if (pts.length < 2) return;
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    c.closePath();
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }
  }

  function paintBackdrop() {
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    const c = off.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    const wallTop = Math.max(18, project(0, 400, 11).y);
    const wallBottom = project(0, 400, 0).y;

    // 관중석: 어두운 층과 흐린 관중 질감
    let grd = c.createLinearGradient(0, 0, 0, wallTop);
    grd.addColorStop(0, '#020305');
    grd.addColorStop(1, '#0c1218');
    c.fillStyle = grd;
    c.fillRect(0, 0, W, wallTop);
    // 관중 점은 임시 캔버스에 그린 뒤 한 번만 흐리게 옮긴다(점마다 filter를 걸면 매우 느리다)
    const crowd = document.createElement('canvas');
    crowd.width = Math.max(1, Math.round(W));
    crowd.height = Math.max(1, Math.round(wallTop));
    const cc = crowd.getContext('2d');
    let seed = 11;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 1400; i++) {
      const y = rand() * wallTop;
      const depth = y / wallTop;
      const tone = rand() < 0.5 ? '210,215,222' : rand() < 0.5 ? '120,140,165' : '200,160,120';
      cc.fillStyle = `rgba(${tone},${(0.03 + depth * 0.1).toFixed(3)})`;
      cc.fillRect(rand() * W, y, 1.4 + depth * 1.2, 1.4 + depth * 1.2);
    }
    c.filter = 'blur(0.6px)';
    c.drawImage(crowd, 0, 0, W, wallTop);
    c.filter = 'none';
    for (let i = 1; i < 7; i++) {
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(0, wallTop - i * 13, W, 1.5);
    }
    for (const lx of [W * 0.06, W * 0.94]) {
      const rg = c.createRadialGradient(lx, -10, 0, lx, -10, W * 0.75);
      rg.addColorStop(0, 'rgba(255,241,214,0.20)');
      rg.addColorStop(1, 'rgba(255,241,214,0)');
      c.fillStyle = rg;
      c.fillRect(0, 0, W, H);
    }

    // 외야 펜스와 홈런 라인
    c.fillStyle = '#0a241d';
    c.fillRect(0, wallTop, W, wallBottom - wallTop);
    c.fillStyle = 'rgba(255,210,63,0.6)';
    c.fillRect(0, wallTop, W, 1);

    // 잔디와 깊이 방향 줄무늬
    grd = c.createLinearGradient(0, wallBottom, 0, H);
    grd.addColorStop(0, '#0d3322');
    grd.addColorStop(0.45, '#15512f');
    grd.addColorStop(1, '#1c6a3e');
    c.fillStyle = grd;
    c.fillRect(0, wallBottom, W, H - wallBottom);
    for (let d = 24, k = 0; d < 400; d += 22, k++) {
      if (k % 2) continue;
      const near = project(0, d, 0).y;
      const far = project(0, d + 22, 0).y;
      c.fillStyle = 'rgba(255,255,255,0.028)';
      c.fillRect(0, far, W, near - far);
    }

    // 내야 흙 호·베이스 길
    const dirt = '#6a4a31';
    poly(c, groundPts([...circle(0, 60.5, 95, -1.25, 1.25), ...circle(0, 60.5, 79, 1.25, -1.25)]), dirt);
    for (const sx of [-1, 1]) {
      poly(c, groundPts([[sx * 1.5, 2], [sx * 64.5, 62], [sx * 62, 65], [sx * -0.5, 4]]), dirt);
    }
    // 마운드·투수판
    const mound = c.createRadialGradient(cx, project(0, 60.5, 0).y, 0, cx, project(0, 60.5, 0).y, 70);
    mound.addColorStop(0, '#8a6143');
    mound.addColorStop(1, '#6a4a31');
    poly(c, groundPts(circle(0, 60.5, 9)), mound);
    poly(c, [project(-1, 60.5, 0.83), project(1, 60.5, 0.83), project(1, 61, 0.83), project(-1, 61, 0.83)], 'rgba(245,245,240,0.9)');
    // 홈 흙 원
    poly(c, groundPts(circle(0, 0, 13).filter(([, y]) => y > CAM.y + 0.6)), '#6f4d33');

    // 파울 라인·베이스
    c.lineCap = 'round';
    for (const sx of [-1, 1]) {
      const a = project(sx * 0.9, 0.9, 0);
      const b = project(sx * 240, 240, 0);
      c.strokeStyle = 'rgba(245,245,240,0.75)';
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
      c.stroke();
    }
    for (const [bx, by] of [[63.6, 63.6], [0, 127.3], [-63.6, 63.6]]) {
      poly(c, groundPts([[bx, by - 1], [bx + 1, by], [bx, by + 1], [bx - 1, by]]), 'rgba(245,245,240,0.9)');
    }

    // 타석 박스·홈플레이트
    for (const sx of [-1, 1]) {
      poly(c, groundPts([[sx * 1.25, -2.4], [sx * 5.25, -2.4], [sx * 5.25, 3.6], [sx * 1.25, 3.6]]), null, 'rgba(245,245,240,0.5)', 1.4);
    }
    poly(c, groundPts([[-HALF_PLATE, PLATE_Y], [HALF_PLATE, PLATE_Y], [HALF_PLATE, 0.708], [0, 0], [-HALF_PLATE, 0.708]]), '#efeee8');

    // 비네트
    const vg = c.createRadialGradient(W / 2, H * 0.42, H * 0.25, W / 2, H * 0.5, H * 0.9);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);
    return off;
  }

  function drawRunners() {
    for (const [bx, by, bit] of [[63.6, 63.6, 1], [0, 127.3, 2], [-63.6, 63.6, 4]]) {
      if (!(bases & bit)) continue;
      const p = project(bx, by, 0);
      g.fillStyle = 'rgba(255,210,63,0.22)';
      g.beginPath();
      g.arc(p.x, p.y - 3, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(p.x, p.y - 3, 3.6, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawZone() {
    const tl = project(-HALF_PLATE, PLATE_Y, zone.top);
    const br = project(HALF_PLATE, PLATE_Y, zone.bottom);
    const w = br.x - tl.x;
    const h = br.y - tl.y;
    g.fillStyle = 'rgba(255,255,255,0.045)';
    g.fillRect(tl.x, tl.y, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.lineWidth = 1;
    g.beginPath();
    for (const k of [1, 2]) {
      g.moveTo(tl.x + (w * k) / 3, tl.y);
      g.lineTo(tl.x + (w * k) / 3, br.y);
      g.moveTo(tl.x, tl.y + (h * k) / 3);
      g.lineTo(br.x, tl.y + (h * k) / 3);
    }
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 1.5;
    g.strokeRect(tl.x, tl.y, w, h);
  }

  function drawTrail(tr) {
    const n = 32;
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const p3 = pitchAt(tr.row, (tr.t * i) / n);
      const p = project(p3.x, p3.y, p3.z);
      if (prev) {
        const k = i / n;
        g.strokeStyle = tr.color;
        g.globalAlpha = (tr.done ? 0.38 : 0.85) * (0.15 + 0.85 * k);
        g.lineWidth = Math.max(1, p.s * BALL_R * 1.3 * k);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(prev.x, prev.y);
        g.lineTo(p.x, p.y);
        g.stroke();
      }
      prev = p;
    }
    g.globalAlpha = 1;
    if (tr.done) return;
    const b3 = pitchAt(tr.row, tr.t);
    const shadow = project(b3.x, b3.y, 0);
    const ball = project(b3.x, b3.y, b3.z);
    const r = Math.max(1.6, ball.s * BALL_R);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath();
    g.ellipse(shadow.x, shadow.y, r * 1.1, r * 0.35, 0, 0, Math.PI * 2);
    g.fill();
    const bg = g.createRadialGradient(ball.x - r * 0.35, ball.y - r * 0.35, r * 0.1, ball.x, ball.y, r);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, '#d9d6cc');
    g.fillStyle = bg;
    g.beginPath();
    g.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    g.fill();
  }

  function drawMarkers() {
    for (const m of markers) {
      const p = project(m.x, PLATE_Y, m.z);
      const r = 10.5;
      g.fillStyle = m.color;
      g.globalAlpha = m.last ? 1 : 0.72;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = 'rgba(5,7,10,0.9)';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#05070a';
      g.font = '800 12px "Barlow Semi Condensed", "Noto Sans KR", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(m.n), p.x, p.y + 0.5);
    }
  }

  function draw() {
    if (!W) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (backdrop) g.drawImage(backdrop, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRunners();
    drawZone();
    if (trail) drawTrail(trail);
    drawMarkers();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    f = (W * 0.27 * (PLATE_Y - CAM.y)) / (2 * HALF_PLATE);
    cx = W / 2;
    cy = H * 0.13;
    backdrop = paintBackdrop();
    draw();
  }

  function throwPitch(row, n, call) {
    return new Promise((resolve) => {
      const tEnd = timeToY(row, PLATE_Y);
      const dur = opts.reduced ? 0 : tEnd * SLOW;
      const color = PITCH_COLORS[row[0]] ?? PITCH_COLORS[8];
      const start = performance.now();
      const finish = () => {
        cancelAnimationFrame(frame);
        skipNow = null;
        const p = pitchAt(row, tEnd);
        markers.forEach((m) => (m.last = false));
        markers.push({ x: p.x, z: p.z, n, color: CALL_COLORS[call], last: true });
        trail = { row, t: tEnd, color, done: true };
        draw();
        resolve();
      };
      skipNow = finish;
      const step = (now) => {
        const k = dur ? Math.min((now - start) / dur, 1) : 1;
        trail = { row, t: tEnd * k, color, done: false };
        draw();
        if (k >= 1) finish();
        else frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    });
  }

  return {
    resize,
    draw,
    throwPitch,
    skip: () => skipNow && skipNow(),
    reset() {
      markers.length = 0;
      trail = null;
      draw();
    },
    setBases(b) {
      bases = b;
      draw();
    },
    setZone(top, bottom) {
      zone = { top, bottom };
      draw();
    },
  };
}
