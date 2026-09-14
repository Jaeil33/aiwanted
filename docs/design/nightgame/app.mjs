/* 시안 상호작용: 조명 켜기, 첫 공 재생과 실제 엔진 값, 카드 뒤집기, 1,000경기 점, 실제 결과 봉인 */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var Stage = window.TMIStage;
  var $ = function (s) { return document.querySelector(s); };
  var views = {
    lobby: { top: 0, lights: 1 },
    play: { top: 0, lights: 1, zone: true, marks: [] },
    tmi: { top: 118, lights: 0.9 },
    result: { top: 172, lights: 1, board: 'KT 승리   경기 종료' },
  };

  function paint(name, extra) {
    var canvas = document.querySelector('canvas[data-view="' + name + '"]');
    if (canvas && Stage) Stage.draw(canvas, Object.assign({}, views[name], extra || {}));
  }

  /* 엔진 값: 짜장면 TMI 적용, 0-0과 첫 공(볼) 뒤 */
  var tiers = {
    before: {
      pa: { left: '최원준 출루', right: '이용준 아웃', l: 41.4, r: 58.6, tie: null, ghost: 40.7, delta: '+0.7%p', note: 'TMI 없음 40.7%' },
      inning: { left: 'KT 득점', right: 'NC 무실점', l: 41.4, r: 58.6, tie: null, ghost: 40.7, delta: '+0.7%p', note: '기대 득점 0.95점 · TMI 없음 40.7%' },
      game: { left: 'KT 승리', right: 'NC 승리', l: 54.0, r: 32.7, tie: 13.3, ghost: 53.6, delta: '+0.4%p', note: 'TMI 없음 53.6%' },
    },
    after: {
      pa: { left: '최원준 출루', right: '이용준 아웃', l: 47.5, r: 52.5, tie: null, ghost: null, delta: '+0.7%p', note: '볼 하나 뒤 엔진 값' },
      inning: { left: 'KT 득점', right: 'NC 무실점', l: 47.5, r: 52.5, tie: null, ghost: null, delta: '+0.7%p', note: '볼 하나 뒤 · 기대 득점 0.95점' },
      game: { left: 'KT 승리', right: 'NC 승리', l: 57.3, r: 30.5, tie: 12.1, ghost: null, delta: '+0.4%p', note: '볼 하나 뒤 엔진 값' },
    },
  };
  var state = { tier: 'game', phase: 'before', busy: false };
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tabs [data-tier]'));

  function renderWp() {
    var d = tiers[state.phase][state.tier];
    $('#wp-left-label').textContent = d.left;
    $('#wp-right-label').textContent = d.right;
    $('#wp-left').innerHTML = d.l.toFixed(1) + '<i>%</i>';
    $('#wp-right').innerHTML = d.r.toFixed(1) + '<i>%</i>';
    $('#wp-tie').hidden = d.tie == null;
    if (d.tie != null) $('#wp-tie-num').textContent = d.tie.toFixed(1) + '%';
    $('#tug-a').style.flexBasis = d.l + '%';
    $('#tug-t').style.flexBasis = (d.tie || 0) + '%';
    $('#tug-h').style.flexBasis = d.r + '%';
    $('#tug-ghost').hidden = d.ghost == null;
    if (d.ghost != null) $('#tug-ghost').style.left = d.ghost + '%';
    $('#wp-delta').textContent = d.delta;
    $('#wp-note').textContent = d.note;
    tabs.forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.tier === state.tier)); });
  }

  function setBalls(n) {
    document.querySelectorAll('#count .dot.b').forEach(function (dot, i) { dot.classList.toggle('on', i < n); });
  }

  var MARK = { x: 222, y: 229, n: 1, color: '#3fd27e' };

  function landPitch() {
    var callout = $('#callout');
    callout.textContent = '볼';
    callout.style.setProperty('--c', 'var(--ball)');
    callout.classList.remove('show');
    void callout.offsetWidth;
    callout.classList.add('show');
    setBalls(1);
    state.phase = 'after';
    renderWp();
    views.play.marks = [MARK];
    paint('play');
    state.busy = false;
  }

  function throwPitch() {
    if (state.busy) return;
    state.busy = true;
    state.phase = 'before';
    views.play.marks = [];
    setBalls(0);
    renderWp();
    if (reduce) { landPitch(); return; }
    var from = { x: 184, y: 322 };
    var to = { x: MARK.x, y: MARK.y };
    var at = function (e) {
      return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - Math.sin(e * Math.PI) * 12 };
    };
    var t0 = performance.now();
    requestAnimationFrame(function frame(now) {
      var t = now - t0;
      var flight = Math.max(0, Math.min(1, (t - 280) / 420));
      var ball = null;
      if (t >= 280 && flight < 1) {
        var p = at(flight);
        var q = at(Math.max(0, flight - 0.22));
        ball = { x: p.x, y: p.y, r: 3.6 - 1.8 * flight, trail: [q.x, q.y, p.x, p.y] };
      }
      var arm = t < 280 ? t / 280 : Math.max(0, 1 - flight * 2);
      paint('play', { arm: arm, ball: ball });
      if (flight < 1) requestAnimationFrame(frame);
      else landPitch();
    });
  }

  function resetPlay() {
    if (state.busy) return;
    state.phase = 'before';
    views.play.marks = [];
    setBalls(0);
    renderWp();
    paint('play');
  }

  function flipCard() {
    var card = $('#card');
    var num = $('#effect-num');
    var to = $('#mini-to');
    if (reduce) return;
    card.classList.add('back');
    setTimeout(function () {
      card.classList.remove('back');
      var t0 = performance.now();
      requestAnimationFrame(function tick(now) {
        var t = Math.min(1, (now - t0) / 700);
        num.innerHTML = '+' + (0.4 * t).toFixed(1) + '<i>%p</i>';
        to.textContent = (53.6 + 0.4 * t).toFixed(1) + '%';
        if (t < 1) requestAnimationFrame(tick);
      });
    }, 420);
  }

  function drawDots(limit) {
    var canvas = $('#dots');
    if (!canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth || 320;
    var h = canvas.clientHeight || 200;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var cols = 40;
    var cw = w / cols;
    var ch = h / 25;
    for (var i = 0; i < 1000; i++) {
      var color = i < 540 ? '#eceae4' : i < 673 ? '#4a545b' : '#5e8fe8';
      g.fillStyle = i < limit ? color : '#1a2025';
      g.beginPath();
      g.arc((i % cols) * cw + cw / 2, Math.floor(i / cols) * ch + ch / 2, Math.min(cw, ch) * 0.36, 0, Math.PI * 2);
      g.fill();
    }
  }

  function fillDots() {
    if (reduce) { drawDots(1000); return; }
    var t0 = performance.now();
    requestAnimationFrame(function tick(now) {
      var t = Math.min(1, (now - t0) / 1400);
      drawDots(Math.round(1000 * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(tick);
    });
  }

  function lightsOn() {
    if (reduce) { paint('lobby'); return; }
    var t0 = performance.now();
    requestAnimationFrame(function tick(now) {
      var t = Math.min(1, (now - t0) / 1100);
      var level = t < 0.45 ? (Math.sin(t * 46) > 0 ? 0.55 : 0.2) : 0.6 + 0.4 * ((t - 0.45) / 0.55);
      paint('lobby', { lights: t < 1 ? level : 1 });
      if (t < 1) requestAnimationFrame(tick);
    });
  }

  function paintAll() {
    Object.keys(views).forEach(function (name) { paint(name); });
    drawDots(1000);
  }

  tabs.forEach(function (b) {
    b.addEventListener('click', function () { state.tier = b.dataset.tier; renderWp(); });
  });
  $('#pitch').addEventListener('click', throwPitch);
  document.querySelector('.hud-actions .icon-btn').addEventListener('click', resetPlay);
  $('#flip').addEventListener('click', flipCard);
  $('#tmi-input').addEventListener('input', function (e) { $('#tmi-count').textContent = e.target.value.length + ' / 80'; });
  document.querySelectorAll('.chips button').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var input = $('#tmi-input');
      input.value = chip.textContent;
      $('#tmi-count').textContent = input.value.length + ' / 80';
      input.focus();
    });
  });
  $('#replay-dots').addEventListener('click', fillDots);
  $('#open').addEventListener('click', function () {
    $('#reveal .sealed').hidden = true;
    $('#reveal .truth').hidden = false;
  });
  window.addEventListener('resize', paintAll);

  renderWp();
  paintAll();
  lightsOn();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(paintAll);
})();
