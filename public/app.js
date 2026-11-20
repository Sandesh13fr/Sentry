// Sentry web client. Talks to the REST API for runs, history, verify, repeat and anchor.
// The client engine copy is used only for the instant replay animation and the in-browser repeat check.
import { simulate, canonical, sha256Hex, fingerprintOf } from './engine.client.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAX_LEN = 300;

const state = { current: null, original: null, tampered: false, health: null, matches: [] };

// ---------- API ----------
async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw Object.assign(new Error('Can’t reach the Sentry server. Check that npm start is running.'), { offline: true });
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw Object.assign(new Error(data?.error || `Server returned ${res.status}.`), { status: res.status, field: data?.field });
  return data;
}

// ---------- Formatting ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortHash = (h) => (h ? h.slice(0, 8) + '…' + h.slice(-6) : '–');
const fmtTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '–';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};
const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const SRC_LABEL = {
  openrouter: ['icon-ai-spark', 'OpenRouter'],
  local: ['icon-cpu', 'Local parser'],
  'local-fallback': ['icon-alert-triangle', 'Local fallback'],
};
const winnerText = (r) => r.winner === 'draw' ? `Draw after ${r.rounds} rounds`
  : `Fighter ${r.winner} wins ${r.koWin ? 'by KO in round ' + r.rounds : 'on points after ' + r.rounds + ' rounds'}`;
const KINDS = { aggression: ['fighter-striker', 'Striker'], speed: ['fighter-runner', 'Runner'], defence: ['fighter-tank', 'Tank'] };
function kindOf(a) {
  let top = 'aggression';
  for (const k of ['aggression', 'speed', 'defence']) if (a[k] > a[top]) top = k;
  return KINDS[top];
}

// ---------- Toast ----------
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------- Status chips ----------
function setChip(id, text, on) {
  $(id + 'Text').textContent = text;
  $(id).classList.toggle('on', on === true);
  $(id).classList.toggle('off', on === false);
}
function renderChips() {
  const h = state.health;
  if (!h) { setChip('chipEngine', 'offline', false); setChip('chipAi', 'unknown', false); setChip('chipChain', 'unknown', false); return; }
  setChip('chipEngine', h.simulationVersion, true);
  const aiDown = $('aiDown').checked, rpcDown = $('rpcDown').checked;
  if (aiDown) setChip('chipAi', 'Local fallback', false);
  else setChip('chipAi', h.aiConfigured ? 'OpenRouter' : 'Local only', h.aiConfigured ? true : undefined);
  if (rpcDown) setChip('chipChain', 'Unavailable', false);
  else setChip('chipChain', h.chainConfigured ? 'Monad' : 'Not configured', h.chainConfigured ? true : false);
  $('chipAi').title = h.aiModel ? `Model: ${h.aiModel}` : 'Rules-based parser running on the server';
}

// ---------- Composer ----------
const clean = (s) => String(s).replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim();
function validateText(text, label) {
  const v = clean(text);
  if (!v) return `${label} cannot be blank.`;
  if (v.length > MAX_LEN) return `${label} is too long (max ${MAX_LEN} characters).`;
  return '';
}
function setFieldError(inputId, errId, msg) {
  $(errId).textContent = msg || '';
  if (msg) $(inputId).setAttribute('aria-invalid', 'true'); else $(inputId).removeAttribute('aria-invalid');
}
function updateCounts() {
  for (const s of ['A', 'B']) {
    const n = clean($('strat' + s).value).length, el = $('count' + s);
    el.textContent = `${n} / ${MAX_LEN}`; el.classList.toggle('over', n > MAX_LEN);
  }
}
const randomSeed = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');

