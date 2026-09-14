/* 중견수 쪽 중계 카메라 시점 야간 경기장(시안용). 가상 좌표 360×452에 그리고 캔버스 폭에 맞춰 늘린다. */
(function () {
  var VW = 360;
  var VH = 452;

  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function prepare(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || VW;
    var h = canvas.clientHeight || VH;
    var pw = Math.round(w * dpr);
    var ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    var g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g: g, w: w, h: h };
  }

  function line(g, pts, width, color) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke();
  }

  function oval(g, x, y, rx, ry, color) {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }

  function rect(g, x, y, w, h, r, color) {
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.fill();
  }

  function stands(g, lights) {
    var sky = g.createLinearGradient(0, 0, 0, 160);
    sky.addColorStop(0, '#05080c');
    sky.addColorStop(1, '#0e151b');
    g.fillStyle = sky;
    g.fillRect(0, 0, VW, 160);
    var rand = rng(7);
    var palette = ['94,143,232', '236,234,228', '255,207,107', '214,96,92', '120,130,140'];
    for (var i = 0; i < 1500; i++) {
      var y = 26 + rand() * 124;
      var depth = (y - 26) / 124;
      var c = palette[Math.floor(rand() * (rand() < 0.55 ? 2 : palette.length))];
      g.fillStyle = 'rgba(' + c + ',' + (0.12 + depth * 0.4 * lights).toFixed(3) + ')';
      g.fillRect(rand() * VW, y, 1.6 + depth, 1.6 + depth);
    }
    for (var r = 0; r < 5; r++) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(0, 40 + r * 24, VW, 2);
    }
    [[22, 6], [338, 6]].forEach(function (p) {
      var glow = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], 190);
      glow.addColorStop(0, 'rgba(255,236,190,' + (0.42 * lights).toFixed(3) + ')');
      glow.addColorStop(1, 'rgba(255,236,190,0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, VW, 240);
      for (var a = 0; a < 3; a++) {
        for (var b = 0; b < 6; b++) {
          g.fillStyle = 'rgba(255,244,214,' + (0.25 + 0.75 * lights).toFixed(3) + ')';
          g.fillRect(p[0] - 17 + b * 6, p[1] - 4 + a * 4, 4, 2);
        }
      }
    });
  }

  function wall(g, text) {
    g.fillStyle = '#0b1f1c';
    g.fillRect(0, 150, VW, 48);
    g.fillStyle = '#123029';
    g.fillRect(0, 176, VW, 22);
    g.fillStyle = '#030506';
    g.fillRect(0, 156, VW, 16);
    g.fillStyle = '#ffb547';
    g.font = '600 9px Archivo, "Noto Sans KR", sans-serif';
    g.textBaseline = 'middle';
    for (var x = 12; x < VW; x += 170) g.fillText(text, x, 164.5);
    g.fillStyle = 'rgba(242,239,230,0.55)';
    g.fillRect(0, 197, VW, 1.5);
  }

  function field(g) {
    var grass = g.createLinearGradient(0, 198, 0, VH);
    grass.addColorStop(0, '#174d33');
    grass.addColorStop(1, '#1f6a44');
    g.fillStyle = grass;
    g.fillRect(0, 198, VW, VH - 198);
    for (var i = 0, y = 204; y < VH; i++) {
      var hgt = 10 + i * 5;
      if (i % 2) {
        g.fillStyle = 'rgba(255,255,255,0.035)';
        g.fillRect(0, y, VW, hgt);
      }
      y += hgt;
    }
    var dirt = g.createRadialGradient(206, 262, 10, 206, 262, 170);
    dirt.addColorStop(0, '#8a5d3d');
    dirt.addColorStop(1, '#5e3e29');
    g.fillStyle = dirt;
    g.beginPath();
    g.ellipse(206, 262, 172, 50, 0, 0, Math.PI * 2);
    g.fill();
    line(g, [150, 246, 186, 246, 184, 276, 142, 276, 150, 246], 1.2, 'rgba(242,239,230,0.7)');
    line(g, [226, 246, 262, 246, 270, 276, 228, 276, 226, 246], 1.2, 'rgba(242,239,230,0.7)');
    line(g, [196, 280, 34, 452], 1.6, 'rgba(242,239,230,0.55)');
    line(g, [216, 280, 378, 452], 1.6, 'rgba(242,239,230,0.55)');
    g.fillStyle = '#f4f2ea';
    g.beginPath();
    g.moveTo(196, 266);
    g.lineTo(216, 266);
    g.lineTo(216, 269);
    g.lineTo(206, 272);
    g.lineTo(196, 269);
    g.closePath();
    g.fill();
    var mound = g.createRadialGradient(150, 440, 8, 150, 440, 120);
    mound.addColorStop(0, '#94653f');
    mound.addColorStop(1, '#6a462d');
    g.fillStyle = mound;
    g.beginPath();
    g.ellipse(150, 440, 118, 30, 0, 0, Math.PI * 2);
    g.fill();
    rect(g, 136, 432, 28, 4, 1, '#efeee6');
  }

  function umpire(g) {
    var x = 214;
    var y = 238;
    oval(g, x, y, 13, 3, 'rgba(0,0,0,0.35)');
    line(g, [x - 5, y - 14, x - 7, y], 5, '#5b6167');
    line(g, [x + 5, y - 14, x + 7, y], 5, '#5b6167');
    rect(g, x - 11, y - 42, 22, 30, 5, '#15191d');
    oval(g, x, y - 48, 6, 6.5, '#b88a6b');
    rect(g, x - 5.5, y - 52, 11, 9, 2, '#0a0c0e');
    line(g, [x + 11, y - 40, x + 12.5, y - 14], 1.2, 'rgba(255,236,200,0.35)');
  }

  function catcher(g) {
    var x = 206;
    var y = 254;
    oval(g, x, y, 15, 3.5, 'rgba(0,0,0,0.4)');
    oval(g, x - 9, y - 6, 7, 6, '#1d2c4a');
    oval(g, x + 9, y - 6, 7, 6, '#1d2c4a');
    rect(g, x - 10, y - 28, 20, 20, 5, '#243a66');
    rect(g, x - 7, y - 25, 14, 14, 3, '#2f4d85');
    oval(g, x, y - 32, 6.5, 6.5, '#152238');
    rect(g, x - 5, y - 35, 10, 7, 2, '#0b1220');
    oval(g, x - 13, y - 18, 5.5, 5, '#6a4526');
  }

  function batter(g) {
    var x = 166;
    var y = 262;
    var suit = '#e6e3dc';
    var trim = '#141414';
    oval(g, x + 2, y, 18, 4, 'rgba(0,0,0,0.38)');
    line(g, [x - 1, y - 32, x - 9, y - 16, x - 11, y - 1], 6.5, suit);
    line(g, [x + 3, y - 32, x + 10, y - 17, x + 13, y - 2], 6.5, suit);
    line(g, [x - 11, y - 1, x - 7, y], 4, trim);
    line(g, [x + 13, y - 2, x + 17, y - 1], 4, trim);
    rect(g, x - 7, y - 56, 13, 26, 5, suit);
    rect(g, x - 7, y - 34, 13, 3, 1, trim);
    line(g, [x + 6, y - 55, x + 6.5, y - 33], 1.3, 'rgba(255,236,200,0.6)');
    line(g, [x + 2, y - 52, x + 8, y - 47, x - 5, y - 54], 4, suit);
    line(g, [x - 5, y - 55, x - 20, y - 88], 3.2, '#c89f68');
    oval(g, x + 1, y - 63, 6.6, 6.6, '#151515');
    g.fillStyle = '#d6453d';
    g.fillRect(x - 5, y - 67, 11, 2);
    oval(g, x + 5, y - 60, 2.6, 2.2, '#c49273');
  }

  function pitcher(g, arm) {
    var x = 150;
    var y = 446;
    var suit = '#f3f4f6';
    var navy = '#1f3a70';
    oval(g, x, y - 2, 30, 6, 'rgba(0,0,0,0.35)');
    line(g, [x - 10, y - 50, x - 13, y - 26, x - 16, y - 2], 12, suit);
    line(g, [x + 10, y - 50, x + 13, y - 26, x + 16, y - 2], 12, suit);
    line(g, [x - 14, y - 16, x - 16, y - 2], 10, navy);
    line(g, [x + 14, y - 16, x + 16, y - 2], 10, navy);
    rect(g, x - 20, y - 98, 40, 52, 9, suit);
    g.fillStyle = navy;
    g.fillRect(x - 20, y - 52, 40, 5);
    g.fillRect(x - 1, y - 98, 2, 46);
    line(g, [x + 19, y - 94, x + 20, y - 54], 2, 'rgba(255,236,200,0.7)');
    line(g, [x - 18, y - 92, x - 27, y - 70, x - 12, y - 66], 8.5, suit);
    oval(g, x - 10, y - 67, 7, 7, '#5f3d22');
    if (arm > 0) {
      line(g, [x + 18, y - 92, x + 30, y - 106, x + 30 + arm * 4, y - 124 - arm * 6], 8.5, suit);
      oval(g, x + 30 + arm * 4, y - 126 - arm * 6, 3, 3, '#c49273');
    } else {
      line(g, [x + 18, y - 92, x + 27, y - 72, x + 22, y - 56], 8.5, suit);
      oval(g, x + 22, y - 54, 3.2, 3.2, '#c49273');
    }
    rect(g, x - 6, y - 106, 12, 9, 3, '#c49273');
    oval(g, x, y - 113, 10, 10.5, '#2a2420');
    g.fillStyle = navy;
    g.beginPath();
    g.ellipse(x, y - 117, 10.8, 8.5, 0, Math.PI, 0);
    g.fill();
    g.fillRect(x - 11, y - 118, 22, 3);
  }

  function zone(g, marks) {
    g.strokeStyle = 'rgba(242,239,230,0.6)';
    g.lineWidth = 1;
    g.strokeRect(195.5, 214.5, 23, 30);
    g.strokeStyle = 'rgba(242,239,230,0.18)';
    g.beginPath();
    g.moveTo(203.2, 215);
    g.lineTo(203.2, 244);
    g.moveTo(210.8, 215);
    g.lineTo(210.8, 244);
    g.moveTo(196, 224.5);
    g.lineTo(218, 224.5);
    g.moveTo(196, 234.5);
    g.lineTo(218, 234.5);
    g.stroke();
    (marks || []).forEach(function (m) {
      oval(g, m.x, m.y, 5.2, 5.2, m.color);
      g.fillStyle = '#07090b';
      g.font = '700 7px Archivo, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(m.n), m.x, m.y + 0.5);
      g.textAlign = 'start';
    });
  }

  function vignette(g) {
    var v = g.createRadialGradient(VW / 2, 250, 120, VW / 2, 250, 330);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = v;
    g.fillRect(0, 0, VW, VH);
  }

  /** opts: { top, lights 0~1, zone, marks [{x,y,n,color}], ball {x,y,r,trail}|null, arm 0~1, board } */
  function draw(canvas, opts) {
    var o = opts || {};
    var c = prepare(canvas);
    var g = c.g;
    var scale = c.w / VW;
    g.clearRect(0, 0, c.w, c.h);
    g.save();
    g.scale(scale, scale);
    g.translate(0, -(o.top || 0));
    stands(g, o.lights == null ? 1 : o.lights);
    wall(g, o.board || 'KT 3 : 3 NC   9회초 2사 만루');
    field(g);
    umpire(g);
    catcher(g);
    batter(g);
    if (o.zone) zone(g, o.marks);
    if (o.ball) {
      if (o.ball.trail) line(g, o.ball.trail, o.ball.r * 0.9, 'rgba(242,239,230,0.22)');
      oval(g, o.ball.x, o.ball.y, o.ball.r, o.ball.r, '#fbfaf5');
    }
    pitcher(g, o.arm || 0);
    vignette(g);
    g.restore();
  }

  window.TMIStage = { draw: draw };
})();
