// 마피아42 엽서 최적화 엔진 (브라우저/Node 공용, 외부 의존성 없음)
//
// 규칙
// - 명성은 우체통 안 모든 엽서의 합입니다(마이너스 엽서는 합에서 빠집니다).
// - 합이 0 이상이면 명성 1당 하루 100루블 × (1 + 길드 버프 + 유명세), 합이 마이너스면 버프 없이 명성 1당 −100루블.
// - 루나는 하루 max(0, ⌊전체 명성 ÷ 42⌋)개.
// - 우체통은 42칸에서 시작, n단계로 올리는 데 n만 루블, 한 단계당 +10칸.
// - 엽서는 구매(또는 수령)한 날부터 지속 일수 동안 칸을 차지하고, 중간에 버릴 수 없습니다.
// - 이벤트 엽서는 구매할 수 없고, 현재 우체통에 들어 있는 경우(holdings)에만 등장합니다.
// - 송신·수신 테두리는 엽서의 명성·지속 일수를 바꾸거나(송신: 보낸 엽서, 수신: 받은 엽서) 루블을 더합니다.

export const GUILDS = [['우드', 16], ['브론즈', 17], ['실버', 18], ['골드', 19], ['플래티넘', 20], ['마스터', 21]];
export const FAMOUS_BONUS = 3;
export const RUBLE_BORDER_BONUS = 200;

/** 송신 테두리: 엽서를 보낼 때 적용. 한 번에 하나만 선택합니다. */
export const SEND_BORDERS = [
  { id: 'exp', name: '경험치 증가', desc: '엽서를 보낼 때 경험치 +10% (루블 계산에는 영향 없음)' },
  { id: 'rub', name: '루블테', desc: '엽서를 보낼 때 루블 획득 (엽서 1장당 +200루블)' },
  { id: 'up', name: '상승테', desc: '명성을 올리는 엽서의 상승량이 낮은 확률로 1 증가' },
  { id: 'negup', name: '차감 증가', desc: '명성을 깎는 엽서의 차감량이 낮은 확률로 1 증가' },
  { id: 'negdur', name: '차감 기간 증가', desc: '명성을 깎는 엽서의 지속 기간 +10%' },
  { id: 'negbig', name: '대량 차감 증가', desc: '−6 이상 차감하는 엽서의 차감량 1 증가' },
  { id: 'bigup', name: '기복테', desc: '+5 이상 올리는 엽서의 상승량 1 증가 (깜짝엽서는 +43)' },
  { id: 'negx2', name: '마이너스 유저 ×2', desc: '명성이 마이너스인 유저에게 보내는 상승 엽서의 상승량 ×2' },
];

/** 수신 테두리: 엽서를 받을 때 적용. 한 번에 하나만 선택합니다. */
export const RECV_BORDERS = [
  { id: 'rdown', name: '차감 감소', desc: '명성을 깎는 엽서의 차감량이 낮은 확률로 1 감소' },
  { id: 'rdur', name: '차감 기간 감소', desc: '명성을 깎는 엽서의 지속 기간 10% 감소' },
  { id: 'rbig', name: '대량 차감 감소', desc: '−6 이상 차감하는 엽서의 차감량 1 감소' },
  { id: 'rbigdur', name: '대량 차감 기간 감소', desc: '−6 이상 차감하는 엽서의 지속 기간 감소 (감소율은 직접 입력)' },
];

const sum = (a) => a.reduce((s, x) => s + x, 0);

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

/** 명성 분포를 [[값, 확률], ...]로 바꿉니다. 값이 정해지지 않았거나 순서형(sequence)이면 null. */
function parseFameDist(f) {
  if (f === null || f === undefined) return null;
  if (typeof f === 'number') return [[f, 1]];
  if (f.type === 'sequence') return null;
  if (f.type === 'fixed') return [[f.value, 1]];
  if (f.type === 'uniform') {
    const n = f.max - f.min + 1;
    return Array.from({ length: n }, (_, i) => [f.min + i, 1 / n]);
  }
  if (f.type === 'table') {
    const tot = sum(f.values.map((v) => v[1]));
    return f.values.map(([x, p]) => [x, p / tot]);
  }
  throw new Error('알 수 없는 fame 형식: ' + f.type);
}