async function onSubmit(ev) {
  ev.preventDefault();
  const ea = validateText($('stratA').value, 'Fighter A strategy');
  const eb = validateText($('stratB').value, 'Fighter B strategy');
  const seed = $('seed').value.trim();
  const es = seed && !/^[A-Za-z0-9_-]{1,64}$/.test(seed) ? 'Seed can use letters, numbers, "_" and "-" only, up to 64 characters.' : '';
  setFieldError('stratA', 'errA', ea); setFieldError('stratB', 'errB', eb); setFieldError('seed', 'errSeed', es);
  $('errForm').textContent = '';
  const firstBad = ea ? 'stratA' : eb ? 'stratB' : es ? 'seed' : null;
  if (firstBad) { $(firstBad).focus(); return; }

  const btn = $('runBtn'); btn.disabled = true; btn.setAttribute('aria-busy', 'true'); $('runLabel').textContent = 'Reading strategies…';
  try {
    const m = await api('POST', '/api/matches', {
      strategyA: $('stratA').value, strategyB: $('stratB').value, seed,
      ...($('aiDown').checked ? { demo: { aiDown: true } } : {}),
    });
    $('seed').value = m.result.seed;
    if (Object.values(m.parserSource).includes('local-fallback')) toast('AI service unavailable. Local parser set the stats.');
    load(m, { animate: true });
    refreshHistory();
    document.getElementById('arena').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  } catch (err) {
    const map = { strategyA: ['stratA', 'errA'], strategyB: ['stratB', 'errB'], seed: ['seed', 'errSeed'] };
    if (map[err.field]) { setFieldError(...map[err.field], err.message); $(map[err.field][0]).focus(); }
    else $('errForm').textContent = err.message;
  } finally {
    btn.disabled = false; btn.removeAttribute('aria-busy'); $('runLabel').textContent = 'Run match';
  }
}

// ---------- Rendering ----------
function renderAttrs(m) {
  const block = (side) => {
    const a = m['attrs' + side], src = m.parserSource?.[side] || 'local', [ic, lab] = SRC_LABEL[src] || SRC_LABEL.local;
    const total = a.aggression + a.speed + a.defence, [, kind] = kindOf(a);
    const stat = (k, name) => `<div class="stat"><span>${name}</span><div class="pips" role="img" aria-label="${name} ${a[k]} of 10">${Array.from({ length: 10 }, (_, i) => `<span class="${i < a[k] ? 'on' : ''}"></span>`).join('')}</div><span class="n">${a[k]}</span></div>`;
    return `<div class="fighter-attrs ${side.toLowerCase()}">
      <div class="fa-head"><span class="swatch ${side.toLowerCase()}"></span><strong>Fighter ${side}</strong><span class="kind">${kind}</span><span class="src ${src === 'local-fallback' ? 'fallback' : ''}">${icon(ic)}${lab}</span></div>
      <p class="quote">${esc(m['strategy' + side])}</p>
      ${stat('aggression', 'Aggression')}${stat('speed', 'Speed')}${stat('defence', 'Defence')}
      <div class="budget mono">${total} / 24 points used</div></div>`;
  };
  $('attrs').innerHTML = block('A') + block('B');
}

function renderLog(m) {
  const L = m.result.log;
  $('log').innerHTML = L.map((e, i) => {
    const who = `Fighter ${e.actor}`;
    const txt = e.type === 'hit' ? `${who} hits${e.crit ? ' with a critical' : ''}${e.blocked ? ', partly blocked' : ''}`
      : e.type === 'miss' ? `${who} swings and misses` : `${who} raises guard`;
    const d = e.type === 'hit' ? `−${e.damage}` : '';
    return `<li data-i="${i}" class="${e.type}${e.crit ? ' crit' : ''}"><span class="r">R${e.round}</span><span class="who ${e.actor}"></span><span>${txt}</span><span class="d">${d}</span></li>`;
  }).join('');
  $('logEmpty').hidden = L.length > 0;
  $('logSub').textContent = `${L.length} moves, ${m.result.rounds} rounds`;
}

function resetCheck(id, text) { const el = $(id); el.className = 'result'; el.textContent = text; }
function setResult(id, cls, ic, html) { const el = $(id); el.className = 'result ' + cls; el.innerHTML = `${icon(ic)}<span>${html}</span>`; }

function renderProof(m) {
  $('fp').textContent = m.fingerprint;
  $('fp').classList.toggle('tampered', state.tampered);
  $('mSeed').textContent = m.result.seed;
  $('mEngine').textContent = m.result.version;
  $('mTime').textContent = fmtTime(m.createdAt);
  resetCheck('verifyRes', 'Re-runs the match from its saved stats and seed.');
  resetCheck('repeatRes', 'Every run must give the same outcome.');
  setMeter(0, false);
  renderTamper();
  renderAnchor(m);
  for (const id of ['verifyBtn', 'repeatBtn', 'tamperBtn', 'copyFp', 'playBtn']) $(id).disabled = false;
}
function renderTamper() {
  const b = $('tamperBtn');
  b.textContent = state.tampered ? 'Demo: restore the original result' : 'Demo: tamper with saved result';
  b.classList.toggle('on', state.tampered);
}
function setMeter(pct, bad) {
  $('repeatMeter').style.transform = `scaleX(${pct / 100})`;
  $('repeatTrack').setAttribute('aria-valuenow', String(Math.round(pct)));
  $('repeatTrack').classList.toggle('bad', !!bad);
}

