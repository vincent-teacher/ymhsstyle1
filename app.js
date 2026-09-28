/* 楊梅高中梅岡風 — 前端程式（純原生 JS，可直接以 file:// 開啟）
 * 資料來源：data/issues.js（由 tools/build.py 產生），新增期別後重新建置即可自動出現。 */
(() => {
'use strict';

const DATA = window.MGF_DATA || { issues: [] };
const ISSUES = DATA.issues.slice().sort((a, b) => a.no - b.no);
const PAGES = [];
const BY_NO = new Map();
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const thumb = p => `img/thumb/${p.k}.webp`;
const webImg = p => `img/web/${p.k}.webp`;
const COLORS = ['#9c65b9', '#e81c2e', '#f08c00', '#13a89e', '#3d8bfd', '#d6336c', '#7048e8', '#2f9e44'];
const issueColor = no => COLORS[no % COLORS.length];

function norm(s) {
  return String(s || '').replace(/\s+/g, '').replace(/台/g, '臺')
    .replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).toLowerCase();
}
ISSUES.forEach(is => {
  is.year = is.ym ? Math.floor(is.ym / 100) : 0;
  is.pages.sort((a, b) => a.p - b.p);
  is.pages.forEach(p => {
    p.issue = is; p.no = is.no; p.L = p.L || []; p.heads = p.heads || [];
    p.text = p.L.map(l => l[0]).join('\n');
    p.norm = norm(p.text);
    p.headNorm = norm(p.heads.join('') + (p.sec || '') + is.title + is.note);
    p.idx = PAGES.length; PAGES.push(p);
  });
  BY_NO.set(is.no, is);
});
const LATEST = ISSUES[ISSUES.length - 1];
const YEARS = [...new Set(ISSUES.map(i => i.year).filter(Boolean))].sort((a, b) => a - b);
const TOTAL_CHARS = PAGES.reduce((s, p) => s + p.norm.length, 0);

/* ---------- 儲存 ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('mgf.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mgf.' + k, JSON.stringify(v)); } catch { } }
};
const seen = store.get('seen', {});
let favs = store.get('favs', []);
const stats = store.get('stats', { searches: 0, dice: 0, timeline: 0, hd: 0 });
let history_ = store.get('history', []);
const settings = Object.assign({ full: 'off', sound: 'on', device: 'auto', layout: 'auto', lang: 'zh', font: 'm', theme: 'system' }, store.get('settings', {}));

/* ---------- 語言 ---------- */
const I18N = {
  en: {
    school: 'Yangmei HS', 'nav.home': 'Home', 'nav.issues': 'Issues', 'nav.search': 'Search', 'nav.timeline': 'Timeline', 'nav.my': 'My Shelf', 'nav.about': 'About',
    'nav.issuesShort': 'Issues', 'nav.searchShort': 'Search', 'nav.timelineShort': 'Timeline', 'nav.myShort': 'Mine',
    'search.ph': 'Search all page text…', random: 'Random page', settings: 'Settings', 'footer.sub': 'Digital archive of the school newspaper',
    'viewer.text': 'Page text', 'viewer.find': 'Find on this page…', 'viewer.ocrNote': 'Text is machine-recognised (OCR) and may contain errors. Click a line to zoom to it.',
    'set.full': 'Fullscreen', 'set.sound': 'Sound', 'set.device': 'Device', 'set.layout': 'Orientation', 'set.lang': 'Language', 'set.font': 'Font size', 'set.theme': 'Theme'
  }
};
const L = (zh, en) => settings.lang === 'en' && en != null ? en : zh;
function applyI18n() {
  document.documentElement.lang = settings.lang === 'en' ? 'en' : 'zh-Hant-TW';
  const d = I18N[settings.lang];
  $$('[data-i18n]').forEach(el => { el.dataset.zh ??= el.textContent; el.textContent = d?.[el.dataset.i18n] ?? el.dataset.zh; });
  $$('[data-i18n-ph]').forEach(el => { el.dataset.zhph ??= el.placeholder; el.placeholder = d?.[el.dataset.i18nPh] ?? el.dataset.zhph; });
  $$('[data-i18n-title]').forEach(el => { el.dataset.zht ??= el.title; el.title = d?.[el.dataset.i18nTitle] ?? el.dataset.zht; });
}
const issueName = no => L(`第${no}期`, `Issue ${no}`);
const pageName = p => L(`第${p}版`, `Page ${p}`);
const dateText = is => is.date ? (settings.lang === 'en' ? is.date.replace(/(\d{4})年(\d{1,2})月.*/, (m, y, mo) => `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mo - 1]} ${y}`) : is.date) : L('日期未標示', 'Date n/a');

/* ---------- 音效（Web Audio 即時合成，無外部檔案） ---------- */
let AC = null;
function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { } } if (AC?.state === 'suspended') AC.resume(); return AC; }
function tone(freq, dur, type = 'sine', vol = .15, delay = 0, slide) {
  const a = ac(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
}
function noise(dur, f0, f1, vol = .2, q = 1.2) {
  const a = ac(); if (!a) return;
  const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
  f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.value = vol; s.buffer = buf; s.connect(f).connect(g).connect(a.destination); s.start();
}
const SFX = {
  click: () => tone(720, .07, 'sine', .08, 0, 980),
  nav: () => { tone(523, .09, 'triangle', .09); tone(784, .12, 'triangle', .08, .06); },
  flip: () => { noise(.28, 900, 3800, .35, .9); tone(180, .08, 'sine', .05); },
  open: () => { noise(.35, 300, 2400, .18, .7); tone(392, .18, 'triangle', .07, .05, 784); },
  close: () => { noise(.25, 2200, 400, .15, .7); },
  pop: () => tone(880, .12, 'sine', .12, 0, 440),
  fav: () => { tone(660, .1, 'sine', .1); tone(990, .16, 'sine', .1, .08); },
  unfav: () => tone(500, .14, 'sine', .08, 0, 300),
  search: () => { tone(600, .06, 'square', .04); tone(900, .1, 'sine', .08, .05); },
  none: () => tone(220, .22, 'triangle', .09, 0, 160),
  dice: () => { for (let i = 0; i < 7; i++) tone(300 + Math.random() * 700, .04, 'square', .035, i * .07); tone(1046, .25, 'triangle', .1, .52); },
  chime: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, .35, 'triangle', .1, i * .09)),
  zoom: (up) => tone(up ? 500 : 420, .06, 'sine', .05, 0, up ? 700 : 300)
};
function sfx(name, ...a) { if (settings.sound === 'on') try { SFX[name]?.(...a); } catch { } }

/* ---------- 提示與彩紙 ---------- */
function toast(msg, cls = '') {
  const el = document.createElement('div'); el.className = 'toast ' + cls; el.innerHTML = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 2600);
}
function confetti(n = 70) {
  const cols = ['#9c65b9', '#e81c2e', '#ffb627', '#13a89e', '#3d8bfd', '#ff6f91', '#fff'];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i'); c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length];
    c.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px'); c.style.setProperty('--r', (Math.random() * 1080 - 540) + 'deg');
    c.style.animationDuration = (1.8 + Math.random() * 1.8) + 's'; c.style.animationDelay = Math.random() * .4 + 's';
    if (i % 3 === 0) c.style.borderRadius = '50%';
    document.body.appendChild(c); setTimeout(() => c.remove(), 4200);
  }
}