/** cards.json의 항목 하나를 계산용 객체로 바꿉니다. */
export function normalizeCard(raw) {
  const days = parseDays(raw.days);
  const price = raw.price && raw.price.amount > 0 ? raw.price : null;
  // 순서형(나비 문양): 우체통에 이미 있던 같은 엽서 개수만큼, 최대 cap까지. 한 장마다 받을 때 정해지고 이후 바뀌지 않습니다.
  const sequence = raw.fame && raw.fame.type === 'sequence' ? { cap: raw.fame.cap ?? Infinity } : null;
  const fameDist = parseFameDist(raw.fame);
  const unknown = !sequence && !fameDist; // 명성이 아직 정해지지 않은 엽서(?)
  const fameMean = sequence ? sequence.cap : fameDist ? sum(fameDist.map(([f, p]) => f * p)) : NaN;
  return {
    id: raw.id,
    name: raw.name,
    image: raw.image || '',
    source: raw.source || 'shop',
    purchasable: raw.source === 'shop' && !!price,
    currency: price ? price.currency : null,
    price: price ? price.amount : 0,
    incomplete: unknown,
    sequence,
    askFame: !!raw.askFame,
    note: raw.note || '',
    group: unknown ? (raw.group === 'minus' ? 'minus' : 'plus') : (fameMean < 0 ? 'minus' : 'plus'),
    fameMean,
    fameDist,
    days,
    meanDays: sum(days.map((x) => x.d * x.p)),
    maxDay: Math.max(...days.map((x) => x.d)),
    random: days.length > 1,
  };
}

export function rateOf(P) {
  return 100 * (1 + (P.guild + (P.famous ? FAMOUS_BONUS : 0)) / 100);
}

/* ---------- 테두리 ---------- */

const sendOf = (B) => (B && B.send) || 'none';
const recvOf = (B) => (B && B.recv) || 'none';

/** 엽서 한 장의 명성 값을 테두리에 맞게 바꾸는 함수. prob가 'expected'면 확률 효과를 10%로 계산합니다(기본은 무조건 적용). */
export function fameTransform(B) {
  const q = B && B.prob === 'expected' ? 0.1 : 1;
  const s = sendOf(B), r = recvOf(B);
  return (f) => {
    let v = f;
    if (s === 'up' && v > 0) v += q;
    else if (s === 'negup' && v < 0) v -= q;
    else if (s === 'negbig' && v <= -6) v -= 1;
    else if (s === 'bigup' && v >= 5) v += 1;
    if (r === 'rdown' && v < 0) v = Math.min(0, v + q);
    else if (r === 'rbig' && v <= -6) v = Math.min(0, v + 1);
    return v;
  };
}

function daysTransform(B, fameMean) {
  const neg = fameMean < 0, big = fameMean <= -6;
  let m = 1;
  if (sendOf(B) === 'negdur' && neg) m *= 1.1;
  if (recvOf(B) === 'rdur' && neg) m *= 0.9;
  if (recvOf(B) === 'rbigdur' && big) m *= 1 - (B.recvDurPct ?? 10) / 100;
  return (d) => Math.max(1, Math.round(d * m));
}

