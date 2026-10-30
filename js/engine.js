// 마피아42 엽서 최적화 엔진 (브라우저/Node 공용, 외부 의존성 없음)
//
// 규칙
// - 명성은 우체통 안 모든 엽서의 합입니다(마이너스 엽서는 합에서 빠집니다).
// - 합이 0 이상이면 명성 1당 하루 100루블 × (1 + 길드 버프 + 유명세), 합이 마이너스면 버프 없이 명성 1당 −100루블.
// - 루나는 하루 max(0, ⌊전체 명성 ÷ 42⌋)개.
// - 우체통은 42칸에서 시작, n단계로 올리는 데 n만 루블, 한 단계당 +10칸.
// - 엽서는 구매(또는 수령)한 날부터 지속 일수 동안 칸을 차지하고, 중간에 버릴 수 없습니다.
// - 이벤트 엽서는 구매할 수 없고, 현재 우체통에 들어 있는 경우(holdings)에만 등장합니다.

export const GUILDS = [['우드', 16], ['브론즈', 17], ['실버', 18], ['골드', 19], ['플래티넘', 20], ['마스터', 21]];
export const FAMOUS_BONUS = 3;

const sum = (a) => a.reduce((s, x) => s + x, 0);

function parseFame(f) {
  if (typeof f === 'number') return f;
  if (f.type === 'fixed') return f.value;
  if (f.type === 'uniform') return (f.min + f.max) / 2;
  if (f.type === 'table') {
    const tot = sum(f.values.map((v) => v[1]));
    return sum(f.values.map(([x, p]) => x * p)) / tot;
  }
  throw new Error('알 수 없는 fame 형식: ' + f.type);
}

function parseDays(d) {
  if (typeof d === 'number') return [{ d, p: 1 }];
  if (d.type === 'fixed') return [{ d: d.value, p: 1 }];
  if (d.type === 'uniform') {
    const n = d.max - d.min + 1;
    return Array.from({ length: n }, (_, i) => ({ d: d.min + i, p: 1 / n }));
  }
  if (d.type === 'table') {
    const tot = sum(d.values.map((v) => v[1]));
    return d.values.map(([x, p]) => ({ d: x, p: p / tot }));
  }
  throw new Error('알 수 없는 days 형식: ' + d.type);
}

/** cards.json의 항목 하나를 계산용 객체로 바꿉니다. */
export function normalizeCard(raw) {
  const days = parseDays(raw.days);
  const price = raw.price && raw.price.amount > 0 ? raw.price : null;
  return {
    id: raw.id,
    name: raw.name,
    image: raw.image || '',
    source: raw.source || 'shop',
    purchasable: raw.source === 'shop' && !!price,
    currency: price ? price.currency : null,
    price: price ? price.amount : 0,
    fameMean: parseFame(raw.fame),
    days,
    meanDays: sum(days.map((x) => x.d * x.p)),
    maxDay: Math.max(...days.map((x) => x.d)),
    random: days.length > 1,
  };
}

export function rateOf(P) {
  return 100 * (1 + (P.guild + (P.famous ? FAMOUS_BONUS : 0)) / 100);
}

const meanEff = (c, r) => sum(c.days.map((x) => x.p * Math.min(x.d, r)));

/**
 * 하루 단위 시뮬레이션 (기대값 방식).
 * P: { days, rub, luna, step, guild, famous, negBuff?, cards:[normalized], holdings:[{id,count,remain}], exclude?:[id] }
 * targetU: 확장하려는 목표 단계
 */
