const fs = require('fs');
const dir = process.argv[2];
const PARTS = ['は','が','を','に','で','へ','と','も','の','や','から','まで','か'];

// 1. данные
global.window = global;
eval(fs.readFileSync(dir + '/data.js', 'utf8'));
let bad = 0;
const cnt = s => (s.match(/＿/g) || []).length;
BASE.forEach((s, i) => {
  const errs = [];
  if (cnt(s.t) !== 1) errs.push('t: blanks=' + cnt(s.t));
  if (!s.r || cnt(s.r) !== 1) errs.push('r: blanks=' + (s.r ? cnt(s.r) : 'none'));
  if (!Array.isArray(s.a) || !s.a.length || !s.a.every(p => PARTS.includes(p))) errs.push('bad answers');
  if (!s.ru) errs.push('no ru');
  if (errs.length) { bad++; console.log('ERR #' + i, s.t, errs.join('; ')); }
});
console.log('sentences:', BASE.length, 'errors:', bad);
const byP = {}; BASE.forEach(s => byP[s.a[0]] = (byP[s.a[0]] || 0) + 1);
console.log(JSON.stringify(byP));

// 1b. фуригана на всех предложениях
{
  const htmlSrc = fs.readFileSync(dir + '/index.html', 'utf8');
  const m = htmlSrc.match(/\/\/ FURIGANA-BEGIN([\s\S]*?)\/\/ FURIGANA-END/);
  if (!m) { console.log('FAIL: FURIGANA block not found'); process.exitCode = 1; }
  else {
    const furigana = new Function(m[1] + '; return furigana;')();
    let ok = 0, noKanji = 0; const fails = [];
    BASE.forEach((s, i) => {
      const res = furigana(s.t, s.r);
      if (res) {
        ok++;
        // собранный текст должен совпадать с исходным
        const back = res.map(p => p.s).join('');
        if (back !== s.t) fails.push('mismatch #' + i + ' ' + s.t);
        if (!res.some(p => p.rd)) noKanji++;
      } else fails.push('#' + i + ' ' + s.t + ' | ' + s.r);
    });
    console.log('furigana aligned:', ok, '/', BASE.length, '(without kanji:', noKanji + ')');
    if (fails.length) { console.log('FURIGANA FAILS:\n  ' + fails.join('\n  ')); process.exitCode = 1; }
    // выборочно покажем разметку
    [0, 24, 100, 150].forEach(i => { const r = furigana(BASE[i].t, BASE[i].r); if (r) console.log('  ', r.map(p => p.rd ? p.s + '(' + p.rd + ')' : p.s).join('')); });
  }
}

