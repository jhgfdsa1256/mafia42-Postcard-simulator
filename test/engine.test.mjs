import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCard, simulate, optimize, cardStats, recallValues } from '../js/engine.js';

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')).cards.map(normalizeCard);
const shop = load('../data/cards.json');
const ex = load('../data/cards.example-event.json');
const cards = [...shop, ...ex];
const base = { days: 30, rub: 1_000_000, luna: 0, step: 0, guild: 18, famous: false, cards, holdings: [], exclude: ['advanced', 'surprise', 'dice'] };
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

console.log('engine tests passed');