function renderAnchor(m) {
  const btn = $('anchorBtn'), a = m.anchor || { status: 'not-requested' };
  btn.disabled = false; btn.textContent = 'Anchor';
  if (a.status === 'anchored') {
    const safeUrl = a.explorerUrl && /^https:\/\//.test(a.explorerUrl) ? a.explorerUrl : null;
    const tx = a.txHash ? `Tx <span class="mono">${esc(shortHash(a.txHash))}</span>` : esc(a.reason || '');
    const link = safeUrl ? ` · <a href="${esc(safeUrl)}" target="_blank" rel="noopener noreferrer">View on explorer</a>` : '';
    setResult('anchorRes', 'ok', 'icon-check-circle', `Anchored on Monad testnet. ${tx}${link}`);
    btn.disabled = true; btn.textContent = 'Anchored';
  } else if (a.status === 'unavailable') {
    setResult('anchorRes', 'warn', 'icon-alert-triangle', `Testnet unavailable. The match is still saved. ${esc(a.reason || '')}`);
    btn.textContent = 'Retry';
  } else resetCheck('anchorRes', 'Stores only the fingerprint. Prompts stay private.');
}

function renderHistory() {
  const list = state.matches;
  const q = $('q').value.trim();
  $('histCount').textContent = q ? `${list.length} found` : `${list.length} saved`;
  $('empty').hidden = list.length > 0;
  $('emptyText').innerHTML = q
    ? `No matches fit that search. Try a seed like <span class="mono">arena-001</span> or part of a fingerprint.`
    : 'No matches saved yet. Write two strategies above and press Run match.';
  $('rows').innerHTML = list.map((m) => {
    const w = m.result.winner, st = m.anchor?.status;
    const anc = st === 'anchored' ? `<span class="anc anchored">${icon('icon-check-circle')}Anchored</span>`
      : st === 'unavailable' ? `<span class="anc unavailable">${icon('icon-alert-triangle')}Unavailable</span>`
      : `<span class="anc none">Not anchored</span>`;
    const label = `Load match: Fighter A ${m.strategyA.slice(0, 40)} against Fighter B ${m.strategyB.slice(0, 40)}, seed ${m.result.seed}`;
    return `<tr data-id="${esc(m.id)}" class="${state.current?.id === m.id ? 'sel' : ''}" tabindex="0" aria-label="${esc(label)}">
      <td><div class="vs"><span><i class="swatch a"></i>${esc(m.strategyA)}</span><span><i class="swatch b"></i>${esc(m.strategyB)}</span></div></td>
      <td><span class="pill ${esc(w)}">${w === 'draw' ? 'Draw' : 'Fighter ' + esc(w)}</span></td>
      <td class="mono">${esc(m.result.seed)}</td>
      <td class="mono">${esc(shortHash(m.fingerprint))}</td>
      <td>${anc}</td>
      <td class="when">${fmtTime(m.createdAt)}</td></tr>`;
  }).join('');
}

async function refreshHistory() {
  try {
    const q = $('q').value.trim();
    state.matches = (await api('GET', `/api/matches?limit=100${q ? '&q=' + encodeURIComponent(q) : ''}`)).matches;
    renderHistory();
  } catch (err) { $('histCount').textContent = ''; $('empty').hidden = false; $('emptyText').textContent = err.message; }
}

// ---------- Arena playback ----------
const fA = $('fA'), fB = $('fB'), fx = $('fx');
const CENTER = { A: 200, B: 560 };
let timer = null, step = 0, speed = 2, playing = false;

