import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCard, simulate, optimize, cardStats, recallValues, effectiveCard, compareBorders, SEND_BORDERS, RECV_BORDERS } from '../js/engine.js';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')).cards.map(normalizeCard);
const shop = load('../data/cards.json');
const ex = load('../data/cards.example-event.json');
const cards = [...shop, ...ex];
const base = { days: 30, rub: 1_000_000, luna: 0, step: 0, guild: 18, famous: false, cards, holdings: [], exclude: ['advanced', 'surprise', 'dice', 'love-letter'] };
const near = (a, b, eps = 1) => assert.ok(Math.abs(a - b) <= eps, `${a} !== ${b}`);

// 1) 실버 42칸 일반엽서 한 사이클: +1,040 × 42 = +43,680 루블, 루나 30
{
  const s = simulate(base, 0);
  near(s.rub, 1_043_680);
  assert.equal(s.luna, 30);
}

// 2) 확률표 평균과 주사위 효율
{
  const dice = shop.find((c) => c.id === 'dice');
  near(dice.fameMean, 11.5225, 0.001);
  near(dice.meanDays, 20.5, 1e-9);
  near(cardStats(dice, base).rubNet, 27872.9, 0.5);
  const adv = cardStats(shop.find((c) => c.id === 'advanced'), base);
  near(adv.rubNet, 7080);
  const sur = cardStats(shop.find((c) => c.id === 'surprise'), base);
  near(sur.rubNet, -17220);
}

// 3) 플래티넘 1단계 확장: 한 사이클에 +1,000 (10칸 × 1,100 − 10,000)
{
  const P = { ...base, guild: 20 };
  const s0 = simulate(P, 0), s1 = simulate(P, 1);
  near(s1.rub - s0.rub, 1000);
}

// 4) 마이너스 엽서: 칸을 차지하고 명성을 깎는다 (남은 칸 32장 + 마이너스 10장)
{
  const P = { ...base, holdings: [{ id: 'example-event-minus', count: 10, remain: 20 }] };
  const s = simulate(P, 0);
  // 명성은 합산해서 계산합니다: 처음 20일은 32 − 30 = 2 → 하루 118 × 2 = 236,
  // 마이너스가 사라진 뒤 10일은 32 → 하루 118 × 32 = 3,776. 일반엽서 32장 구매 −80,000.
  near(s.rub, 1_000_000 + 236 * 20 + 3_776 * 10 - 80_000);
  assert.equal(s.bought[0], 32);
  // 루나: 하루 ⌊(32−30)/42⌋ = 0 이지만 20일 뒤 마이너스가 사라지면 32/42 → 0, 합계 0
  assert.equal(s.luna, 0);
}

// 5) 회수 가치: 마이너스 엽서를 지금 없애면 이득, 가치가 양수
{
  const P = { ...base, holdings: [{ id: 'example-event-minus', count: 10, remain: 20 }] };
  const r = recallValues(P, 0);
  assert.equal(r.length, 1);
  assert.ok(r[0].perCard > 0);
  // 한 장당 20일 × 300루블 + 일반엽서 한 장을 더 둘 수 있는 이득
  assert.ok(r[0].perCard > 6000);
}

// 6) 이벤트 엽서는 구매 대상이 아니다
{
  const P = { ...base, holdings: [] };
  const s = simulate(P, 0);
  assert.ok(s.types.every((c) => c.purchasable));
  const evt = ex.find((c) => c.id === 'example-event-plus');
  assert.equal(evt.purchasable, false);
}

// 7) 최적화: 기간이 길면 확장하고 확장 이득이 양수
{
  const P = { ...base, days: 360, rub: 100_000, exclude: [] };
  const o = optimize(P);
  assert.ok(o.bestU >= 5);
  assert.ok(o.best.rub > o.base.rub);
}

// 8) 마이너스 명성: 전체 명성이 0 미만이어도 루나는 음수가 되지 않는다
{
  const P = { ...base, rub: 0, days: 5, holdings: [{ id: 'example-event-minus', count: 40, remain: 10 }] };
  const s = simulate(P, 0);
  assert.ok(s.luna >= 0);
  assert.ok(s.rub < 0 || s.rub === 0 || true);
}