/* ---------- 成就 ---------- */
const BADGES = [
  { id: 'first', ic: '🌸', zh: '初見梅岡', en: 'First Look', dz: '閱讀第 1 個版面', de: 'Read your first page', ok: () => seenCount() >= 1 },
  { id: 'r10', ic: '📖', zh: '小書蟲', en: 'Bookworm', dz: '閱讀 10 個版面', de: 'Read 10 pages', ok: () => seenCount() >= 10 },
  { id: 'r50', ic: '🦉', zh: '梅岡達人', en: 'Scholar', dz: '閱讀 50 個版面', de: 'Read 50 pages', ok: () => seenCount() >= 50 },
  { id: 'issue', ic: '🗞️', zh: '完整一期', en: 'Full Issue', dz: '讀完任一期的所有版面', de: 'Read every page of an issue', ok: () => ISSUES.some(is => is.pages.every(p => seen[p.k])) },
  { id: 'all', ic: '👑', zh: '典藏大師', en: 'Archive Master', dz: '讀遍全部版面', de: 'Read every page', ok: () => PAGES.length && seenCount() >= PAGES.length },
  { id: 's1', ic: '🔍', zh: '初試檢索', en: 'Searcher', dz: '完成 1 次全文檢索', de: 'Run a search', ok: () => stats.searches >= 1 },
  { id: 's10', ic: '🕵️', zh: '檢索高手', en: 'Detective', dz: '完成 10 次檢索', de: 'Run 10 searches', ok: () => stats.searches >= 10 },
  { id: 'fav5', ic: '💖', zh: '收藏家', en: 'Collector', dz: '收藏 5 個版面', de: 'Save 5 pages', ok: () => favs.length >= 5 },
  { id: 'dice', ic: '🎲', zh: '驚喜翻閱', en: 'Lucky Dip', dz: '使用隨機翻閱 3 次', de: 'Use random page 3 times', ok: () => stats.dice >= 3 },
  { id: 'time', ic: '⏳', zh: '時光旅人', en: 'Time Traveller', dz: '造訪時光軸', de: 'Visit the timeline', ok: () => stats.timeline >= 1 },
  { id: 'hd', ic: '🔬', zh: '細節控', en: 'Detail Lover', dz: '載入高解析原圖', de: 'Load a hi-res original', ok: () => stats.hd >= 1 },
  { id: 'years', ic: '🧭', zh: '跨越年代', en: 'Decade Hopper', dz: '閱讀 5 個不同年份的刊物', de: 'Read issues from 5 different years', ok: () => new Set(PAGES.filter(p => seen[p.k] && p.issue.year).map(p => p.issue.year)).size >= 5 }
];
let got = store.get('badges', []);
function seenCount() { return PAGES.reduce((n, p) => n + (seen[p.k] ? 1 : 0), 0); }
function checkBadges() {
  BADGES.forEach(b => {
    if (!got.includes(b.id) && b.ok()) {
      got.push(b.id); store.set('badges', got);
      setTimeout(() => { sfx('chime'); confetti(); toast(`${b.ic} ${L('獲得成就', 'Achievement')}：${L(b.zh, b.en)}`, 'gold'); }, 400);
    }
  });
}
function markSeen(p) { if (!seen[p.k]) { seen[p.k] = Date.now(); } else seen[p.k] = Date.now(); store.set('seen', seen); checkBadges(); }
function toggleFav(k) {
  const i = favs.indexOf(k);
  if (i >= 0) { favs.splice(i, 1); sfx('unfav'); toast(L('已取消收藏', 'Removed')); }
  else { favs.unshift(k); sfx('fav'); toast('💖 ' + L('已加入收藏', 'Saved to My Shelf')); }
  store.set('favs', favs); checkBadges();
  return i < 0;
}

/* ---------- 設定 ---------- */
const SET_OPTS = {
  full: [['off', '關閉', 'Off'], ['on', '開啟', 'On']],
  sound: [['on', '開啟', 'On'], ['off', '靜音', 'Mute']],
  device: [['auto', '自動', 'Auto'], ['phone', '手機', 'Phone'], ['tablet', '平板', 'Tablet'], ['desktop', '電腦', 'Desktop']],
  layout: [['auto', '自動', 'Auto'], ['portrait', '直式', 'Portrait'], ['landscape', '橫式', 'Landscape']],
  lang: [['zh', '繁體中文', '繁體中文'], ['en', 'English', 'English']],
  font: [['s', '小', 'S'], ['m', '標準', 'M'], ['l', '大', 'L'], ['xl', '特大', 'XL']],
  theme: [['system', '跟隨系統', 'System'], ['light', '亮色', 'Light'], ['dark', '暗色', 'Dark']]
};
const mqDark = matchMedia('(prefers-color-scheme: dark)');
function applySettings() {
  const b = document.body;
  b.dataset.device = settings.device; b.dataset.layout = settings.layout; b.dataset.font = settings.font;
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && mqDark.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.dataset.theme = settings.theme === 'system' ? '' : settings.theme;
  updateNarrow();
  applyI18n();
  $$('.seg[data-set]').forEach(seg => {
    const k = seg.dataset.set;
    seg.innerHTML = SET_OPTS[k].map(([v, zh, en]) => `<button data-v="${v}" class="${settings[k] === v ? 'on' : ''}">${L(zh, en)}</button>`).join('');
  });
}
function updateNarrow() {
  const w = settings.device === 'phone' ? 430 : settings.device === 'tablet' ? 820 : innerWidth;
  document.body.classList.toggle('narrow', w <= 820 && settings.device !== 'desktop');
}
function setSetting(k, v) {
  settings[k] = v; store.set('settings', settings);
  if (k === 'full') {
    try { if (v === 'on') document.documentElement.requestFullscreen?.(); else if (document.fullscreenElement) document.exitFullscreen?.(); } catch { }
  }
  applySettings(); sfx('click');
  if (k === 'lang' || k === 'device' || k === 'layout') rerender();
}
document.addEventListener('fullscreenchange', () => { settings.full = document.fullscreenElement ? 'on' : 'off'; store.set('settings', settings); applySettings(); });
mqDark.addEventListener?.('change', applySettings);
addEventListener('resize', () => { updateNarrow(); if (V.open) V.fit(false); });

/* ---------- 飄落梅花（Canvas 動畫） ---------- */
const petals = (() => {
  const cv = $('#petals'), ctx = cv.getContext('2d');
  let W, H, list = [], run = true;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cols = ['#f21921', '#ff6f91', '#c5a2da', '#ffb3c6', '#9c65b9'];
  function size() { const r = devicePixelRatio || 1; W = innerWidth; H = innerHeight; cv.width = W * r; cv.height = H * r; ctx.setTransform(r, 0, 0, r, 0, 0); }
  function mk(top) { return { x: Math.random() * W, y: top ? -30 : Math.random() * H, s: 5 + Math.random() * 8, vy: .35 + Math.random() * .7, ph: Math.random() * 6.28, rot: Math.random() * 6.28, vr: (Math.random() - .5) * .02, c: cols[Math.floor(Math.random() * cols.length)], a: .35 + Math.random() * .4 }; }
  function flower(p) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = p.a; ctx.fillStyle = p.c;
    for (let i = 0; i < 5; i++) { const a = i * 1.2566 - 1.5708; ctx.beginPath(); ctx.arc(Math.cos(a) * p.s * .62, Math.sin(a) * p.s * .62, p.s * .55, 0, 6.283); ctx.fill(); }
    ctx.fillStyle = '#ffd54a'; ctx.beginPath(); ctx.arc(0, 0, p.s * .3, 0, 6.283); ctx.fill(); ctx.restore();
  }
  function frame() {
    if (run) {
      ctx.clearRect(0, 0, W, H);
      list.forEach(p => { p.y += p.vy; p.ph += .015; p.x += Math.sin(p.ph) * .5; p.rot += p.vr; if (p.y > H + 30) Object.assign(p, mk(true)); flower(p); });
    }
    requestAnimationFrame(frame);
  }
  size(); addEventListener('resize', size);
  list = Array.from({ length: reduce ? 10 : Math.min(28, Math.round(innerWidth / 50)) }, () => mk(false));
  frame();
  document.addEventListener('visibilitychange', () => run = !document.hidden);
  return { pause(v) { run = !v; if (v) ctx.clearRect(0, 0, W, H); } };
})();