// 1c. рукописная сетка на всех предложениях
{
  const src = fs.readFileSync(dir + '/index.html', 'utf8');
  const f = src.match(/\/\/ FURIGANA-BEGIN([\s\S]*?)\/\/ FURIGANA-END/);
  const g = src.match(/\/\/ GRID-BEGIN([\s\S]*?)\/\/ GRID-END/);
  if (!f || !g) { console.log('FAIL: GRID/FURIGANA block not found'); process.exitCode = 1; }
  else {
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const gridHtml = new Function('esc', f[1] + g[1] + '; return gridHtml;')(esc);
    const strip = h => h.replace(/<span class="rt"[^>]*>[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '');
    let bad = 0, maxCells = 0, withRuby = 0;
    BASE.forEach((s, i) => {
      for (const [fill, wrong, ruby] of [[null, '', false], [s.a[0], '', true], [s.a[0], 'を', true]]) {
        const out = gridHtml({ t: s.t, r: s.r }, fill, ruby, wrong);
        const text = strip(out.html);
        const want = s.t.replace('＿', fill || '');
        if (text !== want) { bad++; console.log('GRID MISMATCH #' + i, JSON.stringify(text), JSON.stringify(want)); }
        if (ruby && out.ruby) withRuby++;
        (out.html.match(/<span class="cs">[\s\S]*?<\/span><\/span>/g) || []).forEach(u => {
          maxCells = Math.max(maxCells, (u.match(/class="c(?: [^"]*)?"/g) || []).length);
        });
      }
    });
    console.log('grid: mismatches', bad, '| max cells in one word-unit', maxCells, '| ruby builds', withRuby);
    if (bad) process.exitCode = 1;
  }
}

// 2. приложение с заглушкой браузера
const html = fs.readFileSync(dir + '/index.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = scripts[0];
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
const app = { innerHTML: '' };
const fields = {};
const handlers = {};
global.document = {
  getElementById: id => id === 'app' ? app : (fields[id] || (fields[id] = { value: '', textContent: '' })),
  querySelectorAll: () => [],
  addEventListener: (t, f) => { handlers[t] = f; },
  createElement: () => ({ click() {}, remove() {} }),
  body: { appendChild() {} },
};
global.navigator = {};
global.scrollTo = () => {};
global.Blob = class {};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
global.FileReader = class {};
let spoken = [];
global.speechSynthesis = { cancel() {}, speak(u) { spoken.push(u.text); }, getVoices: () => [{ lang: 'ja-JP' }] };
global.SpeechSynthesisUtterance = function (x) { this.text = x; };
eval(code);

const click = (sel, dataset) => handlers.click({ target: { closest: s => (s === sel ? { dataset } : null) } });
const change = ev => handlers.change(ev);
const fail = m => { console.log('FAIL:', m); process.exitCode = 1; };

if (!app.innerHTML.includes('class="tile"')) fail('home screen not rendered');
click('[data-act]', { act: 'open', m: 'all' });
if (!app.innerHTML.includes('class="grid"')) fail('practice screen not rendered');
// ответить неправильно и правильно
const curItem = () => {
  const m = app.innerHTML.match(/class="sent">(.*?)<\/div>/);
  return m && m[1];
};
click('[data-act]', { act: 'ans', p: 'か' });   // скорее всего ошибка
if (!/res (ok|no)/.test(app.innerHTML)) fail('no result card after answer');
if (!app.innerHTML.includes('data-act="speak"')) fail('no speak button');
click('[data-act]', { act: 'speak' });
if (spoken.length !== 1 || spoken[0].includes('＿')) fail('speak text: ' + JSON.stringify(spoken));
click('[data-act]', { act: 'defspeak' });
click('[data-act]', { act: 'next' });
click('[data-act]', { act: 'ans', p: 'は' });
if (spoken.length !== 2) fail('auto speak: ' + spoken.length);
click('[data-act]', { act: 'next' });
let sawGoal = false;
for (let i = 0; i < 40; i++) {
  click('[data-act]', { act: 'ans', p: PARTS[i % PARTS.length] });
  if (app.innerHTML.includes('Цель на сегодня выполнена')) sawGoal = true;
  click('[data-act]', { act: 'next' });
}
if (!sawGoal) fail('goal message never shown');
// подсказка
click('[data-act]', { act: 'hint' });
if (!app.innerHTML.includes('class="note"')) fail('hint not shown');
click('[data-act]', { act: 'ans', p: 'は' });
// фуригана в интерфейсе
click('[data-act]', { act: 'reading' });
if (!app.innerHTML.includes('class="grid"')) fail('grid not shown after toggling reading');
click('[data-act]', { act: 'goal', n: '20' });
click('[data-act]', { act: 'next' });
const st = JSON.parse(store.jp_stats);
console.log('answered items tracked:', Object.keys(st).length);
// вкладки
for (const t of ['diary', 'progress', 'add', 'more', 'home', 'practice']) {
  handlers.click({ target: { closest: s => (s === '[data-tab]' ? { dataset: { tab: t } } : null) } });
  if (!app.innerHTML.length) fail('empty render for ' + t);
}
// режим ошибок и дневник
click('[data-act]', { act: 'train' });
handlers.click({ target: { closest: s => (s === '[data-tab]' ? { dataset: { tab: 'diary' } } : null) } });
console.log('diary has rows:', app.innerHTML.includes('class="item"'));
// добавление своего предложения: ошибки
handlers.click({ target: { closest: s => (s === '[data-tab]' ? { dataset: { tab: 'add' } } : null) } });
fields['f-t'] = { value: 'テスト文です' };
fields['f-r'] = { value: '' };
fields['f-ru'] = { value: '' };
fields['f-a1'] = { value: 'は' };
fields['f-a2'] = { value: '' };
fields['f-msg'] = { textContent: '' };
click('[data-act]', { act: 'add' });
if (!fields['f-msg'].textContent.includes('ровно одно')) fail('blank validation');
fields['f-t'].value = '私_学生です';
click('[data-act]', { act: 'add' });
if (!fields['f-msg'].textContent.includes('перевод')) fail('ru validation: ' + fields['f-msg'].textContent);
fields['f-ru'].value = 'Я студент.';
click('[data-act]', { act: 'add' });
const cu = JSON.parse(store.jp_custom);
if (cu.length !== 1 || cu[0].t !== '私＿学生です') fail('custom not saved: ' + JSON.stringify(cu));
// импорт
const bak = JSON.stringify({ v: 1, stats: st, custom: cu, days: JSON.parse(store.jp_days), settings: { reading: true } });
global.FileReader = class { readAsText() { this.result = bak; this.onload(); } };
change({ target: { id: 'imp', files: [{}] } });
if (!app.innerHTML.includes('Данные загружены')) fail('import notice missing');
// сброс (двухшаговый)
click('[data-act]', { act: 'reset' });
if (!app.innerHTML.includes('Точно сбросить')) fail('reset not armed');
click('[data-act]', { act: 'reset' });
if (Object.keys(JSON.parse(store.jp_stats)).length !== 0) fail('reset did not clear stats');
console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'ALL APP CHECKS PASSED');
