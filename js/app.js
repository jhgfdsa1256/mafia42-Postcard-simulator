import { GUILDS, normalizeCard, optimize, recallValues } from './engine.js';
import { fetchMailbox, ProfileApiError } from './profile.js';
import * as store from './storage.js';
import { esc, thumb, fameText, priceText, renderResults } from './view.js';

const $ = (id) => document.getElementById(id);
let cards = [];
let state = defaultState();
let saveTimer = null;

function defaultState() {
  return { nick: '', rub: 100000, luna: 0, step: 0, guild: 18, famous: false, days: 360, holdings: [], exclude: [] };
}
const cardById = (id) => cards.find((c) => c.id === id);

function status(msg, bad) {
  const el = $('status');
  el.textContent = msg;
  el.className = bad ? 'bad' : 'ok';
  clearTimeout(status.t);
  status.t = setTimeout(() => { el.textContent = ''; }, 6000);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const ok = store.save(state);
    $('saved').textContent = ok ? '자동 저장됨' : '저장소를 쓸 수 없어 이 탭에만 유지됩니다';
    renderSavedList();
  }, 300);
}

/* ---------- 렌더링 ---------- */
function renderSituation() {
  $('nick').value = state.nick;
  $('rub').value = state.rub;
  $('luna').value = state.luna;
  $('step').value = state.step;
  $('guild').value = String(state.guild);
  $('famous').checked = !!state.famous;
  $('days').value = state.days;
}

function renderHoldings() {
  const box = $('holdings');
  if (!state.holdings.length) {
    box.innerHTML = '<p class="mut">우체통이 비어 있습니다. 아래에서 엽서를 눌러 추가하세요.</p>';
    return;
  }
  box.innerHTML = state.holdings.map((h, i) => {
    const c = cardById(h.id);
    if (!c) return `<div class="hold" data-i="${i}"><span class="hname">알 수 없는 엽서 (${esc(h.id)})<small>cards.json에서 삭제된 항목</small></span><button class="x" data-del="${i}">삭제</button></div>`;
    return `<div class="hold${c.fameMean < 0 ? ' neg' : ''}" data-i="${i}">${thumb(c)}`
      + `<span class="hname">${esc(c.name)}<small>${esc(fameText(c))}</small></span>`
      + `<label>수량<input type="number" min="1" inputmode="numeric" data-f="count" value="${h.count}"></label>`
      + `<label>남은 일수<input type="number" min="1" inputmode="numeric" data-f="remain" value="${h.remain}"></label>`
      + `<button class="x" data-del="${i}" aria-label="삭제">×</button></div>`;
  }).join('');
}

function renderPicker() {
  $('picker').innerHTML = cards.map((c) =>
    `<button type="button" class="tile${c.fameMean < 0 ? ' neg' : ''}" data-add="${esc(c.id)}">${thumb(c)}<span>${esc(c.name)}</span><small>${esc(fameText(c))}</small></button>`
  ).join('');
}

function renderShop() {
  const shop = cards.filter((c) => c.purchasable);
  $('shop').innerHTML = shop.map((c) =>
    `<label class="chip"><input type="checkbox" data-shop="${esc(c.id)}" ${state.exclude.includes(c.id) ? '' : 'checked'}>${thumb(c)}<span>${esc(c.name)}<small>${esc(priceText(c))}</small></span></label>`
  ).join('');
}

function renderSavedList() {
  const names = store.list();
  $('savedList').innerHTML = names.map((n) => `<option value="${esc(n)}">${esc(n || '(닉네임 없음)')}</option>`).join('');
  if (names.includes(state.nick)) $('savedList').value = state.nick;
}

function renderAll() {
  renderSituation(); renderHoldings(); renderShop(); renderSavedList();
}