function setHp(a, b) {
  $('hpA').style.transform = `scaleX(${a / 100})`; $('hpB').style.transform = `scaleX(${b / 100})`;
  $('hpAVal').textContent = a; $('hpBVal').textContent = b;
  $('trackA').setAttribute('aria-valuenow', a); $('trackB').setAttribute('aria-valuenow', b);
}
function setScrub(i, n) {
  const s = $('scrub'); s.max = String(n); s.value = String(i);
  s.style.setProperty('--pct', (n ? (i / n) * 100 : 0) + '%');
  s.setAttribute('aria-valuetext', n ? `Move ${i} of ${n}` : 'No match');
}
function clearFx() { fx.replaceChildren(); [fA, fB].forEach((f) => f.classList.remove('lunge', 'hurt', 'guarding', 'ko')); }
function setFigures(m) {
  fA.querySelector('.figure').setAttribute('href', '#' + kindOf(m.attrsA)[0]);
  fB.querySelector('.figure').setAttribute('href', '#' + kindOf(m.attrsB)[0]);
}
function markLog(i) {
  document.querySelectorAll('#log li').forEach((li) => { const k = +li.dataset.i; li.classList.toggle('now', k === i); li.classList.toggle('future', k > i); });
  const now = document.querySelector('#log li.now');
  if (now) { const box = $('log'); box.scrollTop = now.offsetTop - box.clientHeight / 2; }
}
function spawn(href, x, y, w, h, cls, color) {
  const u = document.createElementNS(NS, 'use');
  u.setAttribute('href', href); u.setAttribute('x', x - w / 2); u.setAttribute('y', y - h / 2); u.setAttribute('width', w); u.setAttribute('height', h);
  u.setAttribute('class', cls); if (color) u.style.color = color;
  fx.appendChild(u); if (cls !== 'stamp') setTimeout(() => u.remove(), 800);
}
function floatText(x, y, txt, color) {
  const t = document.createElementNS(NS, 'text');
  t.setAttribute('x', x); t.setAttribute('y', y); t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'pop');
  t.style.fill = color; t.textContent = txt; fx.appendChild(t); setTimeout(() => t.remove(), 800);
}

// Static pose at log index i (used by the scrubber): guard state and HP as of that move.
function poseAt(m, i) {
  stop(); clearFx(); $('banner').hidden = true;
  const L = m.result.log;
  if (i <= 0) { setHp(100, 100); $('roundNo').textContent = 0; setScrub(0, L.length); markLog(-1); setPlayUi(false); return; }
  if (i >= L.length) { showEnd(m); return; }
  const e = L[i - 1], guard = { A: false, B: false };
  for (let k = 0; k < i; k++) { const x = L[k]; if (x.type === 'guard') guard[x.actor] = true; else if (x.blocked) guard[x.actor === 'A' ? 'B' : 'A'] = false; }
  fA.classList.toggle('guarding', guard.A); fB.classList.toggle('guarding', guard.B);
  setHp(e.hpA, e.hpB); $('roundNo').textContent = e.round; setScrub(i, L.length); markLog(i - 1); setPlayUi(false);
}

function showEnd(m) {
  stop(); clearFx();
  const r = m.result; setHp(r.hpA, r.hpB); $('roundNo').textContent = r.rounds;
  for (const [f, hp, x] of [[fA, r.hpA, CENTER.A], [fB, r.hpB, CENTER.B]]) {
    if (hp === 0) { f.classList.add('ko'); spawn('#effect-ko', x, 70, 90, 90, 'stamp'); }
  }
  $('bannerText').textContent = winnerText(r); $('banner').hidden = false;
  $('banner').classList.remove('show'); void $('banner').offsetWidth; $('banner').classList.add('show');
  setScrub(r.log.length, r.log.length);
  document.querySelectorAll('#log li').forEach((li) => li.classList.remove('now', 'future'));
  setPlayUi(false);
}

function applyEvent(m, i) {
  const e = m.result.log[i], me = e.actor === 'A' ? fA : fB, foe = e.actor === 'A' ? fB : fA, target = e.actor === 'A' ? 'B' : 'A';
  [fA, fB].forEach((f) => f.classList.remove('lunge', 'hurt'));
  void me.getBBox();
  if (e.type === 'guard') me.classList.add('guarding');
  else {
    me.classList.remove('guarding'); me.classList.add('lunge');
    setTimeout(() => me.classList.remove('lunge'), 180 / speed + 90);
    const x = CENTER[target], col = e.actor === 'A' ? 'var(--ember)' : 'var(--steel)';
    if (e.type === 'hit') {
      if (e.blocked) foe.classList.remove('guarding');
      foe.classList.add('hurt');
      spawn(e.crit ? '#effect-critical-burst' : '#effect-hit-spark', x, 140, e.crit ? 84 : 58, e.crit ? 84 : 58, 'burst', col);
      floatText(x, 92, (e.crit ? 'CRIT ' : '') + '−' + e.damage, e.crit ? 'var(--warn)' : 'var(--bad)');
    } else { spawn('#effect-whiff', x, 130, 64, 64, 'burst'); floatText(x, 92, 'miss', 'var(--muted)'); }
  }
  setHp(e.hpA, e.hpB); $('roundNo').textContent = e.round;
  setScrub(i + 1, m.result.log.length);
  markLog(i);
}