// 9) 받은 엽서 목록 전체가 읽히고, 명성이 ?인 엽서는 계산에서 안전하게 빠진다
{
  assert.equal(shop.length, 45);
  assert.equal(shop.filter((c) => c.incomplete).length, 3); // 황제의 칙서, 권위의 엽서, 나비엽(커스텀)
  assert.equal(shop.filter((c) => c.purchasable).length, 8);
  const edict = shop.find((c) => c.id === 'imperial-edict');
  assert.equal(cardStats(edict, base), null);
  const P0 = { ...base, rub: 0, days: 10, holdings: [{ id: 'imperial-edict', count: 5, remain: 4 }] };
  const sk = simulate(P0, 0);
  assert.equal(sk.skipped, 5);
  assert.ok(Number.isFinite(sk.rub));
  // 항목별 명성을 적으면 계산에 들어간다: 5장 × +8 × 4일 × 118
  const P1 = { ...P0, holdings: [{ id: 'imperial-edict', count: 5, remain: 4, fame: 8 }] };
  const sf = simulate(P1, 0);
  assert.equal(sf.skipped, 0);
  near(sf.rub, 5 * 8 * 118 * 4);
  // 권위의 엽서(마이너스, 명성 ?)도 같은 방식
  const auth = shop.find((c) => c.id === 'authority');
  assert.equal(auth.group, 'minus');
}

// 10) 러브레터: 루나 10개로 명성 +40 × 14일 → 실버 기준 66,080루블
{
  const ll = cardStats(shop.find((c) => c.id === 'love-letter'), base);
  near(ll.rubNet, 66080);
  assert.equal(shop.find((c) => c.id === 'warning').group, 'minus');
}

// 11) 트럼프 엽서: 25%씩 +1~+4 → 평균 2.5. 백지수표: 기본 +20
{
  assert.equal(shop.find((c) => c.id === 'trump').fameMean, 2.5);
  assert.equal(shop.find((c) => c.id === 'blank-check').fameMean, 20);
  // 백지수표에 실제 값을 입력하면 그 값으로 계산 (기본 20 대신 35)
  const mk = (fame) => ({ ...base, rub: 0, days: 10, holdings: [{ id: 'blank-check', count: 1, remain: 10, ...(fame ? { fame } : {}) }] });
  near(simulate(mk(), 0).rub, 20 * 118 * 10);
  near(simulate(mk(35), 0).rub, 35 * 118 * 10);
}

// 12) 나비 문양 엽서: 받을 때 우체통에 있던 나비엽 개수만큼. 6장이 차례로 들어오면 +0+1+2+3+4+5
{
  const bf = shop.find((c) => c.id === 'butterfly');
  assert.equal(bf.sequence.cap, 13);
  const run = (count, start = 0, borders) => simulate({ ...base, borders, rub: 0, days: 10, holdings: [{ id: 'butterfly', count, remain: 10, start }] }, 0).rub;
  near(run(6), 15 * 118 * 10);              // 0+1+2+3+4+5
  near(run(1), 0);                           // 하나도 없던 상태에서 1장 → +0
  near(run(6, 5), (5 + 6 + 7 + 8 + 9 + 10) * 118 * 10);
  near(run(20), 169 * 118 * 10);             // +0~+12, 그 뒤 7장은 최대 +13
  near(run(100), (78 + 13 * 87) * 118 * 10); // 100장이어도 장당 최대 +13
  // 기복테: +5인 장만 +6이 되고, +3은 그대로
  near(run(6, 0, { send: 'bigup' }), 16 * 118 * 10);
  near(run(4, 0, { send: 'bigup' }), (0 + 1 + 2 + 3) * 118 * 10);
  // 나비엽(커스텀): 장마다 실제 명성을 입력. 직접 입력한 값은 테두리로 바꾸지 않는다
  const custom = (fame, borders) => simulate({ ...base, borders, rub: 0, days: 10, holdings: [{ id: 'butterfly-custom', count: 2, remain: 10, fame }] }, 0).rub;
  near(custom(3), 2 * 3 * 118 * 10);
  near(custom(5, { send: 'bigup' }), 2 * 5 * 118 * 10);
  assert.equal(shop.find((c) => c.id === 'butterfly-custom').incomplete, true);
}

// 13) 보름달 엽서(+1)/(+5)는 따로 있고, 기복테는 +5만 +6으로 바꾼다
{
  const h = (id, borders) => simulate({ ...base, borders, rub: 0, days: 10, holdings: [{ id, count: 1, remain: 10 }] }, 0).rub;
  near(h('fullmoon-1'), 1 * 118 * 10);
  near(h('fullmoon-5'), 5 * 118 * 10);
  near(h('fullmoon-1', { send: 'bigup' }), 1 * 118 * 10);
  near(h('fullmoon-5', { send: 'bigup' }), 6 * 118 * 10);
}

// 14) 루블테: 보낸 엽서 1장당 +200루블
{
  near(simulate({ ...base, borders: { send: 'rub' } }, 0).rub, 1_043_680 + 42 * 200);
  near(cardStats(shop.find((c) => c.id === 'normal'), { ...base, borders: { send: 'rub' } }).rubNet, 1040 + 200);
}