/* ---------- 共用畫面片段 ---------- */
const svg = id => `<svg><use href="#i-${id}"/></svg>`;
const plumTitle = (text, extra = '') => `<h2 class="sec-title"><svg class="plum"><use href="#i-plum"/></svg>${text}${extra}</h2>`;
function ring(is) {
  const n = is.pages.filter(p => seen[p.k]).length; if (!n) return '';
  const r = 15, c = 2 * Math.PI * r, f = n / is.pages.length;
  return `<svg class="progress-ring" viewBox="0 0 40 40"><circle class="bg" cx="20" cy="20" r="${r}"/><circle class="fg" cx="20" cy="20" r="${r}" stroke-dasharray="${c * f} ${c}"/><text x="20" y="20">${Math.round(f * 100)}%</text></svg>`;
}
function issueCard(is) {
  const heads = is.pages.flatMap(p => p.heads).slice(0, 3).join('、');
  return `<a class="issue-card card reveal" href="#/issue/${is.no}">
    <div class="thumb"><img loading="lazy" src="${thumb(is.pages[0])}" alt="${esc(issueName(is.no))}${esc(pageName(1))}">
      <span class="issue-no" style="background:${issueColor(is.no)}">${issueName(is.no)}</span>${ring(is)}
      <span class="pages-n">${L(`共 ${is.pages.length} 版`, `${is.pages.length} pages`)}</span></div>
    <div class="body"><span class="date">${esc(dateText(is))}</span>${is.title ? `<b>${esc(is.title)}</b>` : ''}<span class="heads">${esc(heads) || '&nbsp;'}</span></div></a>`;
}
function issueRow(is) {
  const heads = is.pages.flatMap(p => p.heads).slice(0, 5).join('、');
  return `<a class="issue-row card reveal" href="#/issue/${is.no}"><img loading="lazy" src="${thumb(is.pages[0])}" alt="">
    <div><h3>${issueName(is.no)} <span class="pill p">${esc(dateText(is))}</span></h3><div class="heads">${esc(heads)}</div></div>
    <span class="pill t">${L(`${is.pages.length} 版`, `${is.pages.length} p.`)}</span></a>`;
}
function pageCard(p, withIssue) {
  return `<button class="page-card card reveal" data-read="${p.no}/${p.p}">
    <div class="thumb"><img loading="lazy" src="${thumb(p)}" alt="${esc(issueName(p.no) + pageName(p.p))}">
      <span class="pno">${withIssue ? issueName(p.no) + ' · ' : ''}${pageName(p.p)}</span>
      ${seen[p.k] ? `<span class="seen">✓ ${L('已讀', 'Read')}</span>` : ''}${favs.includes(p.k) ? `<svg class="fav"><use href="#i-heart"/></svg>` : ''}</div>
    <div class="body"><div class="sec">${esc(p.sec || pageName(p.p))}</div>
      ${p.heads.length ? `<ul>${p.heads.slice(0, 4).map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}</div></button>`;
}
function reveal(root) {
  const els = $$('.reveal', root);
  if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '60px' });
  els.forEach((e, i) => { e.style.transitionDelay = Math.min(i % 12, 11) * 40 + 'ms'; io.observe(e); });
}
function countUp(root) {
  $$('[data-count]', root).forEach(el => {
    const to = +el.dataset.count, dec = +(el.dataset.dec || 0), t0 = performance.now(), dur = 1400;
    const step = t => { const k = Math.min(1, (t - t0) / dur), v = to * (1 - Math.pow(1 - k, 3)); el.textContent = v.toFixed(dec); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

/* ---------- 檢索 ---------- */
const HOT = ['繁星', '畢業典禮', '校慶', '榜單', '競賽', '冠軍', '國際', '閱讀', '圖書館', '運動會', '科展', '志工', '社團', '服務學習', '自主學習', '探究', '課程', '環境教育', '英語', '音樂', '美術', '戲劇', '合唱', '籃球', '田徑', '獎學金', '校友', '家長', '新生', '成年禮', '營隊', '交流', '電子', '資訊', '數學', '科學', '健康', '防災', '藝文', '教師'];
function termRx(term) {
  const parts = [...term].map(ch => ch === '臺' || ch === '台' ? '[臺台]' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(parts.join('\\s*'), 'gi');
}
function parseTerms(q) { return String(q || '').trim().split(/[\s,，、]+/).filter(Boolean).map(t => ({ raw: t, n: norm(t), rx: termRx(t) })).filter(t => t.n); }
function highlight(text, terms) {
  let out = esc(text);
  terms.forEach(t => { out = out.replace(new RegExp(termRx(esc(t.raw)).source, 'gi'), m => `<mark>${m}</mark>`); });
  return out;
}
function doSearch(q, opt = {}) {
  const terms = parseTerms(q);
  if (!terms.length) return { terms, hits: [] };
  const hits = [];
  for (const p of PAGES) {
    if (opt.from && p.no < opt.from) continue;
    if (opt.to && p.no > opt.to) continue;
    if (opt.year && p.issue.year !== opt.year) continue;
    if (opt.page && (opt.page === 5 ? p.p < 5 : p.p !== opt.page)) continue;
    const hay = opt.scope === 'head' ? p.headNorm : p.norm + p.headNorm;
    if (!terms.every(t => hay.includes(t.n))) continue;
    let score = 0;
    terms.forEach(t => { let i = -1, c = 0; while ((i = hay.indexOf(t.n, i + 1)) >= 0 && c < 50) c++; score += c + (p.headNorm.includes(t.n) ? 20 : 0); });
    hits.push({ p, score });
  }
  if (opt.sort === 'new') hits.sort((a, b) => b.p.no - a.p.no || a.p.p - b.p.p);
  else if (opt.sort === 'old') hits.sort((a, b) => a.p.no - b.p.no || a.p.p - b.p.p);
  else hits.sort((a, b) => b.score - a.score || b.p.no - a.p.no);
  return { terms, hits };
}
function snippets(p, terms, max = 3) {
  const out = [];
  for (const line of p.L) {
    const n = norm(line[0]);
    if (terms.some(t => n.includes(t.n))) { out.push(line[0]); if (out.length >= max) break; }
  }
  if (!out.length) out.push((p.heads[0] || p.text.slice(0, 80)));
  return out.map(s => s.length > 120 ? s.slice(0, 120) + '…' : s);
}

/* ---------- 路由 ---------- */
const view = $('#view');
let bgHash = null;
function parseHash() {
  const h = decodeURI(location.hash.slice(1) || '/');
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean), q: new URLSearchParams(qs || '') };
}
function route() {
  const { parts, q } = parseHash();
  if (parts[0] === 'read') {
    const no = parts[1] === 'latest' ? LATEST?.no : +parts[1];
    const is = BY_NO.get(no) || LATEST;
    if (!is) return;
    if (bgHash == null) { renderView(['issue', String(is.no)], new URLSearchParams()); bgHash = '#/issue/' + is.no; }
    const pg = is.pages.find(x => x.p === +parts[2]) || is.pages[0];
    V.show(pg, q.get('q') || '');
    return;
  }
  const h = location.hash || '#/';
  if (V.open) { V.hide(); if (h === bgHash) return; }
  bgHash = h;
  renderView(parts, q);
}
function renderView(parts, q) {
  const r = parts[0] || 'home';
  const map = { home: renderHome, issues: renderIssues, issue: renderIssue, search: renderSearch, timeline: renderTimeline, my: renderMy, about: renderAbout };
  (map[r] || renderHome)(parts, q);
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === (r === 'issue' ? 'issues' : map[r] ? r : 'home')));
  view.classList.remove('page-enter'); void view.offsetWidth; view.classList.add('page-enter');
  reveal(view); countUp(view);
  scrollTo({ top: 0, behavior: 'instant' });
}
function rerender() { if (bgHash != null) { const { parts, q } = parseHash(); if (parts[0] !== 'read') renderView(parts, q); else { const s = location.hash; location.hash = bgHash; setTimeout(() => location.hash = s, 0); } } }
function go(h) { if (location.hash === h) route(); else location.hash = h; }
addEventListener('hashchange', route);

/* ---------- 首頁 ---------- */
function renderHome() {
  if (!LATEST) { view.innerHTML = `<div class="empty">${svg('news')}<p>${L('尚未建置刊物資料，請執行「更新網站.bat」。', 'No data yet — run 更新網站.bat.')}</p></div>`; return; }
  const first = ISSUES[0];
  const yrs = YEARS.length ? `${YEARS[0]}–${YEARS[YEARS.length - 1]}` : '';
  const tick = ISSUES.slice(-10).reverse().flatMap(is => is.pages.slice(0, 4).flatMap(p => p.heads.slice(0, 1).map(h => ({ h, p })))).slice(0, 24);
  const tickHtml = tick.map(({ h, p }) => `<a href="#/read/${p.no}/${p.p}"><small>${issueName(p.no)}</small>${esc(h)}</a>`).join('');
  const hot = HOT.map(w => ({ w, n: doSearch(w).hits.length })).filter(x => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 22);
  const maxN = Math.max(1, ...hot.map(x => x.n));
  view.innerHTML = `
  <section class="hero">
    <svg class="hero-branch" viewBox="0 0 400 300" aria-hidden="true">
      <path d="M400 20 C330 40 300 70 250 90 S170 120 120 170 S60 240 30 290" stroke="#6b4a3a" stroke-width="7" fill="none" stroke-linecap="round"/>
      <path d="M300 62 C300 30 320 15 345 5 M220 104 C215 150 240 175 262 190 M150 145 C120 130 95 100 90 70" stroke="#6b4a3a" stroke-width="4" fill="none" stroke-linecap="round"/>
      ${[[345, 8, 16], [300, 62, 20], [262, 190, 18], [220, 104, 15], [150, 145, 19], [90, 70, 16], [120, 170, 14], [60, 235, 16], [380, 26, 12], [240, 96, 11]].map(([x, y, r], i) => `<g transform="translate(${x} ${y})"><use href="#i-plum" x="${-r}" y="${-r}" width="${r * 2}" height="${r * 2}" style="color:${['#f21921', '#ff6f91', '#e8457a'][i % 3]}"/></g>`).join('')}
    </svg>
    <div>
      <span class="hero-kicker"><img src="assets/badge.jpg" alt="">${L('楊梅高中 校園刊物數位典藏', 'Yangmei Senior High School · Digital Archive')}</span>
      <div class="hero-logo-wrap"><img class="hero-logo" src="assets/logo.png" alt="梅岡風"></div>
      <h1>楊梅高中梅岡風</h1>
      <p class="lead">${L(`收錄第 ${first.no} 期至第 ${LATEST.no} 期、共 ${PAGES.length} 個版面。逐期翻閱、全文檢索，重溫校園裡每一陣梅岡之風。`, `Issues ${first.no}–${LATEST.no}, ${PAGES.length} pages. Browse issue by issue or search every word.`)}</p>
      <div class="hero-cta">
        <a class="btn primary" href="#/read/${LATEST.no}/1">${svg('book')}${L('閱讀最新一期', 'Read latest issue')}</a>
        <a class="btn red" href="#/search">${svg('search')}${L('開始檢索', 'Search')}</a>
        <button class="btn gold" data-random>${svg('dice')}${L('隨機翻一版', 'Random page')}</button>
      </div>
    </div>
    <div class="hero-cover">
      <div class="cover-stack" id="coverStack" data-read="${LATEST.no}/1">
        <span class="cover-tag">${issueName(LATEST.no)}</span>
        ${LATEST.pages[2] ? `<img class="back2" src="${thumb(LATEST.pages[2])}" alt="">` : ''}
        ${LATEST.pages[1] ? `<img class="back" src="${thumb(LATEST.pages[1])}" alt="">` : ''}
        <img src="${thumb(LATEST.pages[0])}" alt="${esc(issueName(LATEST.no))}${esc(pageName(1))}">
      </div>
    </div>
  </section>
  <div class="stats">
    <div class="stat"><b data-count="${ISSUES.length}">0</b><span>${L('收錄期數', 'Issues')}</span>${svg('book')}</div>
    <div class="stat"><b data-count="${PAGES.length}">0</b><span>${L('典藏版面', 'Pages')}</span>${svg('news')}</div>
    <div class="stat"><b>${yrs || issueName(LATEST.no)}</b><span>${L('出刊年份', 'Years covered')}</span>${svg('time')}</div>
    <div class="stat"><b data-count="${(TOTAL_CHARS / 10000).toFixed(1)}" data-dec="1">0</b><span>${L('萬字可全文檢索', '×10k characters searchable')}</span>${svg('search')}</div>
  </div>
  ${tick.length ? `<div class="ticker"><span class="ticker-label">${svg('news')}${L('梅岡要聞', 'Headlines')}</span><div class="ticker-track">${tickHtml}${tickHtml}</div></div>` : ''}
  ${plumTitle(L('最新一期', 'Latest issue'), `<small>${issueName(LATEST.no)} · ${esc(dateText(LATEST))}</small>`)}
  <div class="home-grid">
    <div class="card latest-pages">${LATEST.pages.slice(0, 4).map(p => `<button class="page-card card" data-read="${p.no}/${p.p}" style="box-shadow:none"><div class="thumb"><img src="${thumb(p)}" alt=""><span class="pno">${pageName(p.p)}</span></div><div class="body"><div class="sec">${esc(p.sec || pageName(p.p))}</div></div></button>`).join('')}</div>
    <div class="card lucky">
      <h3>${L('今天讀哪一版？', 'Feeling lucky?')}</h3>
      <p class="muted" style="margin:0">${L('擲骰子，從歷年刊物中隨機抽出一個版面！', 'Roll the dice to open a random page from the archive!')}</p>
      <svg class="lucky-dice" id="luckyDice" role="button" tabindex="0" aria-label="${L('擲骰子', 'Roll')}"><use href="#i-dice"/></svg>
      <div class="lucky-result" id="luckyResult"></div>
    </div>
  </div>
  ${hot.length ? `${plumTitle(L('熱門關鍵字', 'Popular keywords'), `<small>${L('點一下立即檢索', 'Tap to search')}</small>`)}
  <div class="chips">${hot.map(x => `<a class="chip" href="#/search?q=${encodeURIComponent(x.w)}" style="font-size:${(.85 + x.n / maxN * .5).toFixed(2)}rem">${esc(x.w)}<span class="n">${x.n}</span></a>`).join('')}</div>` : ''}
  ${plumTitle(L('近期刊物', 'Recent issues'), `<small><a href="#/issues">${L('看全部 →', 'All issues →')}</a></small>`)}
  <div class="issue-grid">${ISSUES.slice(-8).reverse().map(issueCard).join('')}</div>`;
  const cs = $('#coverStack');
  cs.addEventListener('mousemove', e => { const r = cs.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; cs.style.transform = `rotateY(${x * 18}deg) rotateX(${-y * 14}deg)`; });
  cs.addEventListener('mouseleave', () => cs.style.transform = '');
  const dice = $('#luckyDice');
  const roll = () => {
    dice.classList.remove('roll'); void dice.getBoundingClientRect(); dice.classList.add('roll'); sfx('dice');
    stats.dice++; store.set('stats', stats); checkBadges();
    const p = PAGES[Math.floor(Math.random() * PAGES.length)];
    setTimeout(() => {
      $('#luckyResult').innerHTML = `<p style="margin:4px 0"><b>${issueName(p.no)} ${pageName(p.p)}</b> · ${esc(p.sec || '')}<br><span class="muted">${esc(p.heads[0] || '')}</span></p><a class="btn primary" href="#/read/${p.no}/${p.p}">${svg('book')}${L('打開這一版', 'Open it')}</a>`;
    }, 700);
  };
  dice.addEventListener('click', roll); dice.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); roll(); } });
}

/* ---------- 期刊瀏覽 ---------- */
let browse = store.get('browse', { year: 0, sort: 'new', mode: 'grid' });
function renderIssues() {
  let list = ISSUES.filter(is => !browse.year || is.year === browse.year);
  list = browse.sort === 'new' ? list.slice().reverse() : list;
  const yearChips = [`<button class="chip ${!browse.year ? 'on' : ''}" data-year="0">${L('全部', 'All')}<span class="n">${ISSUES.length}</span></button>`]
    .concat(YEARS.map(y => `<button class="chip ${browse.year === y ? 'on' : ''}" data-year="${y}">${y}<span class="n">${ISSUES.filter(i => i.year === y).length}</span></button>`));
  if (ISSUES.some(i => !i.year)) yearChips.push(`<button class="chip ${browse.year === -1 ? 'on' : ''}" data-year="-1">${L('未標示', 'Undated')}</button>`);
  if (browse.year === -1) list = (browse.sort === 'new' ? ISSUES.slice().reverse() : ISSUES).filter(i => !i.year);
  view.innerHTML = `
  ${plumTitle(L('期刊瀏覽', 'Browse issues'), `<small>${L(`共 ${ISSUES.length} 期 · ${PAGES.length} 版`, `${ISSUES.length} issues · ${PAGES.length} pages`)}</small>`)}
  <div class="chips">${yearChips.join('')}</div>
  <div class="toolbar">
    <div class="seg-inline" id="sortSeg"><button data-sort="new" class="${browse.sort === 'new' ? 'on' : ''}">${svg('sort')}${L('新到舊', 'Newest')}</button><button data-sort="old" class="${browse.sort === 'old' ? 'on' : ''}">${L('舊到新', 'Oldest')}</button></div>
    <div class="seg-inline" id="modeSeg"><button data-mode="grid" class="${browse.mode === 'grid' ? 'on' : ''}" title="${L('卡片', 'Grid')}">${svg('grid')}</button><button data-mode="list" class="${browse.mode === 'list' ? 'on' : ''}" title="${L('清單', 'List')}">${svg('list')}</button></div>
    <span class="spacer"></span>
    <form id="jumpForm" class="seg-inline" style="padding:4px 4px 4px 14px;align-items:center;gap:6px"><label for="jumpNo" style="font-weight:700;color:var(--purple-d)">${L('跳到第', 'Go to')}</label>
      <input id="jumpNo" type="number" min="${ISSUES[0]?.no}" max="${LATEST?.no}" style="width:70px;font:inherit;border:0;border-radius:999px;padding:4px 10px" placeholder="${LATEST?.no}"><span>${L('期', '')}</span><button class="on">${svg('right')}</button></form>
  </div>
  ${list.length ? (browse.mode === 'grid' ? `<div class="issue-grid">${list.map(issueCard).join('')}</div>` : `<div class="issue-list">${list.map(issueRow).join('')}</div>`) : `<div class="empty">${svg('news')}<p>${L('沒有符合的期別', 'No issues')}</p></div>`}`;
  $$('[data-year]').forEach(b => b.onclick = () => { browse.year = +b.dataset.year; store.set('browse', browse); sfx('click'); renderView(['issues']); });
  $$('#sortSeg button').forEach(b => b.onclick = () => { browse.sort = b.dataset.sort; store.set('browse', browse); sfx('click'); renderView(['issues']); });
  $$('#modeSeg button').forEach(b => b.onclick = () => { browse.mode = b.dataset.mode; store.set('browse', browse); sfx('click'); renderView(['issues']); });
  $('#jumpForm').onsubmit = e => { e.preventDefault(); const n = +$('#jumpNo').value; if (BY_NO.has(n)) { sfx('nav'); go('#/issue/' + n); } else { sfx('none'); toast(L('查無此期', 'Issue not found')); } };
}

/* ---------- 單期頁 ---------- */
function renderIssue(parts) {
  const is = BY_NO.get(+parts[1]);
  if (!is) { view.innerHTML = `<div class="empty">${svg('news')}<p>${L('查無此期', 'Issue not found')}</p><a class="btn primary" href="#/issues">${L('回期刊瀏覽', 'Back')}</a></div>`; return; }
  const i = ISSUES.indexOf(is), prev = ISSUES[i - 1], next = ISSUES[i + 1];
  const read = is.pages.filter(p => seen[p.k]).length;
  view.innerHTML = `
  <div class="issue-head" style="border-left:10px solid ${issueColor(is.no)}">
    <div class="big-no"><small>${L('第', 'No.')}</small>${is.no}<small>${L('期', '')}</small></div>
    <div><h1>楊梅高中梅岡風 · ${issueName(is.no)}</h1>
      <div class="chips" style="margin-top:4px"><span class="pill p">${esc(dateText(is))}</span><span class="pill t">${L(`共 ${is.pages.length} 版`, `${is.pages.length} pages`)}</span><span class="pill g">${L(`已讀 ${read}/${is.pages.length}`, `Read ${read}/${is.pages.length}`)}</span>${is.title ? `<span class="pill r">${esc(is.title)}</span>` : ''}</div>
      ${is.note ? `<p class="muted" style="margin:6px 0 0">${esc(is.note)}</p>` : ''}</div>
    <div class="nav2">
      ${prev ? `<a class="btn ghost" href="#/issue/${prev.no}">${svg('left')}${issueName(prev.no)}</a>` : ''}
      <a class="btn primary" href="#/read/${is.no}/1">${svg('book')}${L('開始閱讀', 'Read')}</a>
      ${next ? `<a class="btn ghost" href="#/issue/${next.no}">${issueName(next.no)}${svg('right')}</a>` : ''}
    </div>
  </div>
  <div class="page-grid">${is.pages.map(p => pageCard(p)).join('')}</div>`;
}

/* ---------- 全文檢索 ---------- */
let searchLimit = 20;
function renderSearch(parts, q) {
  const qq = q.get('q') || '';
  const opt = { from: +q.get('from') || 0, to: +q.get('to') || 0, year: +q.get('year') || 0, page: +q.get('page') || 0, scope: q.get('scope') || 'all', sort: q.get('sort') || 'rel' };
  const { terms, hits } = doSearch(qq, opt);
  const issueOpts = sel => ISSUES.map(i => `<option value="${i.no}" ${sel === i.no ? 'selected' : ''}>${issueName(i.no)}</option>`).join('');
  const maxPage = Math.max(4, ...PAGES.map(p => p.p));
  view.innerHTML = `
  <section class="search-hero">
    <svg class="plumbg"><use href="#i-plum"/></svg>
    <h1>${svg('search')}${L('全文檢索', 'Full-text search')}</h1>
    <form class="search-box" id="sForm"><svg><use href="#i-search"/></svg>
      <input id="sInput" type="search" value="${esc(qq)}" placeholder="${L('輸入關鍵字，多個關鍵字以空白分隔（例：繁星 榜單）', 'Keywords, separated by spaces')}" autocomplete="off">
      <button class="btn primary">${L('搜尋', 'Search')}</button></form>
    <div class="filters">
      <label>${L('期別', 'Issues')} <select id="fFrom"><option value="">${L('最早', 'First')}</option>${issueOpts(opt.from)}</select> ～ <select id="fTo"><option value="">${L('最新', 'Latest')}</option>${issueOpts(opt.to)}</select></label>
      <label>${L('年份', 'Year')} <select id="fYear"><option value="">${L('全部', 'All')}</option>${YEARS.map(y => `<option ${opt.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
      <label>${L('版次', 'Page')} <select id="fPage"><option value="">${L('全部', 'All')}</option>${[1, 2, 3, 4].map(n => `<option value="${n}" ${opt.page === n ? 'selected' : ''}>${pageName(n)}</option>`).join('')}${maxPage > 4 ? `<option value="5" ${opt.page === 5 ? 'selected' : ''}>${L('第5版以後', 'Page 5+')}</option>` : ''}</select></label>
      <label>${L('範圍', 'Scope')} <select id="fScope"><option value="all">${L('全文', 'Full text')}</option><option value="head" ${opt.scope === 'head' ? 'selected' : ''}>${L('僅標題', 'Headlines only')}</option></select></label>
      <label>${L('排序', 'Sort')} <select id="fSort"><option value="rel">${L('相關度', 'Relevance')}</option><option value="new" ${opt.sort === 'new' ? 'selected' : ''}>${L('新到舊', 'Newest')}</option><option value="old" ${opt.sort === 'old' ? 'selected' : ''}>${L('舊到新', 'Oldest')}</option></select></label>
    </div>
    <div class="hot chips">${(history_.length ? history_.slice(0, 6).map(h => `<a class="chip" href="#/search?q=${encodeURIComponent(h)}">🕘 ${esc(h)}</a>`) : []).concat(HOT.slice(0, 10).map(w => `<a class="chip" href="#/search?q=${encodeURIComponent(w)}">${esc(w)}</a>`)).join('')}</div>
  </section>
  <div id="sRes"></div>`;
  const input = $('#sInput');
  const submit = () => {
    const p = new URLSearchParams();
    const v = input.value.trim(); if (v) p.set('q', v);
    [['from', 'fFrom'], ['to', 'fTo'], ['year', 'fYear'], ['page', 'fPage']].forEach(([k, id]) => { const x = $('#' + id).value; if (x) p.set(k, x); });
    if ($('#fScope').value !== 'all') p.set('scope', $('#fScope').value);
    if ($('#fSort').value !== 'rel') p.set('sort', $('#fSort').value);
    searchLimit = 20; go('#/search?' + p.toString());
  };
  $('#sForm').onsubmit = e => { e.preventDefault(); submit(); };
  $$('.filters select').forEach(s => s.onchange = submit);
  if (!qq) { input.focus(); $('#sRes').innerHTML = `<div class="empty">${svg('search')}<p>${L('輸入關鍵字，搜尋所有版面上的文字、標題與版名。', 'Type a keyword to search every page.')}</p></div>`; return; }
  // 記錄
  history_ = [qq].concat(history_.filter(h => h !== qq)).slice(0, 12); store.set('history', history_);
  stats.searches++; store.set('stats', stats); checkBadges();
  sfx(hits.length ? 'search' : 'none');
  const byIssue = new Map(ISSUES.map(i => [i.no, 0])); hits.forEach(h => byIssue.set(h.p.no, byIssue.get(h.p.no) + 1));
  const maxB = Math.max(1, ...byIssue.values());
  const qEnc = encodeURIComponent(qq);
  const draw = () => {
    $('#sRes').innerHTML = `
    <div class="result-sum">${L('找到', 'Found')} <b>${hits.length}</b> ${L('個版面含有', 'pages containing')} ${terms.map(t => `<span class="pill r">${esc(t.raw)}</span>`).join(' ')}
      ${hits.length ? `<span class="muted">· ${L(`分布於 ${new Set(hits.map(h => h.p.no)).size} 期`, `across ${new Set(hits.map(h => h.p.no)).size} issues`)}</span>` : ''}</div>
    ${hits.length ? `<div class="card"><div class="bar-chart">${ISSUES.map(i => { const n = byIssue.get(i.no); return `<div class="b ${n ? '' : 'zero'}" style="height:${n ? 12 + n / maxB * 88 : 4}%" title="${issueName(i.no)}：${n}" data-bar="${i.no}"></div>`; }).join('')}</div>
      <div class="bar-axis">${ISSUES.map((i, k) => `<span>${k % Math.ceil(ISSUES.length / 12) === 0 ? i.no : ''}</span>`).join('')}</div></div>` : `<div class="empty">${svg('news')}<p>${L('找不到符合的版面，試試其他關鍵字或放寬篩選條件。', 'No match. Try other keywords.')}</p><p class="muted" style="font-size:.9rem">${L('提示：文字為電腦辨識，少數字可能辨識錯誤，可改用較短的關鍵字。', 'Tip: OCR text may contain errors; try shorter keywords.')}</p></div>`}
    <div class="results">${hits.slice(0, searchLimit).map(({ p }) => `
      <button class="result card" data-read="${p.no}/${p.p}" data-q="${esc(qq)}">
        <img loading="lazy" src="${thumb(p)}" alt="">
        <div><h3><span class="pill p">${issueName(p.no)}</span><span class="pill r">${pageName(p.p)}</span>${p.sec ? `<span class="pill t">${esc(p.sec)}</span>` : ''}<span class="muted" style="font-size:.85rem">${esc(dateText(p.issue))}</span></h3>
          ${p.heads[0] ? `<div style="font-weight:800">${highlight(p.heads[0], terms)}</div>` : ''}
          ${snippets(p, terms).map(s => `<p class="snip">${highlight(s, terms)}</p>`).join('')}</div>
      </button>`).join('')}</div>
    ${hits.length > searchLimit ? `<div class="more-wrap"><button class="btn primary" id="moreBtn">${L(`顯示更多（尚有 ${hits.length - searchLimit} 筆）`, `Show more (${hits.length - searchLimit})`)}</button></div>` : ''}`;
    $('#moreBtn')?.addEventListener('click', () => { searchLimit += 20; sfx('pop'); const y = scrollY; draw(); scrollTo(0, y); });
    $$('[data-bar]').forEach(b => b.onclick = () => { const n = b.dataset.bar; if (byIssue.get(+n)) { sfx('click'); go(`#/search?q=${qEnc}&from=${n}&to=${n}`); } });
  };
  draw();
}

/* ---------- 時光軸 ---------- */
function renderTimeline() {
  stats.timeline++; store.set('stats', stats); checkBadges();
  const groups = new Map();
  ISSUES.forEach(is => { const y = is.year || 0; if (!groups.has(y)) groups.set(y, []); groups.get(y).push(is); });
  const keys = [...groups.keys()].sort((a, b) => (a || 1e9) - (b || 1e9));
  view.innerHTML = `
  ${plumTitle(L('梅岡風時光軸', 'Timeline'), `<small>${L('依出刊年月排列', 'By publication date')}</small>`)}
  <div class="chips">${keys.map(y => `<a class="chip" href="javascript:void 0" data-jump="${y}">${y || L('未標示', 'Undated')}</a>`).join('')}</div>
  <div class="timeline">${keys.map(y => `<div class="tl-year" id="y${y}"><span>${y || L('未標示日期', 'Undated')}</span></div>${groups.get(y).map(is => `
    <div class="tl-item reveal"><a class="tl-card card" href="#/issue/${is.no}">
      <img loading="lazy" src="${thumb(is.pages[0])}" alt="">
      <div><h3>${issueName(is.no)}</h3><span class="pill p">${esc(dateText(is))}</span>
      <p>${esc(is.pages.flatMap(p => p.heads).slice(0, 3).join('、'))}</p></div></a></div>`).join('')}`).join('')}</div>`;
  $$('[data-jump]').forEach(a => a.onclick = () => { sfx('click'); $('#y' + a.dataset.jump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

/* ---------- 我的梅岡 ---------- */
function renderMy() {
  const n = seenCount(), pct = PAGES.length ? n / PAGES.length * 100 : 0;
  const recent = PAGES.filter(p => seen[p.k]).sort((a, b) => seen[b.k] - seen[a.k]).slice(0, 8);
  const favPages = favs.map(k => PAGES.find(p => p.k === k)).filter(Boolean);
  const fullIssues = ISSUES.filter(is => is.pages.every(p => seen[p.k])).length;
  view.innerHTML = `
  ${plumTitle(L('我的梅岡', 'My Shelf'))}
  <div class="my-top">
    <div class="card meter"><h3 style="margin:0">${L('閱讀足跡', 'Reading progress')}</h3>
      <div class="meter-bar"><i id="meterFill" style="width:0"></i></div>
      <p style="margin:0">${L(`已閱讀 <b>${n}</b> / ${PAGES.length} 個版面（${pct.toFixed(1)}%），讀完 <b>${fullIssues}</b> 期。`, `Read <b>${n}</b> / ${PAGES.length} pages (${pct.toFixed(1)}%), ${fullIssues} full issues.`)}</p>
      <p class="muted" style="margin:6px 0 0;font-size:.9rem">${L(`檢索 ${stats.searches} 次 · 收藏 ${favs.length} 版 · 隨機翻閱 ${stats.dice} 次`, `${stats.searches} searches · ${favs.length} saved · ${stats.dice} random`)}</p></div>
    <div class="card meter" style="background:linear-gradient(135deg,var(--mint),var(--ice))"><h3 style="margin:0">${L('成就徽章', 'Badges')} <span class="pill g">${got.length}/${BADGES.length}</span></h3>
      <p class="muted" style="margin:6px 0 10px">${L('翻閱、檢索、收藏都能解鎖徽章，看看你能收集幾個！', 'Unlock badges by reading, searching and saving.')}</p>
      <button class="btn ghost" id="clearData">${L('清除我的紀錄', 'Clear my data')}</button></div>
  </div>
  <div class="badges" style="margin-top:18px">${BADGES.map(b => `<div class="badge ${got.includes(b.id) ? 'got' : ''}"><span class="ic">${b.ic}</span><b>${L(b.zh, b.en)}</b><small>${L(b.dz, b.de)}</small></div>`).join('')}</div>
  ${plumTitle(L('我的收藏', 'Saved pages'), `<small>${favPages.length}</small>`)}
  ${favPages.length ? `<div class="fav-grid">${favPages.map(p => pageCard(p, true)).join('')}</div>` : `<div class="empty">${svg('heart-o')}<p>${L('在閱讀器按下 ♡ 即可收藏喜歡的版面。', 'Tap ♡ in the reader to save pages.')}</p></div>`}
  ${plumTitle(L('最近閱讀', 'Recently read'))}
  ${recent.length ? `<div class="fav-grid">${recent.map(p => pageCard(p, true)).join('')}</div>` : `<div class="empty">${svg('book')}<p>${L('還沒有閱讀紀錄，快去翻翻看吧！', 'Nothing yet — start reading!')}</p><a class="btn primary" href="#/issues">${L('去瀏覽', 'Browse')}</a></div>`}`;
  requestAnimationFrame(() => setTimeout(() => $('#meterFill') && ($('#meterFill').style.width = pct + '%'), 60));
  $('#clearData').onclick = () => {
    if (!confirm(L('確定要清除閱讀足跡、收藏、成就與檢索紀錄嗎？', 'Clear all your reading data?'))) return;
    Object.keys(seen).forEach(k => delete seen[k]); favs = []; got = []; history_ = []; Object.assign(stats, { searches: 0, dice: 0, timeline: 0, hd: 0 });
    ['seen', 'favs', 'badges', 'history', 'stats'].forEach(k => store.set(k, k === 'seen' || k === 'stats' ? (k === 'seen' ? {} : stats) : []));
    sfx('close'); toast(L('已清除', 'Cleared')); renderView(['my']);
  };
}

/* ---------- 關於 ---------- */
function renderAbout() {
  view.innerHTML = `
  <div class="about">
    <div class="card about-hero"><img class="b" src="assets/badge.jpg" alt="楊梅高中校徽"><img class="l" src="assets/logo.png" alt="梅岡風">
      <div style="flex:1;min-width:220px"><h2 style="margin:0">楊梅高中梅岡風</h2><p style="margin:6px 0 0">${L('「梅岡風」是楊梅高中的校園刊物，記錄學校要聞、師生榮譽與校園活動。本網站將歷期刊物數位化典藏，方便師生、家長與校友隨時翻閱與檢索。', 'Mei-Gang Feng is the school newspaper of Yangmei Senior High School. This site archives every issue for browsing and searching.')}</p></div></div>
    <div class="card"><h2>${svg('book')}${L('使用說明', 'How to use')}</h2><ul>
      <li>${L('「期刊瀏覽」可依年份篩選、切換排序與卡片／清單檢視。', 'Browse issues by year, sort, and switch grid/list view.')}</li>
      <li>${L('「全文檢索」可搜尋所有版面文字，支援多關鍵字、期別、年份、版次篩選；結果會在版面上以黃色框標出位置。', 'Search all page text with filters; matches are highlighted on the page.')}</li>
      <li>${L('閱讀器：滑鼠滾輪或雙指縮放、拖曳移動、雙擊放大；按「HD」載入高解析原圖。', 'Reader: wheel/pinch to zoom, drag to pan, double-click to zoom, HD for the original.')}</li>
      <li>${L('快捷鍵', 'Shortcuts')}：<kbd>←</kbd><kbd>→</kbd> ${L('換版', 'page')}、<kbd>+</kbd><kbd>−</kbd> ${L('縮放', 'zoom')}、<kbd>0</kbd> ${L('整版', 'fit')}、<kbd>T</kbd> ${L('文字', 'text')}、<kbd>F</kbd> ${L('收藏', 'save')}、<kbd>Esc</kbd> ${L('關閉', 'close')}、<kbd>/</kbd> ${L('搜尋', 'search')}</li>
      <li>${L('右上角 ⚙️ 可調整全螢幕、音效、裝置、版面方向、語言、字體大小與主題。', 'Use ⚙️ for fullscreen, sound, device, orientation, language, font size and theme.')}</li></ul></div>
    <div class="card"><h2>${svg('plus')}${L('如何新增期別', 'Adding new issues')}</h2><ol>
      <li>${L('將新一期的版面圖片放進「梅岡風」資料夾，檔名格式：', 'Put the new page images in the 梅岡風 folder, named like')} <code>梅岡風45期第1版.JPG</code></li>
      <li>${L('雙擊網站資料夾中的', 'Double-click')} <code>更新網站.bat</code>${L('，程式會自動產生網頁圖片、辨識文字並更新資料。', ' to build images, OCR text and data.')}</li>
      <li>${L('如需補充出刊日期或主題，可編輯', 'Optionally edit')} <code>data/meta.json</code>${L('後再執行一次。', ' and run it again.')}</li>
      <li>${L('重新整理網頁，新的一期就會出現在各個頁面。', 'Reload the page to see the new issue.')}</li></ol></div>
    <div class="card"><h2>${svg('info')}${L('資料說明', 'About the data')}</h2><ul>
      <li>${L(`目前收錄 ${ISSUES.length} 期、${PAGES.length} 個版面（第 ${ISSUES[0]?.no ?? '-'}～${LATEST?.no ?? '-'} 期）。`, `${ISSUES.length} issues, ${PAGES.length} pages.`)}</li>
      <li>${L('版面文字由 Windows 內建繁體中文 OCR 自動辨識，僅供檢索參考，內容以原版面為準。', 'Page text comes from Windows OCR and is for search only.')}</li>
      <li>${L('資料更新時間', 'Data built')}：${esc(DATA.generated || '-')}</li>
      <li>${L('閱讀足跡、收藏與成就僅儲存在您的瀏覽器中。', 'Your progress is stored only in this browser.')}</li></ul></div>
  </div>`;
}

/* ---------- 閱讀器 ---------- */
const V = {
  open: false, p: null, s: 1, x: 0, y: 0, fitS: 1, terms: [], hires: false, sideOpen: false,
  el: $('#viewer'), stage: $('#vStage'), canvas: $('#vCanvas'), img: $('#vImg'),
  show(p, q) {
    const was = this.open, dir = was && this.p ? (p.idx > this.p.idx ? 'next' : 'prev') : '';
    const samePage = this.p === p;
    this.p = p; this.terms = parseTerms(q); this.q = q;
    if (!was) { this.el.hidden = false; this.open = true; document.body.style.overflow = 'hidden'; petals.pause(true); sfx('open'); }
    else if (!samePage) sfx('flip');
    const is = p.issue;
    $('#vTitle').innerHTML = `<img src="assets/badge.jpg" alt="" style="width:30px;height:28px;background:#fff;border-radius:6px;padding:1px"> ${issueName(is.no)} · ${pageName(p.p)} ${p.sec ? `<span class="pill">${esc(p.sec)}</span>` : ''}<span class="pill">${esc(dateText(is))}</span>${this.terms.length ? `<span class="pill" style="background:#ffd43b;color:#3a2200">🔍 ${esc(q)}</span>` : ''}`;
    $('#vOrig').href = p.orig;
    this.canvas.style.width = p.w + 'px'; this.canvas.style.height = p.h + 'px';
    if (!samePage) {
      $('#vLoading').classList.add('on');
      this.img.onload = () => $('#vLoading').classList.remove('on');
      this.img.onerror = () => $('#vLoading').classList.remove('on');
      this.img.src = this.hires ? p.orig : webImg(p);
      if (dir) { this.canvas.classList.remove('flip-next', 'flip-prev'); void this.canvas.offsetWidth; this.canvas.classList.add('flip-' + dir); }
      this.fit(false);
    }
    this.drawMarks(); this.drawStrip(); this.drawLines(); this.updFav();
    const nx = PAGES[p.idx + 1]; if (nx) { const im = new Image(); im.src = webImg(nx); }
    markSeen(p);
    if (!was) this.hint(L('滾輪縮放 · 拖曳移動 · ← → 換版', 'Wheel to zoom · drag to pan · ← → to turn'));
    else if (this.terms.length && this.hits().length) this.hint(L(`本版找到 ${this.hits().length} 處`, `${this.hits().length} matches`));
    if (this.terms.length && this.hits().length && !samePage) setTimeout(() => this.focusBox(this.hits()[0], false), 350);
  },
  hide() { if (!this.open) return; this.open = false; this.el.hidden = true; document.body.style.overflow = ''; petals.pause(false); sfx('close'); this.p = null; },
  close() { if (bgHash) { location.hash = bgHash; } else location.hash = '#/'; },
  goto(p) { if (!p) { sfx('none'); this.hint(L('已經是最後／第一版了', 'No more pages')); return; } history.replaceState(null, '', `#/read/${p.no}/${p.p}${this.q ? '?q=' + encodeURIComponent(this.q) : ''}`); this.show(p, this.q); },
  stageRect() { return this.stage.getBoundingClientRect(); },
  apply(anim) {
    this.canvas.classList.toggle('anim', !!anim);
    this.canvas.style.transform = `translate(${this.x}px,${this.y}px) scale(${this.s})`;
    $('#vZoom').textContent = Math.round(this.s / this.fitS * 100) + '%';
  },
  fit(anim = true, mode = 'page') {
    if (!this.p) return;
    const r = this.stageRect(), pad = r.width < 600 ? 8 : 30;
    const sw = (r.width - pad * 2) / this.p.w, sh = (r.height - pad * 2) / this.p.h;
    this.fitS = Math.min(sw, sh);
    this.s = mode === 'width' ? sw : this.fitS;
    this.x = (r.width - this.p.w * this.s) / 2;
    this.y = mode === 'width' ? pad : (r.height - this.p.h * this.s) / 2;
    this.apply(anim);
  },
  zoomAt(f, cx, cy, anim) {
    const r = this.stageRect(); cx ??= r.width / 2; cy ??= r.height / 2;
    const ns = clamp(this.s * f, this.fitS * .6, Math.max(this.fitS * 12, 2.5));
    this.x = cx - (cx - this.x) * (ns / this.s); this.y = cy - (cy - this.y) * (ns / this.s); this.s = ns;
    this.apply(anim);
  },
  hits() {
    if (!this.p) return [];
    const find = norm($('#vFind').value);
    return this.p.L.filter(l => { const n = norm(l[0]); return this.terms.some(t => n.includes(t.n)) || (find && n.includes(find)); });
  },
  drawMarks(focus) {
    $('#vMarks').innerHTML = this.hits().map(l => `<i class="${l === focus ? 'focus' : ''}" style="left:${l[1] / 10 - .3}%;top:${l[2] / 10 - .2}%;width:${(l[3] - l[1]) / 10 + .6}%;height:${(l[4] - l[2]) / 10 + .4}%"></i>`).join('')
      + (focus && !this.hits().includes(focus) ? `<i class="focus" style="left:${focus[1] / 10 - .3}%;top:${focus[2] / 10 - .2}%;width:${(focus[3] - focus[1]) / 10 + .6}%;height:${(focus[4] - focus[2]) / 10 + .4}%"></i>` : '');
  },
  focusBox(l, sound = true) {
    const r = this.stageRect();
    const bw = (l[3] - l[1]) / 1000 * this.p.w, bh = (l[4] - l[2]) / 1000 * this.p.h;
    const cx = (l[1] + l[3]) / 2000 * this.p.w, cy = (l[2] + l[4]) / 2000 * this.p.h;
    this.s = clamp(Math.min(r.width * .9 / bw, r.height * .5 / bh), this.fitS * 1.5, this.fitS * 3.2);
    this.x = r.width / 2 - cx * this.s; this.y = r.height / 2 - cy * this.s;
    this.apply(true); this.drawMarks(l); if (sound) sfx('zoom', true);
  },
  drawStrip() {
    const is = this.p.issue, i = ISSUES.indexOf(is), prev = ISSUES[i - 1], next = ISSUES[i + 1];
    $('#vStrip').innerHTML = (prev ? `<button data-go="${prev.no}/${prev.pages[prev.pages.length - 1].p}" title="${issueName(prev.no)}"><img src="${thumb(prev.pages[0])}" alt=""><span>◀ ${prev.no}</span></button><i class="sep"></i>` : '')
      + is.pages.map(p => `<button data-go="${p.no}/${p.p}" class="${p === this.p ? 'on' : ''}" title="${pageName(p.p)}"><img src="${thumb(p)}" alt=""><span>${p.p}</span></button>`).join('')
      + (next ? `<i class="sep"></i><button data-go="${next.no}/1" title="${issueName(next.no)}"><img src="${thumb(next.pages[0])}" alt=""><span>${next.no} ▶</span></button>` : '');
    $('#vStrip .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  },
  drawLines() {
    if (!this.sideOpen) return;
    const hs = new Set(this.p.heads), hits = new Set(this.hits());
    const terms = this.terms.concat($('#vFind').value.trim() ? parseTerms($('#vFind').value) : []);
    $('#vLines').innerHTML = this.p.L.length ? this.p.L.map((l, i) => `<div data-line="${i}" class="${hs.has(l[0].replace(/^[\W_]+|[\W_]+$/g, '')) ? 'h' : ''} ${hits.has(l) ? 'hit' : ''}">${highlight(l[0], terms)}</div>`).join('') : `<p class="v-side-note">${L('本版尚無辨識文字', 'No text')}</p>`;
  },
  updFav() { const on = favs.includes(this.p.k); const b = $('.vbtn[data-act="fav"]'); b.classList.toggle('on', on); b.innerHTML = svg(on ? 'heart' : 'heart-o'); },
  hint(t) { const h = $('#vHint'); h.textContent = t; h.classList.add('on'); clearTimeout(this._ht); this._ht = setTimeout(() => h.classList.remove('on'), 2200); },
  act(a) {
    const p = this.p;
    switch (a) {
      case 'close': this.close(); break;
      case 'prev': this.goto(PAGES[p.idx - 1]); break;
      case 'next': this.goto(PAGES[p.idx + 1]); break;
      case 'zoomin': this.zoomAt(1.35, null, null, true); sfx('zoom', true); break;
      case 'zoomout': this.zoomAt(1 / 1.35, null, null, true); sfx('zoom', false); break;
      case 'fit': this.fit(true); sfx('click'); break;
      case 'width': this.fit(true, 'width'); sfx('click'); break;
      case 'text': this.sideOpen = !this.sideOpen; $('#vSide').hidden = !this.sideOpen; $('.vbtn[data-act="text"]').classList.toggle('on', this.sideOpen); this.drawLines(); sfx('pop'); setTimeout(() => this.fit(true), 20); break;
      case 'fav': toggleFav(p.k); this.updFav(); break;
      case 'hires': this.hires = !this.hires; $('.vbtn[data-act="hires"]').classList.toggle('on', this.hires); $('#vLoading').classList.add('on'); this.img.src = this.hires ? p.orig : webImg(p);
        if (this.hires) { stats.hd++; store.set('stats', stats); checkBadges(); this.hint(L('載入高解析原圖中…（檔案較大）', 'Loading original…')); } sfx('click'); break;
      case 'copy': { const url = location.href; (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast('🔗 ' + L('已複製本版連結', 'Link copied')), () => prompt(L('複製連結', 'Copy link'), url)); sfx('pop'); break; }
    }
  }
};
$('#viewer').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (b) { V.act(b.dataset.act); return; }
  const g = e.target.closest('[data-go]'); if (g) { const [n, p] = g.dataset.go.split('/').map(Number); V.goto(BY_NO.get(n).pages.find(x => x.p === p)); return; }
  const ln = e.target.closest('[data-line]'); if (ln) { V.focusBox(V.p.L[+ln.dataset.line]); }
});
$('#vFind').addEventListener('input', () => { V.drawMarks(); V.drawLines(); });
// 拖曳、縮放、滑動換頁
(() => {
  const st = V.stage, pts = new Map();
  let start = null, pinch = null, moved = false;
  st.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    st.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pts.size === 1) start = { x: e.clientX, y: e.clientY, ox: V.x, oy: V.y, t: Date.now() };
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: V.s }; }
    st.classList.add('grabbing');
  });
  st.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = V.stageRect();
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      V.zoomAt((pinch.s * d / pinch.d) / V.s, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); moved = true;
    } else if (start) {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      V.x = start.ox + dx; V.y = start.oy + dy; V.apply(false);
    }
  });
  const end = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (!pts.size) {
      st.classList.remove('grabbing');
      if (start && V.s <= V.fitS * 1.05) {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - start.t < 800) { V.act(dx < 0 ? 'next' : 'prev'); start = null; return; }
        if (moved) V.fit(true);
      }
      start = null;
    }
  };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  st.addEventListener('wheel', e => { e.preventDefault(); const r = V.stageRect(); V.zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0018)), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  st.addEventListener('dblclick', e => {
    if (e.target.closest('button')) return;
    const r = V.stageRect();
    if (V.s > V.fitS * 1.6) { V.fit(true); sfx('zoom', false); } else { V.zoomAt(2.6 * V.fitS / V.s, e.clientX - r.left, e.clientY - r.top, true); sfx('zoom', true); }
  });
})();