function play(m, from = 0) {
  stop(); clearFx(); $('banner').hidden = true;
  if (from === 0) { setHp(100, 100); $('roundNo').textContent = 0; setScrub(0, m.result.log.length); markLog(-1); }
  step = from; playing = true; setPlayUi(true); tick(m);
}
function tick(m) {
  if (step >= m.result.log.length) { playing = false; timer = setTimeout(() => showEnd(m), reduced ? 0 : 300); return; }
  applyEvent(m, step++); timer = setTimeout(() => tick(m), reduced ? 60 : 520 / speed);
}
function stop() { clearTimeout(timer); timer = null; playing = false; }
function setPlayUi(on) {
  $('playIcon').innerHTML = `<use href="#${on ? 'icon-pause' : 'icon-replay'}"/>`;
  $('playLabel').textContent = on ? 'Stop replay' : 'Replay match';
}

function load(m, { animate = false } = {}) {
  state.current = structuredClone(m); state.original = structuredClone(m); state.tampered = false;
  $('scrub').disabled = false;
  setFigures(m); renderAttrs(m); renderLog(m); renderProof(m); renderHistory();
  if (animate && !reduced) play(state.current); else showEnd(state.current);
}

// ---------- Proof actions ----------
async function onVerify() {
  const m = state.current, btn = $('verifyBtn');
  btn.disabled = true; setResult('verifyRes', '', 'icon-repeat', 'Re-running on the server…');
  try {
    const v = await api('POST', `/api/matches/${m.id}/verify`);
    // The server re-runs from its stored stats and seed. We also hash the copy shown on screen,
    // so the tamper demo (which edits only this copy) is caught too.
    const shown = await fingerprintOf(m);
    const ok = v.verified && shown === v.recomputedFingerprint;
    const hashes = `<dl class="hashes"><dt>Shown</dt><dd class="${shown === v.recomputedFingerprint ? '' : 'diff'}">${shortHash(shown)}</dd><dt>Re-run</dt><dd>${shortHash(v.recomputedFingerprint)}</dd></dl>`;
    if (ok) setResult('verifyRes', 'ok', 'icon-check-circle', `Verified. Re-run matches the saved fingerprint.${hashes}`);
    else {
      const why = state.tampered
        ? `Mismatch. The result on screen says Fighter A ended on ${m.result.hpA} HP, but a re-run gives ${state.original.result.hpA}. This copy was changed.`
        : `Mismatch. ${esc(v.note || 'The saved record does not match a fresh re-run.')}`;
      setResult('verifyRes', 'bad', 'icon-x-circle', why + hashes);
    }
  } catch (err) { setResult('verifyRes', 'bad', 'icon-alert-triangle', esc(err.message)); }
  finally { btn.disabled = false; }
}

function onTamper() {
  const m = state.current;
  if (!state.tampered) {
    m.result = { ...m.result, hpA: Math.min(100, m.result.hpA + 15) };
    m.result.winner = m.result.hpA > m.result.hpB ? 'A' : m.result.hpB > m.result.hpA ? 'B' : 'draw';
    state.tampered = true; toast('Result on screen edited. The server copy is untouched. Now press Verify.');
  } else {
    state.current = structuredClone(state.original); state.tampered = false; toast('Original result restored.');
  }
  $('fp').classList.toggle('tampered', state.tampered);
  renderTamper(); resetCheck('verifyRes', 'Re-runs the match from its saved stats and seed.');
  showEnd(state.current);
}