/** 테두리를 적용한 엽서. 사용자가 직접 입력한 값(typed)은 바꾸지 않습니다. */
export function effectiveCard(c, B) {
  if (!B || c.typed) return c;
  if (sendOf(B) === 'none' && recvOf(B) === 'none') return c;
  const tf = fameTransform(B);
  let { fameMean, fameDist } = c;
  if (c.fameDist) {
    fameDist = c.fameDist.map(([f, p]) => [tf(f), p]);
    fameMean = sum(fameDist.map(([f, p]) => f * p));
  }
  const dt = daysTransform(B, fameMean);
  const merged = new Map();
  c.days.forEach((x) => { const d = dt(x.d); merged.set(d, (merged.get(d) || 0) + x.p); });
  const days = [...merged].map(([d, p]) => ({ d, p }));
  return {
    ...c, fameMean, fameDist, days,
    meanDays: sum(days.map((x) => x.d * x.p)),
    maxDay: Math.max(...days.map((x) => x.d)),
    random: days.length > 1,
  };
}

const bonusOf = (B) => (sendOf(B) === 'rub' ? RUBLE_BORDER_BONUS : 0);

/** 순서형 엽서 묶음의 평균 명성: 앞서 start장이 있고 count장이 차례로 들어올 때 (+start, +start+1, …, 최대 cap) */
export function sequenceMean(cap, start, count, tf = (f) => f) {
  let s = 0;
  for (let i = 0; i < count; i++) s += tf(Math.min(cap, start + i));
  return count > 0 ? s / count : 0;
}

const meanEff = (c, r) => sum(c.days.map((x) => x.p * Math.min(x.d, r)));

/**
 * 하루 단위 시뮬레이션 (기대값 방식).
 * P: { days, rub, luna, step, guild, famous, borders?, cards:[normalized], holdings:[{id,count,remain,fame?,start?}], exclude?:[id] }
 * targetU: 확장하려는 목표 단계
 */
