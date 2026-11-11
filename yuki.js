// Юки — талисман. Картинки эмоций + «живые» движения и частицы.
// Использование:  Yuki.mount(el, 'happy', {idle:true, onTap:fn});  Yuki.react(el, 'ok' | 'bad' | 'goal' | 'wake' | 'tap');
// Yuki.mood(el, 'sleep')  — сменить эмоцию без реакции.
// После 'bad' / 'goal' / 'wake' Юки сама возвращается к улыбке (BACK), opt.onSettle вызывается в этот момент.
// Всё движение — transform/opacity (дёшево для телефона). При «уменьшении движения» в системе остаётся только смена картинки.
(function () {
  'use strict';
  // У каждой эмоции — лента из 4 нарисованных кадров (кадр 330×484).
  //   happy: открыты · полуприкрыты · закрыты · почти открыты
  //   sad:   грустные открыты · закрыты · закрыты · грустные открыты
  //   wow:   «хм» · «о?» · «ого!» · «ого!» со значками «!»
  //   sleep: спит · приоткрыт рот · начало зевка · зевок
  var SRC = { happy: 'yuki-happy.webp', sad: 'yuki-sad.webp', wow: 'yuki-wow.webp', sleep: 'yuki-sleep.webp' };
  var NF = 4;
  // Кадры: [номер, сколько мс держать, (лента другой эмоции)]. base — кадр покоя.
  var FACE = {
    happy: {
      base: 0,
      blink: [[1, 45], [2, 85], [1, 45], [3, 50]],
      laugh: [[2, 900, 'wow'], [3, 140]],                 // восторг с открытым ртом — кадр с листа «вау»
      content: [[1, 140], [2, 1300], [1, 140], [3, 180]]   // жмурится от удовольствия
    },
    sleep: {
      base: 0,
      breathe: [[0, 1700], [1, 1300]],
      yawn: [[1, 220], [2, 260], [3, 1200], [2, 240], [1, 220]]
    },
    wow: {
      base: 1,
      surprise: [[0, 110], [1, 120], [2, 150], [3, 1100], [2, 220]],
      settle: [[0, 900], [1, 200]]
    },
    sad: {
      base: 0,
      sigh: [[1, 200], [2, 800], [1, 160], [3, 500]]
    }
  };
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var canAnimate = !reduce && typeof Element !== 'undefined' && !!Element.prototype.animate;
  var mounted = [];
  Object.keys(SRC).forEach(function (k) { try { new Image().src = SRC[k]; } catch (e) {} });

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function alive(el) { return el && el.isConnected !== false && document.documentElement.contains(el); }

  // ---------- движения тела ----------
  // keyframes — для слоя .mv (весь персонаж), shadow — для тени
  var MOVES = {
    // верный ответ: присела → прыжок с вытягиванием → приземление со сплющиванием → пружинит
    hop: {
      d: 760,
      mv: [
        { transform: 'none', offset: 0, easing: 'cubic-bezier(.3,0,.5,1)' },
        { transform: 'translateY(0) scale(1.09,.89)', offset: .16, easing: 'cubic-bezier(.15,.7,.35,1)' },
        { transform: 'translateY(-13%) rotate(-3deg) scale(.95,1.07)', offset: .44, easing: 'cubic-bezier(.6,0,.85,.4)' },
        { transform: 'translateY(0) scale(1.1,.88)', offset: .64, easing: 'cubic-bezier(.2,.8,.3,1)' },
        { transform: 'scale(.97,1.03)', offset: .8, easing: 'ease-in-out' },
        { transform: 'none', offset: 1 }
      ],
      sh: [
        { transform: 'scale(1)', opacity: 1, offset: 0 },
        { transform: 'scale(1.12)', opacity: 1, offset: .16 },
        { transform: 'scale(.55)', opacity: .45, offset: .44 },
        { transform: 'scale(1.15)', opacity: 1, offset: .64 },
        { transform: 'scale(1)', opacity: 1, offset: 1 }
      ]
    },
    // цель дня: глубже присела, выше прыжок, «вау»-раздувание и долгая пружина
    pop: {
      d: 1050,
      mv: [
        { transform: 'none', offset: 0, easing: 'cubic-bezier(.3,0,.5,1)' },
        { transform: 'scale(1.12,.84)', offset: .14, easing: 'cubic-bezier(.12,.75,.3,1)' },
        { transform: 'translateY(-18%) scale(.92,1.12)', offset: .38, easing: 'cubic-bezier(.6,0,.85,.4)' },
        { transform: 'translateY(0) scale(1.13,.86)', offset: .56, easing: 'cubic-bezier(.2,.8,.3,1)' },
        { transform: 'scale(.95,1.06)', offset: .7, easing: 'ease-in-out' },
        { transform: 'scale(1.03,.98)', offset: .84, easing: 'ease-in-out' },
        { transform: 'none', offset: 1 }
      ],
      sh: [
        { transform: 'scale(1)', opacity: 1, offset: 0 },
        { transform: 'scale(1.15)', opacity: 1, offset: .14 },
        { transform: 'scale(.45)', opacity: .35, offset: .38 },
        { transform: 'scale(1.2)', opacity: 1, offset: .56 },
        { transform: 'scale(1)', opacity: 1, offset: 1 }
      ]
    },
    // ошибка: мотает головой «нет-нет» и оседает (поза остаётся, пока грустит)
    droop: {
      d: 1100, keep: true,
      mv: [
        { transform: 'none', offset: 0, easing: 'ease-out' },
        { transform: 'translateX(-2.5%) rotate(-3.5deg)', offset: .13, easing: 'ease-in-out' },
        { transform: 'translateX(2.5%) rotate(3deg)', offset: .28, easing: 'ease-in-out' },
        { transform: 'translateX(-1.2%) rotate(-1.5deg)', offset: .42, easing: 'ease-in-out' },
        { transform: 'translateY(1%) rotate(0)', offset: .55, easing: 'cubic-bezier(.3,0,.2,1)' },
        { transform: 'translateY(2.5%) scale(1.025,.955) rotate(-1deg)', offset: 1 }
      ],
      sh: [
        { transform: 'scale(1)', offset: 0 },
        { transform: 'scale(1.06)', offset: 1 }
      ]
    },
    // проснулась: вздрогнула
    jolt: {
      d: 520,
      mv: [
        { transform: 'none', offset: 0 },
        { transform: 'translateY(-4%) scale(.97,1.05)', offset: .2, easing: 'ease-out' },
        { transform: 'translateX(-1.5%) rotate(-2deg)', offset: .4 },
        { transform: 'translateX(1.5%) rotate(2deg)', offset: .6 },
        { transform: 'translateX(-.8%) rotate(-1deg)', offset: .8 },
        { transform: 'none', offset: 1 }
      ]
    },
    // смена эмоции: «пружинка», картинка меняется в момент сжатия
    swap: {
      d: 380,
      mv: [
        { transform: 'none', offset: 0, easing: 'cubic-bezier(.4,0,.6,1)' },
        { transform: 'scale(1.07,.9)', offset: .35, easing: 'cubic-bezier(.2,.9,.3,1.3)' },
        { transform: 'scale(.98,1.03)', offset: .7 },
        { transform: 'none', offset: 1 }
      ]
    },
    // сама по себе, когда скучает
    tilt: {
      d: 1900,
      mv: [
        { transform: 'none', offset: 0, easing: 'cubic-bezier(.4,0,.2,1)' },
        { transform: 'rotate(-4deg) translateX(-1.5%)', offset: .3 },
        { transform: 'rotate(-4.5deg) translateX(-1.6%)', offset: .62, easing: 'cubic-bezier(.3,1.5,.5,1)' },
        { transform: 'none', offset: 1 }
      ]
    },
    wiggle: {
      d: 1300,
      mv: [
        { transform: 'none', offset: 0, easing: 'ease-in-out' },
        { transform: 'rotate(-2.5deg)', offset: .18, easing: 'ease-in-out' },
        { transform: 'rotate(2.2deg)', offset: .38, easing: 'ease-in-out' },
        { transform: 'rotate(-1.4deg)', offset: .58, easing: 'ease-in-out' },
        { transform: 'rotate(.7deg)', offset: .78, easing: 'ease-in-out' },
        { transform: 'none', offset: 1 }
      ]
    },
    bounce: {
      d: 900,
      mv: [
        { transform: 'none', offset: 0, easing: 'ease-out' },
        { transform: 'translateY(-4%) scale(.98,1.03)', offset: .2, easing: 'ease-in' },
        { transform: 'scale(1.04,.96)', offset: .4, easing: 'ease-out' },
        { transform: 'translateY(-3%) scale(.99,1.02)', offset: .6, easing: 'ease-in' },
        { transform: 'scale(1.03,.97)', offset: .8, easing: 'ease-out' },
        { transform: 'none', offset: 1 }
      ],
      sh: [
        { transform: 'scale(1)', offset: 0 }, { transform: 'scale(.85)', offset: .2 }, { transform: 'scale(1.05)', offset: .4 },
        { transform: 'scale(.88)', offset: .6 }, { transform: 'scale(1.03)', offset: .8 }, { transform: 'scale(1)', offset: 1 }
      ]
    }
  };

  function move(el, name) {
    var st = el._yk, m = MOVES[name];
    if (!canAnimate || !m || !st) return null;
    if (st.mvA) st.mvA.cancel();
    if (st.shA) st.shA.cancel();
    st.busy = true;
    st.mvA = st.mv.animate(m.mv, { duration: m.d, fill: m.keep ? 'forwards' : 'none' });
    if (m.sh) st.shA = st.sh.animate(m.sh, { duration: m.d, fill: m.keep ? 'forwards' : 'none' });
    var a = st.mvA;
    a.onfinish = function () { if (st.mvA === a) st.busy = false; };
    return a;
  }

  // ---------- частицы ----------
  var SVG = {
    star: '<svg viewBox="0 0 24 24"><path d="M12 0C13 8 16 11 24 12 16 13 13 16 12 24 11 16 8 13 0 12 8 11 11 8 12 0Z" fill="currentColor"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-7.2-4.5-9.6-8.8C.6 9 2.3 4.8 6.3 4.8c2.3 0 3.8 1.4 5.7 3.6 1.9-2.2 3.4-3.6 5.7-3.6 4 0 5.7 4.2 3.9 7.4C19.2 16.5 12 21 12 21z" fill="currentColor"/></svg>',
    drop: '<svg viewBox="0 0 24 24"><path d="M12 1.5S4.5 11 4.5 15.5a7.5 7.5 0 0 0 15 0C19.5 11 12 1.5 12 1.5z" fill="currentColor"/><ellipse cx="9.3" cy="15" rx="1.6" ry="2.6" fill="#fff" opacity=".7"/></svg>',
    cloud: '<svg viewBox="0 0 32 20"><path d="M8 19a6 6 0 0 1-.6-12A8 8 0 0 1 23 6.5a6.3 6.3 0 0 1 1 12.5z" fill="currentColor"/></svg>',
    rain: '<svg viewBox="0 0 6 10"><path d="M3 0S0 4.5 0 6.6a3 3 0 0 0 6 0C6 4.5 3 0 3 0z" fill="currentColor"/></svg>'
  };
  var CONFETTI = ['#ffd54a', '#ff7a9c', '#5fd0c0', '#8da6ff', '#a6e07a', '#ffa45c'];

  function spawn(el, html, x, y, size, color, frames, dur, delay, cls) {
    var st = el._yk;
    if (!canAnimate || !st) return null;
    var p = document.createElement('span');
    p.className = 'yk-p' + (cls ? ' ' + cls : '');
    p.innerHTML = html;
    p.style.left = x + '%'; p.style.top = y + '%';
    p.style.width = p.style.height = size + 'px';
    p.style.marginLeft = p.style.marginTop = (-size / 2) + 'px';
    if (color) p.style.color = color;
    // пока частица ждёт своей задержки, её не видно (раньше конфетти висело у головы прямоугольниками)
    p.style.opacity = '0';
    (cls === 'yk-ring' ? st.bk : st.fx).appendChild(p);   // кольцо — за спиной, остальное — перед
    var a = p.animate(frames, { duration: dur, delay: delay || 0, easing: 'linear', fill: 'forwards' });
    a.onfinish = function () { p.remove(); };
    return a;
  }
  function unit(el) { return Math.max(.5, el.offsetWidth / 122); }

  function sparkles(el) {
    var u = unit(el), n = 8, cols = ['#ffbf1f', '#ffbf1f', '#ff7a9c', '#ffbf1f', '#3fc7b4'];
    for (var i = 0; i < n; i++) {
      var ang = -Math.PI / 2 + (i / (n - 1) - .5) * Math.PI * 1.3 + rnd(-.15, .15);
      var r = rnd(40, 66) * u, s = rnd(12, 20) * u;
      var dx = Math.cos(ang) * r, dy = Math.sin(ang) * r;
      spawn(el, SVG.star, 50 + rnd(-6, 6), 30 + rnd(-6, 4), s, cols[i % cols.length], [
        { transform: 'translate(0,0) scale(0) rotate(0)', opacity: 0 },
        { transform: 'translate(' + dx * .55 + 'px,' + dy * .55 + 'px) scale(1.15) rotate(70deg)', opacity: 1, offset: .35 },
        { transform: 'translate(' + dx + 'px,' + (dy + 6 * u) + 'px) scale(.2) rotate(160deg)', opacity: 0 }
      ], rnd(650, 900), 130 + i * 25);
    }
  }
  function hearts(el) {
    var u = unit(el);
    for (var i = 0; i < 3; i++) {
      var x = 50 + (i - 1) * 16, s = rnd(11, 15) * u, sway = rnd(-10, 10) * u;
      spawn(el, SVG.heart, x, 28, s, '#ff7a9c', [
        { transform: 'translate(0,0) scale(0)', opacity: 0 },
        { transform: 'translate(' + sway * .4 + 'px,' + (-16 * u) + 'px) scale(1.1)', opacity: 1, offset: .25 },
        { transform: 'translate(' + (-sway * .3) + 'px,' + (-38 * u) + 'px) scale(1)', opacity: 1, offset: .65 },
        { transform: 'translate(' + sway + 'px,' + (-56 * u) + 'px) scale(.8)', opacity: 0 }
      ], 1300, i * 140);
    }
  }
  function gloom(el) {
    var u = unit(el);
    // капля пота у виска
    spawn(el, SVG.drop, 70, 19, 11 * u, '#8fd3ff', [
      { transform: 'translate(0,0) scale(0)', opacity: 0 },
      { transform: 'translate(0,0) scale(1.1)', opacity: 1, offset: .18 },
      { transform: 'translate(0,' + 2 * u + 'px) scale(1)', opacity: 1, offset: .45 },
      { transform: 'translate(' + 1 * u + 'px,' + 16 * u + 'px) scale(.9,1.1)', opacity: 0 }
    ], 1400, 250);
    // маленькая тучка с дождиком над головой
    spawn(el, SVG.cloud, 52, 1, 34 * u, 'var(--yk-cloud,#9aa6b2)', [
      { transform: 'translateY(' + -6 * u + 'px) scale(.6)', opacity: 0 },
      { transform: 'translateY(0) scale(1.05)', opacity: .95, offset: .15 },
      { transform: 'translateY(0) scale(1)', opacity: .95, offset: .8 },
      { transform: 'translateY(' + -3 * u + 'px) scale(.9)', opacity: 0 }
    ], 2100, 150);
    for (var i = 0; i < 6; i++) {
      spawn(el, SVG.rain, 46 + (i % 3) * 6 + rnd(-1, 1), 4, 5 * u, '#8fd3ff', [
        { transform: 'translateY(0)', opacity: 0 },
        { transform: 'translateY(' + 3 * u + 'px)', opacity: .9, offset: .2 },
        { transform: 'translateY(' + 20 * u + 'px)', opacity: 0 }
      ], 600, 450 + i * 220);
    }
  }
  function confetti(el) {
    var u = unit(el);
    // вспышка-кольцо за спиной
    spawn(el, '', 50, 34, 90 * u, null, [
      { transform: 'scale(.15)', opacity: 0 },
      { transform: 'scale(.35)', opacity: .75, offset: .12 },
      { transform: 'scale(1.6)', opacity: 0 }
    ], 800, 120, 'yk-ring');
    for (var i = 0; i < 18; i++) {
      var ang = rnd(-165, -15) * Math.PI / 180, sp = rnd(70, 130) * u;
      var vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp, g = 260 * u, fr = [], rot = rnd(-720, 720);
      // вылетает из точки: первые кадры — крошечное и прозрачное, разворачивается уже в полёте
      for (var k = 0; k <= 10; k++) {
        var t = k / 10, T = t * 1.1, sc = Math.min(1, t / .15);
        fr.push({ transform: 'translate(' + (vx * T).toFixed(1) + 'px,' + (vy * T + g * T * T * .5).toFixed(1) + 'px) rotate(' + (rot * t).toFixed(0) + 'deg) rotateY(' + (t * 540).toFixed(0) + 'deg) scale(' + (.1 + .9 * sc).toFixed(2) + ')', opacity: t === 0 ? 0 : t < .1 ? t / .1 : t < .7 ? 1 : 1 - (t - .7) / .3 });
      }
      var sz = rnd(5, 8) * u;
      spawn(el, '<i style="display:block;width:100%;height:60%;margin-top:20%;border-radius:1px;background:currentColor"></i>', 50 + rnd(-8, 8), 34 + rnd(-6, 6), sz, pick(CONFETTI), fr, rnd(1100, 1500), 150 + rnd(0, 120));
    }
    sparkles(el);
  }
  function zzz(el) {
    var u = unit(el);
    var s = rnd(10, 13) * u, dx = rnd(14, 22) * u;
    spawn(el, '<b style="display:block;font:700 ' + s + 'px/1 system-ui,sans-serif;text-align:center">z</b>', 66, 16, s, 'var(--yk-z,#8794a0)', [
      { transform: 'translate(0,0) scale(.5) rotate(-10deg)', opacity: 0 },
      { transform: 'translate(' + dx * .3 + 'px,' + (-10 * u) + 'px) scale(.9) rotate(5deg)', opacity: .9, offset: .25 },
      { transform: 'translate(' + dx * .8 + 'px,' + (-26 * u) + 'px) scale(1.2) rotate(-6deg)', opacity: .7, offset: .65 },
      { transform: 'translate(' + dx + 'px,' + (-40 * u) + 'px) scale(1.4) rotate(8deg)', opacity: 0 }
    ], 2600, 0);
  }

  // ---------- кадры лица ----------
  function setFrame(el, i, strip) {
    var st = el._yk;
    strip = strip || st.mood;
    if (st.strip !== strip) { st.img.src = SRC[strip] || SRC.happy; st.strip = strip; }
    st.frame = strip === st.mood ? i : -1;     // кадр чужой ленты — не «покой», моргать в нём нельзя
    st.img.style.transform = 'translateX(' + (-i * 100 / NF) + '%)';
  }
  function stopFace(el) {
    var st = el._yk;
    if (st.faceT) { clearTimeout(st.faceT); st.faceT = null; }
    st.facing = false;
  }
  // проиграть последовательность кадров; по окончании — вернуть кадр покоя (или вызвать done)
  function play(el, seq, done) {
    var st = el._yk;
    stopFace(el);
    if (!canAnimate || !seq || !seq.length) { if (done) done(); return; }
    var m = st.mood, k = 0;
    st.facing = true;
    (function step() {
      if (!alive(el) || st.mood !== m) { st.facing = false; return; }
      if (k >= seq.length) {
        st.facing = false; st.faceT = null;
        if (done) done(); else setFrame(el, FACE[m].base);
        return;
      }
      setFrame(el, seq[k][0], seq[k][2]);
      st.faceT = setTimeout(step, seq[k][1]);
      k++;
    })();
  }

  // ---------- эмоция ----------
  function setImg(el, m) {
    el.dataset.mood = m;
    setFrame(el, FACE[m].base, m);
  }
  function startSleep(el) {
    var st = el._yk;
    zzz(el);
    st.zT = setInterval(function () { if (!alive(el)) { clearInterval(st.zT); return; } if (!document.hidden) zzz(el); }, 1700);
    // дышит во сне (кадры чуть меняются), иногда зевает
    (function loop() {
      if (!alive(el) || st.mood !== 'sleep') return;
      play(el, Math.random() < .3 ? FACE.sleep.yawn.concat(FACE.sleep.breathe) : FACE.sleep.breathe, loop);
    })();
  }
  function mood(el, m, quiet) {
    var st = el._yk;
    if (!st || st.mood === m) return;
    var prev = st.mood;
    st.mood = m;
    stopFace(el);
    if (st.zT) { clearInterval(st.zT); st.zT = null; }
    if (prev === 'sad' && st.mvA) { st.mvA.cancel(); if (st.shA) st.shA.cancel(); }
    if (!canAnimate || quiet) setImg(el, m);
    else { move(el, 'swap'); setTimeout(function () { if (st.mood === m) setImg(el, m); }, 130); }
    if (m === 'sleep' && canAnimate) setTimeout(function () { if (st.mood === 'sleep') startSleep(el); }, quiet ? 0 : 140);
  }

  // Эмоция не висит вечно: через ms Юки сама возвращается к обычной улыбке и «встряхивается».
  // Новая реакция отменяет прежний таймер, поэтому реакции не наслаиваются.
  var BACK = { bad: 4300, goal: 3600, wake: 3200 };
  function settle(el, ms, cb) {
    var st = el._yk;
    clearTimeout(st.retT);
    st.retT = setTimeout(function () {
      st.retT = null;
      if (!alive(el) || st.mood === 'happy' || st.mood === 'sleep') return;
      mood(el, 'happy');
      setTimeout(function () { if (st.mood === 'happy') { move(el, 'bounce'); play(el, FACE.happy.blink); } }, 170);
      if (cb) cb();
    }, ms);
  }
  function react(el, ev) {
    var st = el._yk;
    if (!st) return;
    clearTimeout(st.retT);
    if (BACK[ev]) settle(el, BACK[ev], st.onSettle);
    if (ev === 'ok') {
      mood(el, 'happy', true);
      move(el, 'hop'); sparkles(el); play(el, FACE.happy.laugh);
    } else if (ev === 'bad') {
      mood(el, 'sad');
      setTimeout(function () {
        move(el, 'droop'); gloom(el);
        st.faceT = setTimeout(function () { if (st.mood === 'sad') play(el, FACE.sad.sigh); }, 1300);
      }, canAnimate ? 200 : 0);
    } else if (ev === 'goal') {
      mood(el, 'wow');
      setTimeout(function () { move(el, 'pop'); confetti(el); play(el, FACE.wow.surprise); }, canAnimate ? 160 : 0);
    } else if (ev === 'wake') {
      stopFace(el);
      play(el, [[1, 120], [2, 160]]);           // во сне открывает рот — «а?»
      move(el, 'jolt');
      setTimeout(function () {
        mood(el, 'wow');
        setTimeout(function () { move(el, 'pop'); sparkles(el); play(el, FACE.wow.surprise); }, 160);
      }, canAnimate ? 380 : 0);
    } else if (ev === 'tap') {
      if (st.mood === 'sleep') return react(el, 'wake');
      if (st.mood !== 'happy') { mood(el, 'happy'); setTimeout(function () { move(el, 'bounce'); hearts(el); play(el, FACE.happy.laugh); }, 160); return; }
      move(el, pick(['hop', 'bounce'])); hearts(el); play(el, FACE.happy.laugh);
    }
  }

  // ---------- сама по себе: моргает и иногда что-то делает ----------
  function blinkLoop(el) {
    var st = el._yk;
    setTimeout(function next() {
      if (!alive(el)) return;
      setTimeout(next, rnd(2400, 5200));
      if (document.hidden || st.facing || st.mood !== 'happy' || st.frame !== FACE.happy.base) return;
      var b = FACE.happy.blink;
      play(el, Math.random() < .2 ? b.concat([[2, 110]], b) : b);   // иногда двойное
    }, rnd(1200, 2600));
  }
  var idleT = null;
  function idleTick() {
    idleT = setTimeout(idleTick, rnd(6000, 10000));
    if (document.hidden) return;
    mounted = mounted.filter(alive);
    mounted.forEach(function (el) {
      var st = el._yk;
      if (!st.idle || st.busy || st.facing) return;
      if (st.mood === 'happy') {
        var r = Math.random();
        if (r < .3) play(el, FACE.happy.content);                       // жмурится от удовольствия
        else if (r < .55) { move(el, 'bounce'); play(el, FACE.happy.laugh); }
        else move(el, pick(['tilt', 'wiggle', 'tilt']));
      } else if (st.mood === 'sad') play(el, FACE.sad.sigh);           // вздыхает
      else if (st.mood === 'wow') { move(el, 'tilt'); play(el, FACE.wow.settle); }
    });
  }

  function mount(el, m, opt) {
    opt = opt || {};
    el.classList.add('yuki');
    el.innerHTML = '<span class="yk-sh"></span><span class="yk-bk"></span><span class="yk-mv"><span class="yk-bd"><span class="yk-win"><img alt="" draggable="false"></span></span></span><span class="yk-fx"></span>';
    el._yk = {
      mood: null, idle: !!opt.idle, busy: false, frame: 0, facing: false, retT: null, onSettle: opt.onSettle || null,
      mv: el.querySelector('.yk-mv'), sh: el.querySelector('.yk-sh'), fx: el.querySelector('.yk-fx'), bk: el.querySelector('.yk-bk'), img: el.querySelector('img')
    };
    mood(el, m || 'happy', true);
    if (opt.onTap !== false) {
      el.addEventListener('click', function () { var was = el._yk.mood; react(el, 'tap'); if (opt.onTap) opt.onTap(was); });
    }
    mounted.push(el);
    if (canAnimate) {
      blinkLoop(el);
      if (!idleT) idleT = setTimeout(idleTick, rnd(3500, 6000));
    }
    return el;
  }

  window.Yuki = {
    mount: mount, react: react,
    mood: function (el, m) { if (el._yk) clearTimeout(el._yk.retT); mood(el, m); },
    get: function (el) { return el._yk && el._yk.mood; }
  };
})();