async function onRepeat() {
  const m = state.original, btn = $('repeatBtn');
  btn.disabled = true; setMeter(0, false);
  const refJson = canonical(simulate(m.attrsA, m.attrsB, m.result.seed));
  let same = 0;
  const server = api('POST', `/api/matches/${m.id}/repeat`).catch((e) => ({ error: e.message }));
  for (let i = 1; i <= 100; i++) {
    if (canonical(simulate(m.attrsA, m.attrsB, m.result.seed)) === refJson) same++;
    if (i % 5 === 0) {
      setMeter(i, same !== i);
      setResult('repeatRes', '', 'icon-repeat', `Run ${i} of 100 in the browser…`);
      await new Promise((r) => setTimeout(r, reduced ? 0 : 16));
    }
  }
  const [s, clientOutcome] = await Promise.all([server, sha256Hex(refJson)]);
  btn.disabled = false;
  if (s.error) { setMeter(100, same !== 100); setResult('repeatRes', same === 100 ? 'warn' : 'bad', 'icon-alert-triangle', `${same} of 100 browser runs identical. Server check failed: ${esc(s.error)}`); return; }
  const allOk = same === 100 && s.identical === 100 && s.outcomeFingerprint === clientOutcome;
  setMeter(100, !allOk);
  const who = m.result.winner === 'draw' ? 'A draw' : `Fighter ${m.result.winner} wins`;
  if (allOk) setResult('repeatRes', 'ok', 'icon-check-circle', `100 of 100 runs identical in the browser and 100 of 100 on the server. ${who} every time.`);
  else setResult('repeatRes', 'bad', 'icon-x-circle', `Browser ${same} of 100, server ${s.identical} of 100${s.outcomeFingerprint !== clientOutcome ? ', and the two engines disagree' : ''}. The engine is not deterministic.`);
}

async function onAnchor() {
  const m = state.original, btn = $('anchorBtn');
  btn.disabled = true; btn.textContent = 'Sending…';
  setResult('anchorRes', '', 'icon-link', 'Submitting the fingerprint to Monad testnet…');
  try {
    const rec = await api('POST', `/api/matches/${m.id}/anchor`, $('rpcDown').checked ? { demo: { rpcDown: true } } : {});
    state.original.anchor = rec.anchor; state.current.anchor = rec.anchor;
    renderAnchor(rec);
    if (rec.anchor.status === 'anchored') toast('Fingerprint anchored on testnet.');
    const row = state.matches.find((x) => x.id === rec.id); if (row) row.anchor = rec.anchor;
    renderHistory();
  } catch (err) {
    setResult('anchorRes', 'warn', 'icon-alert-triangle', esc(err.message)); btn.disabled = false; btn.textContent = 'Retry';
  }
}

async function onCopy() {
  try { await navigator.clipboard.writeText(state.current.fingerprint); toast('Fingerprint copied.'); }
  catch { toast('Copy blocked. Select the hash and copy it manually.'); }
}

function loadRow(tr) {
  const m = tr && state.matches.find((x) => x.id === tr.dataset.id);
  if (!m) return;
  load(m);
  document.getElementById('arena').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

// ---------- Wiring ----------
function wire() {
  $('composer').addEventListener('submit', onSubmit);
  for (const [id, err] of [['stratA', 'errA'], ['stratB', 'errB']]) $(id).addEventListener('input', () => { updateCounts(); setFieldError(id, err, ''); });
  $('seed').addEventListener('input', () => setFieldError('seed', 'errSeed', ''));
  $('rollSeed').addEventListener('click', () => { $('seed').value = randomSeed(); setFieldError('seed', 'errSeed', ''); });
  $('aiDown').addEventListener('change', renderChips);
  $('rpcDown').addEventListener('change', renderChips);

  $('playBtn').addEventListener('click', () => {
    if (!state.current) return;
    if (playing) showEnd(state.current);
    else { const s = +$('scrub').value, n = state.current.result.log.length; play(state.current, s > 0 && s < n ? s : 0); }
  });
  $('scrub').addEventListener('input', (e) => { if (state.current) poseAt(state.current, +e.target.value); });
  document.querySelectorAll('.speed button').forEach((b) => b.addEventListener('click', () => {
    speed = +b.dataset.speed;
    document.querySelectorAll('.speed button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
  }));

  $('verifyBtn').addEventListener('click', onVerify);
  $('tamperBtn').addEventListener('click', onTamper);
  $('repeatBtn').addEventListener('click', onRepeat);
  $('anchorBtn').addEventListener('click', onAnchor);
  $('copyFp').addEventListener('click', onCopy);

  $('rows').addEventListener('click', (e) => loadRow(e.target.closest('tr')));
  $('rows').addEventListener('keydown', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadRow(tr); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); (e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling)?.focus(); }
  });
  let qTimer;
  $('q').addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(refreshHistory, 220); });
}

async function boot() {
  try { $('sprite').innerHTML = await (await fetch('assets/sprite.svg')).text(); } catch {}
  wire(); updateCounts(); setHp(100, 100); setScrub(0, 0);
  try { state.health = await api('GET', '/api/health'); } catch { state.health = null; toast('Can’t reach the Sentry server. Check that npm start is running.'); }
  renderChips();
  await refreshHistory();
  if (state.matches[0]) load(state.matches[0]);
}
boot();