export function simulate(P, targetU, rec = false) {
  const D = P.days;
  const B = P.borders || {};
  const rate = rateOf(P);
  const lossRate = P.negBuff ? rate : 100;
  const income = (F) => (F >= 0 ? rate * F : lossRate * F);
  const bonus = bonusOf(B);
  const tf = fameTransform(B);
  const cardsE = P.cards.map((c) => effectiveCard(c, B));
  const byId = new Map(cardsE.map((c) => [c.id, c]));
  const exclude = new Set(P.exclude || []);
  const buyList = cardsE.filter((c) => c.purchasable && c.fameMean > 0 && !exclude.has(c.id));

  const types = [];
  const idx = new Map();
  const typeOf = (c) => {
    if (!idx.has(c.id)) { idx.set(c.id, types.length); types.push(c); }
    return idx.get(c.id);
  };
  buyList.forEach(typeOf);
  // 명성이 마이너스인 유저에게 보내는 엽서는 상승량 ×2: 합계가 마이너스인 날에는 ×2 판으로 산다
  const x2 = sendOf(B) === 'negx2';
  const variant = new Map();
  if (x2) buyList.forEach((c) => { const v = { ...c, id: c.id + '#x2', fameMean: c.fameMean * 2 }; variant.set(c.id, v); typeOf(v); });

  // 우체통에 있는 엽서. h.fame이 있으면 그 값을 쓰고, 순서형은 h.start부터 차례로 계산하며, 값이 없으면 계산에서 뺍니다.
  const holdings = [];
  let skipped = 0;
  (P.holdings || []).forEach((h, j) => {
    const c = byId.get(h.id);
    if (!c || !(h.count > 0) || !(h.remain > 0)) return;
    let ct = c;
    if (Number.isFinite(h.fame)) {
      ct = { ...c, id: c.id + '#' + j, fameMean: h.fame, incomplete: false, sequence: null };
    } else if (c.sequence) {
      const mean = sequenceMean(c.sequence.cap, Math.max(0, Math.floor(h.start || 0)), h.count, tf);
      ct = { ...c, id: c.id + '#' + j, fameMean: mean, sequence: null };
    }
    if (!Number.isFinite(ct.fameMean)) { skipped += h.count; return; }
    holdings.push({ h, c: ct });
  });
  holdings.forEach(({ c }) => typeOf(c));

  const T = types.length;
  const maxd = Math.max(1, ...types.map((c) => c.maxDay));
  const exp = Array.from({ length: D + maxd + 2 }, () => new Array(T).fill(0));
  let N = 0, F = 0;
  holdings.forEach(({ h, c }) => {
    const i = idx.get(c.id);
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
    let boughtToday = false;
    const r = D - t;
    const negToday = x2 && F < 0;
    const ev = buyList.map((c0) => {
      const c = negToday ? variant.get(c0.id) : c0;
      const eff = meanEff(c, r);
      const rn = rate * c.fameMean * eff - (c.currency === '루블' ? c.price : 0) + bonus;
      return { i: idx.get(c.id), c, eff, rn, sd: rn / eff };
    }).filter((e) => e.rn > 0).sort((a, b) => b.sd - a.sd);

    let free = Math.max(0, Math.floor(42 + 10 * step - N + 1e-9));

    const applyBuy = (e, k) => {
      const c = e.c;
      if (c.currency === '루블') rub -= k * c.price; else luna -= k * c.price;
      rub += bonus * k; // 루블테: 모든 판정 이후 보낸 엽서 1장당 루블 획득
      for (const x of c.days) exp[t + x.d][e.i] += k * x.p;
      N += k; F += k * c.fameMean; free -= k; bought[e.i] += k; boughtToday = true;
      if (t === 0) {
        const ex = today.find((x) => x.name === c.name);
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
    if (rec) tl.push({ day: t, step, slots: 42 + 10 * step, N, F, rub: Math.round(rub), luna, up: ups.some((u) => u.day === t), buy: boughtToday });
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
  return { rub, luna, step, ups, today, tl, bought, types, skipped };
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

/** 엽서 한 장 기준 효율. perSlotDay는 칸 하나를 하루 차지할 때의 루블 순수익(테두리 적용). */
export function cardStats(c0, P) {
  const c = effectiveCard(c0, P.borders);
  if (!Number.isFinite(c.fameMean) || c.sequence) return null; // 명성 미정이거나 받는 순서에 따라 달라짐
  const rate = rateOf(P);
  const lossRate = P.negBuff ? rate : 100;
  const r = c.fameMean >= 0 ? rate : lossRate;
  const gain = r * c.fameMean * c.meanDays;
  const bonus = c.purchasable ? bonusOf(P.borders) : 0;
  const rubNet = gain - (c.currency === '루블' ? c.price : 0) + bonus;
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
    const c0 = P.cards.find((x) => x.id === h.id);
    if (!c0 || !(h.count > 0)) return;
    const c = effectiveCard(c0, P.borders);
    const fame = Number.isFinite(h.fame) ? h.fame : c.fameMean;
    if (!Number.isFinite(fame)) return;
    const rest = P.holdings.filter((_, k) => k !== j);
    const alt = simulate({ ...P, holdings: rest }, targetU).rub;
    out.push({ index: j, id: h.id, name: c0.name, count: h.count, remain: h.remain, fame, total: alt - baseRub, perCard: (alt - baseRub) / h.count });
  });
  return out;
}

/** 송신·수신 테두리를 하나씩 바꿔 가며 최종 루블을 비교합니다 (다른 쪽 선택은 그대로 둡니다). */
export function compareBorders(P) {
  const cur = { send: sendOf(P.borders), recv: recvOf(P.borders) };
  const run = (send, recv) => {
    const o = optimize({ ...P, borders: { ...P.borders, send, recv } });
    return { rub: o.best.rub, luna: o.best.luna, step: o.best.step };
  };
  const send = [{ id: 'none', name: '선택 안 함' }, ...SEND_BORDERS].map((b) => ({ id: b.id, name: b.name, ...run(b.id, cur.recv) }));
  const recv = [{ id: 'none', name: '선택 안 함' }, ...RECV_BORDERS].map((b) => ({ id: b.id, name: b.name, ...run(cur.send, b.id) }));
  return { cur, send, recv };
}
