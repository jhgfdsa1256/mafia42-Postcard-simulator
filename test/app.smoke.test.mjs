// 브라우저 없이 app.js를 가짜 DOM으로 돌려 보는 스모크 테스트
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const els = {};
const mkEl = (id) => ({
  id, value: '', checked: false, innerHTML: '', textContent: '', className: '', hidden: false, dataset: {},
  listeners: {},
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
  appendChild() {}, scrollIntoView() {},
  fire(t, ev = {}) { (this.listeners[t] || []).forEach((f) => f({ target: this, ...ev })); },
});
globalThis.document = {
  getElementById: (id) => (els[id] ||= mkEl(id)),
  createElement: () => ({ value: '', textContent: '' }),
};
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
globalThis.confirm = () => true;
globalThis.fetch = async (url) => {
  const path = new URL('../' + url, import.meta.url);
  return { ok: true, json: async () => JSON.parse(readFileSync(path, 'utf8')) };
};

await import('../js/app.js');
await new Promise((r) => setTimeout(r, 50));

assert.ok(els.picker.innerHTML.includes('data-add="normal"'), '엽서 선택 목록이 그려져야 함');
assert.ok(els.shop.innerHTML.includes('data-shop="dice"'), '상점 엽서 체크 목록이 그려져야 함');
assert.ok(els.shop.innerHTML.includes('data-ov="imperial-edict"'), '명성 미정 상점 엽서는 입력 칸이 있어야 함');
assert.ok(!els.shop.innerHTML.includes('data-shop="warning"'), '마이너스 상점 엽서는 체크 목록에서 빠져야 함');

// 엽서 추가 → 수량 수정 → 계산
els.picker.fire('click', { target: { closest: (s) => (s === '[data-add]' ? { dataset: { add: 'normal' } } : null) } });
assert.ok(els.holdings.innerHTML.includes('data-i="0"'));
els.holdings.fire('input', {
  target: { dataset: { f: 'count' }, value: '10', closest: () => ({ dataset: { i: '0' } }) },
});
els.rub.value = '200000'; els.rub.fire('input');
els.days.value = '120'; els.days.fire('input');
els.calc.fire('click');
assert.ok(els.out.innerHTML.includes('최적 계획'), '결과가 그려져야 함');
assert.ok(els.out.innerHTML.includes('엽서별 효율'));

// 명성이 ?인 엽서를 값 없이 추가하면 계산에서 빠지고 경고가 보인다
els.picker.fire('click', { target: { closest: (q) => (q === '[data-add]' ? { dataset: { add: 'imperial-edict' } } : null) } });
assert.ok(els.holdings.innerHTML.includes('data-f="fame"'), '명성 입력 칸이 보여야 함');
els.calc.fire('click');
assert.ok(els.out.innerHTML.includes('명성 값이 없어'), '미입력 경고가 보여야 함');
// 값을 적으면 경고가 사라진다
els.holdings.fire('input', { target: { dataset: { f: 'fame' }, value: '6', closest: () => ({ dataset: { i: '1' } }) } });
els.calc.fire('click');
assert.ok(!els.out.innerHTML.includes('명성 값이 없어'));

// 순서형 엽서(나비엽)에는 '앞서 받은 개수' 칸이 있다
els.picker.fire('click', { target: { closest: (q) => (q === '[data-add]' ? { dataset: { add: 'butterfly' } } : null) } });
assert.ok(els.holdings.innerHTML.includes('data-f="start"'));

// 테두리: 그룹마다 하나만 선택된다
assert.ok(els.sendBorders.innerHTML.includes('data-id="bigup"'));
assert.ok(els.recvBorders.innerHTML.includes('data-id="rbigdur"'));
const count = (el) => (el.innerHTML.match(/ checked/g) || []).length;
assert.equal(count(els.sendBorders), 0);
els.sendBorders.fire('change', { target: { dataset: { bd: 'send', id: 'rub' }, checked: true } });
assert.equal(count(els.sendBorders), 1);
els.sendBorders.fire('change', { target: { dataset: { bd: 'send', id: 'bigup' }, checked: true } });
assert.equal(count(els.sendBorders), 1);
assert.ok(els.sendBorders.innerHTML.includes('data-id="bigup" checked'));
els.recvBorders.fire('change', { target: { dataset: { bd: 'recv', id: 'rbigdur' }, checked: true } });
assert.equal(els.durWrap.hidden, false);
els.calc.fire('click');
assert.ok(els.out.innerHTML.includes('송신 기복테'), '적용 테두리가 결과에 표시돼야 함');
// 테두리 비교
els.cmp.fire('click');
for (let i = 0; i < 100 && !els.cmpOut.innerHTML.includes('송신 테두리'); i++) await new Promise((r) => setTimeout(r, 100));
assert.ok(els.cmpOut.innerHTML.includes('수신 테두리'));
els.sendBorders.fire('change', { target: { dataset: { bd: 'send', id: 'bigup' }, checked: false } });
assert.equal(count(els.sendBorders), 0);
els.sendBorders.fire('change', { target: { dataset: { bd: 'send', id: 'rub' }, checked: true } });

// 자동 저장은 디바운스 뒤에 localStorage에 들어간다
await new Promise((r) => setTimeout(r, 400));
const saved = JSON.parse(store['m42planner.v1']);
assert.equal(saved.profiles[''].rub, 200000);
assert.equal(saved.profiles[''].holdings[0].count, 10);
assert.equal(saved.profiles[''].borders.send, 'rub');
assert.equal(saved.profiles[''].borders.recv, 'rbigdur');

// 닉네임 불러오기: 저장 없음 + API 없음 → 안내 문구
els.nick.value = '테스트'; els.nick.fire('input');
await els.loadNick.listeners.click[0]();
assert.ok(els.status.textContent.includes('연결되지 않았습니다'));

console.log('app smoke test passed');
