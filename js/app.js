import { GUILDS, SEND_BORDERS, RECV_BORDERS, normalizeCard, effectiveCard, optimize, recallValues, compareBorders } from './engine.js';
import { fetchMailbox, ProfileApiError } from './profile.js';
import * as store from './storage.js';
import { esc, thumb, fameText, priceText, renderResults, renderBorderCompare } from './view.js';

const $ = (id) => document.getElementById(id);
let cards = [];
let state = defaultState();
let saveTimer = null;

function defaultState() {
  return { nick: '', rub: 100000, luna: 0, step: 0, guild: 18, famous: false, days: 360, holdings: [], exclude: [], overrides: {},
    borders: { send: 'none', recv: 'none', prob: 'sure', recvDurPct: 10 } };
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
  $('step').value = 42 + 10 * state.step;
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
    const fameInput = c.incomplete || c.askFame
      ? `<label>명성 (${c.incomplete ? '필수' : '선택'})<input type="number" step="any" inputmode="decimal" data-f="fame" value="${Number.isFinite(h.fame) ? h.fame : ''}" placeholder="${c.incomplete ? (c.group === 'minus' ? '예: -5' : '예: 5') : '기본 ' + Math.round(c.fameMean * 100) / 100}"></label>`
      : '';
    const startInput = c.sequence
      ? `<label>앞서 받은 개수<input type="number" min="0" inputmode="numeric" data-f="start" value="${h.start || 0}"></label>`
      : '';
    return `<div class="hold${c.group === 'minus' ? ' neg' : ''}" data-i="${i}">${thumb(c)}`
      + `<span class="hname">${esc(c.name)}<small>${esc(fameText(c))}</small>${c.note ? `<small>${esc(c.note)}</small>` : ''}</span>`
      + `<label>수량<input type="number" min="1" inputmode="numeric" data-f="count" value="${h.count}"></label>`
      + `<label>남은 일수<input type="number" min="1" inputmode="numeric" data-f="remain" value="${h.remain}"></label>`
      + startInput
      + fameInput
      + `<button class="x" data-del="${i}" aria-label="삭제">×</button></div>`;
  }).join('');
}

function renderPicker() {
  $('picker').innerHTML = cards.map((c) =>
    `<button type="button" class="tile${c.group === 'minus' ? ' neg' : ''}" data-add="${esc(c.id)}">${thumb(c)}<span>${esc(c.name)}</span><small>${esc(fameText(c))}</small></button>`
  ).join('');
}

function renderShop() {
  // 내 우체통에 넣으려고 사는 엽서만 보여 줍니다 (마이너스 엽서는 상대에게 보내는 용도라 제외)
  const shop = cards.filter((c) => c.purchasable && c.group !== 'minus');
  $('shop').innerHTML = shop.map((c) => {
    const ov = c.incomplete
      ? `<input class="ov" type="number" step="any" inputmode="decimal" data-ov="${esc(c.id)}" placeholder="명성 입력" value="${Number.isFinite(state.overrides[c.id]) ? state.overrides[c.id] : ''}">`
      : '';
    return `<label class="chip"><input type="checkbox" data-shop="${esc(c.id)}" ${state.exclude.includes(c.id) ? '' : 'checked'}>${thumb(c)}<span>${esc(c.name)}<small>${esc(priceText(c))} · ${esc(fameText(c))}</small></span>${ov}</label>`;
  }).join('');
}

function renderBorders() {
  const list = (kind, items) => items.map((b) =>
    `<label class="bd"><input type="checkbox" data-bd="${kind}" data-id="${b.id}" ${state.borders[kind] === b.id ? 'checked' : ''}><span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></span></label>`
  ).join('');
  $('sendBorders').innerHTML = list('send', SEND_BORDERS);
  $('recvBorders').innerHTML = list('recv', RECV_BORDERS);
  $('prob').value = state.borders.prob || 'sure';
  $('recvDur').value = state.borders.recvDurPct ?? 10;
  $('durWrap').hidden = state.borders.recv !== 'rbigdur';
}

function renderSavedList() {
  const names = store.list();
  $('savedList').innerHTML = names.map((n) => `<option value="${esc(n)}">${esc(n || '(닉네임 없음)')}</option>`).join('');
  if (names.includes(state.nick)) $('savedList').value = state.nick;
}

function renderAll() {
  renderSituation(); renderHoldings(); renderShop(); renderBorders(); renderSavedList();
}