export function simulate(P, targetU, rec = false) {
  const D = P.days;
  const rate = rateOf(P);
  const lossRate = P.negBuff ? rate : 100;
  const income = (F) => (F >= 0 ? rate * F : lossRate * F);
  const byId = new Map(P.cards.map((c) => [c.id, c]));
  const exclude = new Set(P.exclude || []);
  const buyList = P.cards.filter((c) => c.purchasable && c.fameMean > 0 && !exclude.has(c.id));

  const types = [];
  const idx = new Map();
  const typeOf = (c) => {
    if (!idx.has(c.id)) { idx.set(c.id, types.length); types.push(c); }
    return idx.get(c.id);
  };
  buyList.forEach(typeOf);
  const holdings = (P.holdings || []).filter((h) => byId.has(h.id) && h.count > 0 && h.remain > 0);
  holdings.forEach((h) => typeOf(byId.get(h.id)));

  const T = types.length;
  const maxd = Math.max(1, ...types.map((c) => c.maxDay));
  const exp = Array.from({ length: D + maxd + 2 }, () => new Array(T).fill(0));
  let N = 0, F = 0;
  holdings.forEach((h) => {
    const c = byId.get(h.id), i = idx.get(c.id);
    exp[Math.min(Math.floor(h.remain), D + maxd)][i] += h.count;
    N += h.count; F += h.count * c.fameMean;
  });

  let rub = P.rub, luna = P.luna, step = P.step;
  const ups = [], today = [], tl = [], bought = new Array(T).fill(0);

  for (let t = 0; t < D; t++) {
    for (let i = 0; i < T; i++) {
      const k = exp[t][i];
      if (k) { N -= k; F -= k * types[i].fameMean; }
    }
    const r = D - t;
    const ev = buyList.map((c) => {
      const eff = meanEff(c, r);
      const rn = rate * c.fameMean * eff - (c.currency === '루블' ? c.price : 0);
      return { i: idx.get(c.id), c, eff, rn, sd: rn / eff };
    }).filter((e) => e.rn > 0).sort((a, b) => b.sd - a.sd);

    let free = Math.max(0, Math.floor(42 + 10 * step - N + 1e-9));

    const applyBuy = (e, k) => {
      const c = e.c;
      if (c.currency === '루블') rub -= k * c.price; else luna -= k * c.price;
      for (const x of c.days) exp[t + x.d][e.i] += k * x.p;
      N += k; F += k * c.fameMean; free -= k; bought[e.i] += k;
      if (t === 0) {
        const ex = today.find((x) => x.id === c.id);
        if (ex) { ex.k += k; ex.cost += k * c.price; }
        else today.push({ id: c.id, name: c.name, k, currency: c.currency, cost: k * c.price });
      }
    };

    const buyCards = () => {
      if (free <= 0) return;
      // 루나 엽서: 같은 칸에 가장 좋은 루블 엽서를 둘 때보다 얼마나 더 버는지(한계 이득)로 평가
      const baseEv = ev.find((e) => e.c.currency === '루블');
      const baseSd = baseEv ? baseEv.sd : 0;
      const L = ev.filter((e) => e.c.currency === '루나')
        .map((e) => ({ e, p: e.c.price, m: e.rn - baseSd * e.eff })).filter((x) => x.m > 0);
      if (L.length && luna > 0) {
        const ks = new Array(L.length).fill(0);
        let lu = luna, fr = free;
        const order = L.map((_, j) => j).sort((a, b) => (L[b].m / L[b].p) - (L[a].m / L[a].p));
        let changed = true, guard = 0;
        while (changed && guard++ < 3000) {
          changed = false;
          for (const j of order) {
            const k = Math.min(fr, Math.floor(lu / L[j].p));
            if (k > 0) { ks[j] += k; lu -= k * L[j].p; fr -= k; changed = true; }
          }
          for (let a = 0; a < L.length; a++) {
            if (ks[a] <= 0) continue;
            for (let b = 0; b < L.length; b++) {
              if (a !== b && L[b].m > L[a].m + 1e-9 && lu + L[a].p - L[b].p >= 0 && ks[a] > 0) {
                ks[a]--; ks[b]++; lu += L[a].p - L[b].p; changed = true;
              }
            }
          }
        }
        L.forEach((x, j) => { if (ks[j] > 0) applyBuy(x.e, ks[j]); });
      }
      for (const e of ev) {
        if (free <= 0) break;
        if (e.c.currency !== '루블') continue;
        const k = Math.min(free, Math.floor(rub / e.c.price));
        if (k > 0) applyBuy(e, k);
      }
    };

    buyCards();
    if (free <= 0 && ev.length) {
      const base = ev.find((e) => e.c.currency === '루블') || ev[0];
      while (step < targetU) {
        const cost = 10000 * (step + 1);
        if (rub >= cost && r * 10 * base.sd > cost) {
          rub -= cost; step++; free += 10; ups.push({ day: t, step, cost });
          buyCards();
          if (free > 0) break;
        } else break;
      }
    }
    if (rec && t % 30 === 0) tl.push({ day: t, step, slots: 42 + 10 * step, N, F, rub: Math.round(rub), luna });
    rub += income(F);
    luna += Math.max(0, Math.floor(F / 42));
  }
  if (rec) {
    for (let i = 0; i < T; i++) {
      const k = exp[D][i];
      if (k) { N -= k; F -= k * types[i].fameMean; }
    }
    tl.push({ day: D, step, slots: 42 + 10 * step, N, F, rub: Math.round(rub), luna });
  }
  return { rub, luna, step, ups, today, tl, bought, types };
}

/** 목표 단계를 바꿔 가며 최종 루블이 가장 큰 계획을 찾습니다. */
export function optimize(P) {
  let best = null, non = 0;
  const res = [];
  for (let u = P.step; u <= P.step + 400; u++) {
    const s = simulate(P, u, false);
    res.push({ u, rub: s.rub, luna: s.luna, step: s.step });
    if (!best || s.rub > best.rub + 1e-6) { best = { u, rub: s.rub }; non = 0; }
    else if (++non > 40) break;
  }
  return { bestU: best.u, best: simulate(P, best.u, true), base: simulate(P, P.step, true), res };
}

/** 엽서 한 장 기준 효율. perSlotDay는 칸 하나를 하루 차지할 때의 루블 순수익. */
export function cardStats(c, P) {
  const rate = rateOf(P);
  const lossRate = P.negBuff ? rate : 100;
  const r = c.fameMean >= 0 ? rate : lossRate;
  const gain = r * c.fameMean * c.meanDays;
  const rubNet = gain - (c.currency === '루블' ? c.price : 0);
  const lunaGain = (c.fameMean * c.meanDays) / 42;
  const lunaNet = lunaGain - (c.currency === '루나' ? c.price : 0);
  return { gain, rubNet, lunaGain, lunaNet, perSlotDay: c.meanDays > 0 ? rubNet / c.meanDays : 0 };
}

/**
 * 지금 우체통에 있는 엽서를 지금 회수(제거)했을 때 최종 루블이 얼마나 느는지.
 * 보낸 사람에게 회수를 부탁할 엽서의 우선순위를 정할 때 씁니다.
 */
export function recallValues(P, targetU) {
  const baseRub = simulate(P, targetU).rub;
  const out = [];
  (P.holdings || []).forEach((h, j) => {
    const c = P.cards.find((x) => x.id === h.id);
    if (!c || !(h.count > 0)) return;
    const rest = P.holdings.filter((_, k) => k !== j);
    const alt = simulate({ ...P, holdings: rest }, targetU).rub;
    out.push({ index: j, id: h.id, name: c.name, count: h.count, remain: h.remain, fame: c.fameMean, total: alt - baseRub, perCard: (alt - baseRub) / h.count });
  });
  return out;
}
