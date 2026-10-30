import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCard, optimize, recallValues } from '../js/engine.js';
import { renderResults } from '../js/view.js';
import { toState } from '../js/profile.js';
import * as store from '../js/storage.js';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')).cards.map(normalizeCard);
const cards = [...load('../data/cards.json'), ...load('../data/cards.example-event.json')];

// 마이너스·이벤트 엽서가 들어 있는 상태로 결과 화면이 그려진다
const P = { days: 90, rub: 150000, luna: 20, step: 1, guild: 20, famous: true, cards, exclude: [],
  holdings: [{ id: 'example-event-minus', count: 6, remain: 12 }, { id: 'example-event-plus', count: 2, remain: 5 }, { id: 'normal', count: 30, remain: 10 }] };
const R = optimize(P);
const html = renderResults(P, R, recallValues(P, R.bestU));
assert.ok(html.includes('회수 요청 우선순위'), '마이너스 엽서 회수 목록이 보여야 함');
assert.ok(html.includes('이벤트'), '이벤트 표시가 있어야 함');
assert.ok(!html.includes('NaN') && !html.includes('undefined'), 'NaN/undefined 없음');

// 프로필 변환
const { state, unknown } = toState({ step: 3, rub: 1000, holdings: [{ id: 'normal', count: 5, remain: 4 }, { name: '고급엽서', count: 2, remain: 9 }, { name: '없는엽서', count: 1, remain: 1 }] }, cards);
assert.equal(unknown, 1);
assert.deepEqual(state.holdings.map((h) => h.id), ['normal', 'advanced']);
assert.equal(state.step, 3);

// 저장소: 쓸 수 없어도 죽지 않는다
globalThis.localStorage = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
store.init();
assert.equal(store.save({ nick: 'a' }), false);

console.log('view/profile/storage tests passed');