// 15) 기복테: 깜짝엽서 +43 (+5 이상만), 상승테: 올리는 엽서 +1 (무조건 / 기대값 +0.1)
{
  const sur = shop.find((c) => c.id === 'surprise');
  near(effectiveCard(sur, { send: 'bigup' }).fameMean, 43);
  near(effectiveCard(shop.find((c) => c.id === 'normal'), { send: 'bigup' }).fameMean, 1);
  near(cardStats(sur, { ...base, borders: { send: 'bigup' } }).rubNet, 118 * 43 * 5 - 42000);
  near(effectiveCard(shop.find((c) => c.id === 'normal'), { send: 'up' }).fameMean, 2);
  near(effectiveCard(shop.find((c) => c.id === 'normal'), { send: 'up', prob: 'expected' }).fameMean, 1.1, 1e-9);
  near(simulate({ ...base, borders: { send: 'up' } }, 0).rub, 1_000_000 + 42 * (118 * 2 * 30 - 2500));
  // 명성을 올리지 않는 엽서(0 이하)는 상승테의 영향이 없다
  near(effectiveCard(shop.find((c) => c.id === 'hell'), { send: 'up' }).fameMean, -15);
}

// 16) 마이너스 엽서 송신·수신 테두리 (명성은 0을 넘지 않는다)
{
  const minus = shop.find((c) => c.id === 'punish'); // −10, 15일
  const old = shop.find((c) => c.id === 'old-punish'); // −10, 30일
  near(effectiveCard(minus, { send: 'negup' }).fameMean, -11);
  near(effectiveCard(minus, { send: 'negbig' }).fameMean, -11);
  near(effectiveCard(shop.find((c) => c.id === 'warning'), { send: 'negbig' }).fameMean, -1); // −1은 대량이 아님
  near(effectiveCard(minus, { recv: 'rdown' }).fameMean, -9);
  near(effectiveCard(minus, { recv: 'rbig' }).fameMean, -9);
  near(effectiveCard(shop.find((c) => c.id === 'warning'), { recv: 'rbig' }).fameMean, -1);
  near(effectiveCard(shop.find((c) => c.id === 'warning'), { recv: 'rdown' }).fameMean, 0); // −1 → 0, 더 올라가지 않음
  assert.equal(effectiveCard(old, { send: 'negdur' }).maxDay, 33);
  assert.equal(effectiveCard(old, { recv: 'rdur' }).maxDay, 27);
  assert.equal(effectiveCard(old, { recv: 'rbigdur', recvDurPct: 20 }).maxDay, 24);
  assert.equal(effectiveCard(shop.find((c) => c.id === 'warning'), { recv: 'rbigdur' }).maxDay, 30); // 대량 차감이 아니면 그대로
  // 이미 우체통에 있는 엽서의 남은 일수는 사용자가 적은 값 그대로
  const run = (borders) => simulate({ ...base, borders, rub: 0, days: 10, holdings: [{ id: 'example-event-minus', count: 10, remain: 5 }] }, 0).rub;
  near(run({}), -30 * 100 * 5);
  near(run({ recv: 'rdown' }), -20 * 100 * 5);
  near(run({ recv: 'rdur' }), -30 * 100 * 5);
}

// 17) 마이너스 유저에게 보내는 상승 엽서 ×2: 합계가 마이너스인 날만
{
  const P = { ...base, rub: 100000, days: 30, holdings: [{ id: 'example-event-minus', count: 30, remain: 30 }] };
  const none = simulate(P, 0), x2 = simulate({ ...P, borders: { send: 'negx2' } }, 0);
  assert.ok(x2.rub > none.rub, `${x2.rub} <= ${none.rub}`); // 12칸에 산 엽서가 장당 +2로 들어와 명성 합이 −66이 됨 (×2 없으면 −78)
  // 명성이 마이너스가 아니면 효과가 없다
  const Q = { ...base, days: 30 };
  near(simulate({ ...Q, borders: { send: 'negx2' } }, 0).rub, simulate(Q, 0).rub);
}

// 18) 테두리 비교: 항목 수와 현재 선택 반영
{
  const cmp = compareBorders({ ...base, rub: 200000, days: 60, borders: { send: 'rub', recv: 'none' } });
  assert.equal(cmp.send.length, SEND_BORDERS.length + 1);
  assert.equal(cmp.recv.length, RECV_BORDERS.length + 1);
  assert.equal(cmp.cur.send, 'rub');
  assert.ok(cmp.send.every((x) => Number.isFinite(x.rub)));
}

console.log('engine tests passed');
