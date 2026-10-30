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

// 자동 저장은 디바운스 뒤에 localStorage에 들어간다
await new Promise((r) => setTimeout(r, 400));
const saved = JSON.parse(store['m42planner.v1']);
assert.equal(saved.profiles[''].rub, 200000);
assert.equal(saved.profiles[''].holdings[0].count, 10);

// 닉네임 불러오기: 저장 없음 + API 없음 → 안내 문구
els.nick.value = '테스트'; els.nick.fire('input');
await els.loadNick.listeners.click[0]();
assert.ok(els.status.textContent.includes('연결되지 않았습니다'));

console.log('app smoke test passed');