/* ---------- 계산 ---------- */
function buildP() {
  // 명성이 ?인 엽서는 사용자가 입력한 값으로 채웁니다 (직접 입력한 값은 테두리로 바꾸지 않습니다)
  const filled = cards.map((c) => (c.incomplete && Number.isFinite(state.overrides[c.id])
    ? { ...c, fameMean: state.overrides[c.id], fameDist: [[state.overrides[c.id], 1]], incomplete: false, typed: true, group: state.overrides[c.id] < 0 ? 'minus' : c.group }
    : c));
  return {
    ...state,
    cards: filled,
    days: Math.min(1500, Math.max(1, Math.floor(state.days) || 360)),
    step: Math.max(0, Math.floor(state.step) || 0),
    holdings: state.holdings.filter((h) => cardById(h.id)),
  };
}

function calc() {
  const P = buildP();
  const R = optimize(P);
  const recall = recallValues(P, R.bestU);
  $('out').innerHTML = renderResults(P, R, recall);
  $('out').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function compare() {
  $('cmpOut').innerHTML = '<p class="mut">테두리를 비교하는 중입니다…</p>';
  setTimeout(() => {
    $('cmpOut').innerHTML = renderBorderCompare(compareBorders(buildP()));
    $('cmpOut').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 30);
}

/* ---------- 입력 연결 ---------- */
function bind() {
  GUILDS.forEach(([n, p]) => {
    const o = document.createElement('option');
    o.value = String(p); o.textContent = `${n} (${p}%)`;
    $('guild').appendChild(o);
  });

  const num = (id, key, min = 0) => $(id).addEventListener('input', () => { state[key] = Math.max(min, Math.floor(+$(id).value || 0)); scheduleSave(); });
  num('rub', 'rub'); num('luna', 'luna');
  $('step').addEventListener('input', () => { state.step = Math.max(0, Math.round(((+$('step').value || 42) - 42) / 10)); scheduleSave(); });
  $('step').addEventListener('change', () => { $('step').value = 42 + 10 * state.step; });
  num('days', 'days', 1);
  $('guild').addEventListener('change', () => { state.guild = +$('guild').value; scheduleSave(); });
  $('famous').addEventListener('change', () => { state.famous = $('famous').checked; scheduleSave(); });
  $('nick').addEventListener('input', () => { state.nick = $('nick').value.trim(); scheduleSave(); });

  $('holdings').addEventListener('input', (e) => {
    const row = e.target.closest('[data-i]');
    if (!row || !e.target.dataset.f) return;
    const h = state.holdings[+row.dataset.i];
    if (e.target.dataset.f === 'fame') {
      if (e.target.value === '' || !Number.isFinite(+e.target.value)) delete h.fame; else h.fame = +e.target.value;
    } else {
      const min = e.target.dataset.f === 'start' ? 0 : 1;
      h[e.target.dataset.f] = Math.max(min, Math.floor(+e.target.value || min));
    }
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
    state.holdings.push({ id: c.id, count: 1, remain: effectiveCard(c, state.borders).maxDay });
    renderHoldings(); scheduleSave();
  });
  $('shop').addEventListener('change', (e) => {
    const id = e.target.dataset.shop;
    if (!id) return;
    state.exclude = state.exclude.filter((x) => x !== id);
    if (!e.target.checked) state.exclude.push(id);
    scheduleSave();
  });
  $('shop').addEventListener('input', (e) => {
    const id = e.target.dataset.ov;
    if (!id) return;
    if (e.target.value === '' || !Number.isFinite(+e.target.value)) delete state.overrides[id]; else state.overrides[id] = +e.target.value;
    scheduleSave();
  });

  // 테두리: 송신·수신 각각 하나만 선택 (체크하면 같은 그룹의 다른 항목은 해제)
  const onBorder = (e) => {
    const kind = e.target.dataset.bd;
    if (!kind) return;
    state.borders[kind] = e.target.checked ? e.target.dataset.id : 'none';
    renderBorders(); scheduleSave();
  };
  $('sendBorders').addEventListener('change', onBorder);
  $('recvBorders').addEventListener('change', onBorder);
  $('prob').addEventListener('change', () => { state.borders.prob = $('prob').value; scheduleSave(); });
  $('recvDur').addEventListener('input', () => {
    state.borders.recvDurPct = Math.min(100, Math.max(0, Math.floor(+$('recvDur').value || 0)));
    scheduleSave();
  });

  $('calc').addEventListener('click', calc);
  $('cmp').addEventListener('click', compare);
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