/* ---------- 계산 ---------- */
function calc() {
  const P = {
    ...state,
    cards,
    days: Math.min(1500, Math.max(1, Math.floor(state.days) || 360)),
    step: Math.max(0, Math.floor(state.step) || 0),
    holdings: state.holdings.filter((h) => cardById(h.id)),
  };
  const R = optimize(P);
  const recall = recallValues(P, R.bestU);
  $('out').innerHTML = renderResults(P, R, recall);
  $('out').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- 입력 연결 ---------- */
function bind() {
  GUILDS.forEach(([n, p]) => {
    const o = document.createElement('option');
    o.value = String(p); o.textContent = `${n} (${p}%)`;
    $('guild').appendChild(o);
  });

  const num = (id, key, min = 0) => $(id).addEventListener('input', () => { state[key] = Math.max(min, Math.floor(+$(id).value || 0)); scheduleSave(); });
  num('rub', 'rub'); num('luna', 'luna'); num('step', 'step'); num('days', 'days', 1);
  $('guild').addEventListener('change', () => { state.guild = +$('guild').value; scheduleSave(); });
  $('famous').addEventListener('change', () => { state.famous = $('famous').checked; scheduleSave(); });
  $('nick').addEventListener('input', () => { state.nick = $('nick').value.trim(); scheduleSave(); });

  $('holdings').addEventListener('input', (e) => {
    const row = e.target.closest('[data-i]');
    if (!row || !e.target.dataset.f) return;
    state.holdings[+row.dataset.i][e.target.dataset.f] = Math.max(1, Math.floor(+e.target.value || 1));
    scheduleSave();
  });
  $('holdings').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    state.holdings.splice(+b.dataset.del, 1);
    renderHoldings(); scheduleSave();
  });
  $('picker').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    const c = cardById(b.dataset.add);
    state.holdings.push({ id: c.id, count: 1, remain: c.maxDay });
    renderHoldings(); scheduleSave();
  });
  $('shop').addEventListener('change', (e) => {
    const id = e.target.dataset.shop;
    if (!id) return;
    state.exclude = state.exclude.filter((x) => x !== id);
    if (!e.target.checked) state.exclude.push(id);
    scheduleSave();
  });

  $('calc').addEventListener('click', calc);
  $('loadNick').addEventListener('click', loadProfile);
  $('savedList').addEventListener('change', () => {
    const s = store.get($('savedList').value);
    if (s) { state = { ...defaultState(), ...s }; renderAll(); status('저장된 정보를 불러왔습니다'); }
  });
  $('delSaved').addEventListener('click', () => {
    const n = $('savedList').value;
    if (n === undefined || !store.list().includes(n)) return;
    if (!confirm(`"${n || '(닉네임 없음)'}" 저장 정보를 삭제할까요?`)) return;
    store.remove(n); renderSavedList(); status('삭제했습니다');
  });
  $('exp').addEventListener('click', () => { store.save(state); $('json').value = store.exportAll(); status('아래 칸에 내보냈습니다. 복사해서 보관하세요'); });
  $('imp').addEventListener('click', () => {
    try {
      store.importAll($('json').value);
      const s = store.get(store.current());
      if (s) state = { ...defaultState(), ...s };
      renderAll(); status('불러왔습니다');
    } catch (err) { status('내용을 읽지 못했습니다: ' + err.message, true); }
  });
}

async function loadProfile() {
  const nick = $('nick').value.trim();
  if (!nick) { status('닉네임을 입력하세요', true); return; }
  const saved = store.get(nick);
  if (saved) { state = { ...defaultState(), ...saved, nick }; renderAll(); status('저장된 정보를 불러왔습니다'); return; }
  try {
    const { state: s, unknown } = await fetchMailbox(nick, cards);
    state = { ...defaultState(), ...state, ...s, nick };
    renderAll(); scheduleSave();
    status(unknown ? `불러왔습니다 (엽서 ${unknown}종은 cards.json에 없어 건너뜀)` : '불러왔습니다');
  } catch (err) {
    state.nick = nick; scheduleSave();
    if (err instanceof ProfileApiError && err.message === 'NO_API') status('저장된 정보가 없고 닉네임 조회 서버도 아직 연결되지 않았습니다. 직접 입력해 주세요', true);
    else status('불러오기에 실패했습니다: ' + err.message, true);
  }
}

async function boot() {
  store.init();
  try {
    const res = await fetch('data/cards.json');
    if (!res.ok) throw new Error(res.status);
    cards = (await res.json()).cards.map(normalizeCard);
  } catch (e) {
    $('boot-error').hidden = false;
    return;
  }
  const saved = store.get(store.current());
  if (saved) state = { ...defaultState(), ...saved };
  bind(); renderPicker(); renderAll();
}
boot();