/* ---------- 全域事件 ---------- */
document.addEventListener('click', e => {
  const r = e.target.closest('[data-read]');
  if (r && !e.target.closest('#viewer')) {
    const q = r.dataset.q;
    location.hash = `#/read/${r.dataset.read}${q ? '?q=' + encodeURIComponent(q) : ''}`;
    return;
  }
  if (e.target.closest('[data-random]') || e.target.closest('#btnRandom')) { randomPage(); return; }
  const a = e.target.closest('a[href^="#"], .chip, .btn');
  if (a && !e.target.closest('#viewer')) sfx('nav');
});
function randomPage() {
  if (!PAGES.length) return;
  const p = PAGES[Math.floor(Math.random() * PAGES.length)];
  sfx('dice'); stats.dice++; store.set('stats', stats); checkBadges();
  toast(`🎲 ${issueName(p.no)} ${pageName(p.p)}`);
  setTimeout(() => location.hash = `#/read/${p.no}/${p.p}`, 350);
}
$('#quickSearch').addEventListener('submit', e => { e.preventDefault(); const v = $('#quickInput').value.trim(); searchLimit = 20; go('#/search' + (v ? '?q=' + encodeURIComponent(v) : '')); $('#quickInput').blur(); });
$('#btnSettings').addEventListener('click', () => { $('#settings').hidden = false; sfx('open'); });
$('#settings').addEventListener('click', e => {
  if (e.target.id === 'settings' || e.target.closest('[data-close]')) { $('#settings').hidden = true; sfx('close'); return; }
  const b = e.target.closest('.seg button'); if (b) setSetting(b.parentElement.dataset.set, b.dataset.v);
});
document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if (e.key === 'Escape') { if (!$('#settings').hidden) { $('#settings').hidden = true; return; } if (V.open) { if (typing) document.activeElement.blur(); else V.close(); } return; }
  if (typing) return;
  if (V.open) {
    const k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); V.act('next'); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); V.act('prev'); }
    else if (k === '+' || k === '=') V.act('zoomin');
    else if (k === '-' || k === '_') V.act('zoomout');
    else if (k === '0') V.act('fit');
    else if (k === 't' || k === 'T') V.act('text');
    else if (k === 'f' || k === 'F') V.act('fav');
    else if (k === 'ArrowUp' || k === 'ArrowDown') { V.y += k === 'ArrowUp' ? 120 : -120; V.apply(true); }
    return;
  }
  if (e.key === '/') { e.preventDefault(); if (innerWidth > 480) $('#quickInput').focus(); else go('#/search'); }
});

/* ---------- 啟動 ---------- */
$('#footerMeta').textContent = LATEST ? `${L('收錄', 'Archive')} ${issueName(ISSUES[0].no)}～${issueName(LATEST.no)} · ${PAGES.length} ${L('版', 'pages')} · ${L('更新', 'Updated')} ${DATA.generated || ''}` : '';
applySettings();
route();
})();
