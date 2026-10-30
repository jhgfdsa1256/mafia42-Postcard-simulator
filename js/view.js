// 화면 문자열을 만드는 순수 함수 모음 (DOM에 의존하지 않아 Node에서도 테스트할 수 있습니다)
import { cardStats, SEND_BORDERS, RECV_BORDERS } from './engine.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
export const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('ko-KR');
export const sg = (n) => (Math.round(n) > 0 ? '+' : '') + fmt(n);
const cls = (n) => (Math.round(n) > 0 ? 'ok' : Math.round(n) < 0 ? 'bad' : '');

/** 엽서 이미지. 파일이 없으면 이름 첫 글자가 보입니다. */
export function thumb(c) {
  const initial = esc((c && c.name ? c.name : '?').trim().charAt(0));
  const img = c && c.image ? `<img src="${esc(encodeURI(c.image))}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<span class="thumb"><b>${initial}</b>${img}</span>`;
}

export function fameText(c) {
  const d = c.random ? `${c.days[0].d}~${c.maxDay}일` : `${c.maxDay}일`;
  if (c.sequence) return `명성 +앞서 받은 개수만큼 (최대 ${c.sequence.cap}) · ${d}`;
  if (!Number.isFinite(c.fameMean)) return `명성 ? (입력 필요) · ${d}`;
  const f = Math.round(c.fameMean * 100) / 100;
  return `명성 ${f > 0 ? '+' : ''}${f}${c.random ? ' (평균)' : ''} · ${d}`;
}

export function priceText(c) {
  return c.purchasable ? `${fmt(c.price)} ${c.currency}` : '구매 불가';
}

const nameOf = (list, id) => (list.find((b) => b.id === id) || {}).name;
export function borderLabel(B) {
  const s = B && B.send && B.send !== 'none' ? nameOf(SEND_BORDERS, B.send) : null;
  const r = B && B.recv && B.recv !== 'none' ? nameOf(RECV_BORDERS, B.recv) : null;
  return (s ? `송신 ${s}` : '송신 없음') + ' / ' + (r ? `수신 ${r}` : '수신 없음');
}

export function renderBorderCompare(cmp) {
  const table = (title, list, cur) => {
    const base = list.find((x) => x.id === cur) || list[0];
    const best = Math.max(...list.map((x) => x.rub));
    let h = `<h3>${title}</h3><div class="scroll"><table><tr><th>테두리</th><th>최종 루블</th><th>현재 선택 대비</th></tr>`;
    list.forEach((x) => {
      h += `<tr${x.rub === best ? ' class="best"' : ''}><td>${esc(x.name)}${x.id === cur ? ' (현재)' : ''}${x.rub === best ? ' ★' : ''}</td><td>${fmt(x.rub)}</td><td class="${cls(x.rub - base.rub)}">${sg(x.rub - base.rub)}</td></tr>`;
    });
    return h + '</table></div>';
  };
  return '<h2>테두리 비교</h2><div class="box">'
    + table('송신 테두리', cmp.send, cmp.cur.send) + table('수신 테두리', cmp.recv, cmp.cur.recv)
    + '<p class="sub">★은 가장 높은 항목입니다. 한쪽을 바꿀 때 다른 쪽 선택은 그대로 둡니다. 송신 테두리 중 루블테를 뺀 효과는 교환 상대도 같은 테두리를 쓴다고 가정한 값입니다.</p></div>';
}


const dayLabel = (d) => (d === 0 ? '오늘' : d + '일');

/** 보유 루블 꺾은선 그래프. 아래 날짜는 우체통 확장 또는 엽서 구매가 있었던 날만 표시합니다. */
export function rubChart(tl) {
  if (!tl || tl.length < 2) return '<span class="mut">표시할 데이터가 없습니다.</span>';
  const ev = tl.filter((x) => x.up || x.buy);
  const H = 240, padL = 62, padR = 16, padT = 14, padB = 46;
  const W = Math.max(640, padL + padR + Math.max(tl.length * 3, ev.length * 16));
  const maxD = tl[tl.length - 1].day || 1;
  const vals = tl.map((x) => x.rub);
  let lo = Math.min(0, ...vals), hi = Math.max(...vals);
  if (hi === lo) hi = lo + 1;
  const X = (d) => padL + ((W - padL - padR) * d) / maxD;
  const Y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo));
  const compact = (n) => (Math.abs(n) >= 100000000 ? fmt1(n / 100000000) + '억' : Math.abs(n) >= 10000 ? fmt1(n / 10000) + '만' : fmt(n));
  let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="보유 루블 추이">`;
  for (let k = 0; k <= 4; k++) {
    const v = lo + ((hi - lo) * k) / 4, y = Y(v);
    s += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" class="grid"/><text x="${padL - 6}" y="${y + 4}" text-anchor="end" class="ax">${compact(v)}</text>`;
  }
  s += `<polyline class="ln" points="${tl.map((x) => X(x.day).toFixed(1) + ',' + Y(x.rub).toFixed(1)).join(' ')}"/>`;
  ev.forEach((x) => {
    const cx = X(x.day).toFixed(1), cy = Y(x.rub).toFixed(1);
    s += `<circle cx="${cx}" cy="${cy}" r="${x.up ? 4 : 2.5}" class="${x.up ? 'dup' : 'dbuy'}"><title>${dayLabel(x.day)} · ${fmt(x.rub)} 루블${x.up ? ' · 우체통 확장' : ''}${x.buy ? ' · 엽서 구매' : ''}</title></circle>`;
    s += `<text transform="translate(${cx},${H - padB + 12}) rotate(-60)" text-anchor="end" class="ax${x.up ? ' upx' : ''}">${dayLabel(x.day)}</text>`;
  });
  s += '</svg>';
  return '<div class="scroll">' + s + '</div><p class="sub">아래 날짜는 우체통을 확장했거나(큰 점) 엽서를 산(작은 점) 날만 표시합니다. 값은 그날 구매·확장을 마친 뒤, 수입을 받기 전 보유 루블입니다.</p>';
}

/** 우체통 확장 예상 일정 표 */
export function upgradeTable(ups) {
  if (!ups || !ups.length) return '<span class="mut">확장하지 않는 것이 최선입니다.</span>';
  let h = '<div class="scroll win-tbl"><table><tr><th>시점</th><th>현재 칸수</th><th>다음 칸수</th><th>필요 루블</th><th>소요 시간</th></tr>';
  let prev = 0;
  ups.forEach((u, i) => {
    const gap = u.day - prev;
    h += `<tr><td>${dayLabel(u.day)}${u.day === 0 ? '' : '째'}</td><td>${42 + 10 * (u.step - 1)}</td><td>${42 + 10 * u.step}</td><td>${fmt(u.cost)}</td><td>${i === 0 ? (gap === 0 ? '지금 바로' : `지금부터 ${gap}일`) : (gap === 0 ? '같은 날' : `직전 확장 후 ${gap}일`)}</td></tr>`;
    prev = u.day;
  });
  return h + '</table></div>';
}

function statsTable(P) {
  const shop = P.cards.filter((c) => c.purchasable);
  const rubShop = shop.map((c) => ({ c, s: cardStats(c, P) })).filter((x) => x.s && x.c.currency === '루블' && x.s.rubNet > 0);
  const baseSd = rubShop.length ? Math.max(...rubShop.map((x) => x.s.perSlotDay)) : 0;
  let h = '<h2>엽서별 효율</h2><div class="box scroll"><table><tr><th>엽서</th><th>가격</th><th>순수익(루블)</th><th>순루나</th><th>칸 기회비용 반영</th></tr>';
  P.cards.forEach((c) => {
    const s = cardStats(c, P);
    const tags = (c.source === 'event' ? ' <em>이벤트</em>' : '') + (c.group === 'minus' ? ' <em>마이너스</em>' : '');
    if (!s) {
      h += `<tr class="mut"><td class="l">${thumb(c)} ${esc(c.name)}${tags}</td><td>${priceText(c)}</td><td colspan="3" class="c">${c.sequence ? '받는 순서에 따라 달라집니다' : '명성 값을 입력하면 계산됩니다'}</td></tr>`;
      return;
    }
    const vs = s.rubNet - baseSd * c.meanDays;
    const off = (P.exclude || []).includes(c.id);
    h += `<tr class="${off ? 'mut' : ''}"><td class="l">${thumb(c)} ${esc(c.name)}${tags}${off ? ' (제외)' : ''}</td>`
      + `<td>${priceText(c)}</td><td class="${cls(s.rubNet)}">${sg(s.rubNet)}</td>`
      + `<td class="${cls(s.lunaNet)}">${s.lunaNet > 0 ? '+' : ''}${fmt1(s.lunaNet)}</td>`
      + `<td class="${cls(vs)}">${sg(vs)}</td></tr>`;
  });
  h += '</table><p class="sub">순수익은 엽서 한 장의 평균값입니다. "칸 기회비용 반영"은 같은 칸에 가장 좋은 루블 엽서를 둘 때와 비교한 이득이고, 양수면 받을 만한 엽서입니다.</p></div>';
  return h;
}

function recallSection(recall) {
  const neg = recall.filter((r) => r.fame < 0 && r.perCard > 0).sort((a, b) => b.perCard - a.perCard);
  if (!neg.length) return '';
  let h = '<h2>회수 요청 우선순위</h2><div class="box"><p class="sub">마이너스 엽서를 지금 없앨 수 있다면 최종 루블이 얼마나 늘어나는지입니다. 위에 있을수록 먼저 회수를 부탁하세요.</p><ul>';
  neg.forEach((r) => { h += `<li><b>${esc(r.name)}</b> (남은 ${r.remain}일, ${fmt(r.count)}장) — 한 장당 <span class="ok">${sg(r.perCard)} 루블</span></li>`; });
  return h + '</ul></div>';
}

export function renderResults(P, R, recall) {
  const B = R.best, Z = R.base;
  const gain = B.rub - Z.rub;
  let h = '';
  if (B.skipped > 0) h += `<div class="box bad">명성 값이 없어 계산에서 뺀 엽서가 ${fmt(B.skipped)}장 있습니다. 우체통 목록에서 해당 엽서의 "명성" 칸을 채워 주세요.</div>`;
  h += statsTable(P);

  const cur = 42 + 10 * P.step, tgt = 42 + 10 * B.step;
  h += `<h2>최적 계획 (${P.days}일)</h2><div class="box"><div class="big">현재 우체통 ${cur}칸 → 목표 ${tgt}칸${tgt > cur ? ` (+${tgt - cur}칸)` : ' (확장 없음)'}</div>`
    + `<div>기간 종료 시 <b>${fmt(B.rub)} 루블 · ${fmt(B.luna)} 루나</b></div>`
    + `<div class="mut">적용 테두리: ${esc(borderLabel(P.borders))}</div>`
    + `<div class="mut">확장 없이 현재 ${cur}칸 유지: ${fmt(Z.rub)} 루블 · ${fmt(Z.luna)} 루나 → 확장 이득 <span class="${cls(gain)}">${sg(gain)} 루블</span></div></div>`;

  h += '<h2>오늘의 추천</h2><div class="box">';
  const upToday = B.ups.filter((u) => u.day === 0);
  if (B.today.length || upToday.length) {
    h += '<ul class="flat">';
    B.today.forEach((t) => { h += `<li>${esc(t.name)} <b>${fmt(t.k)}장</b> 구매 (${fmt(t.cost)} ${t.currency})</li>`; });
    upToday.forEach((u) => { h += `<li>우체통 ${42 + 10 * u.step}칸으로 확장 (${fmt(u.cost)} 루블)</li>`; });
    h += '</ul>';
  } else h += '<span class="mut">오늘 살 수 있는 이득 엽서가 없습니다 (빈 칸이 없거나 자금이 부족).</span>';
  h += '</div>';

  h += recallSection(recall);

  h += '<h2>보유 루블 추이</h2><div class="box">' + rubChart(B.tl) + '</div>';
  h += '<h2>우체통 확장 예상 일정</h2><div class="box">' + upgradeTable(B.ups) + '</div>';

  h += '<h2>목표 칸수별 비교 (현재 우체통에서 시작)</h2><div class="box scroll"><table><tr><th>목표 칸수</th><th>최종 루블</th><th>최종 루나</th><th>최선 대비</th></tr>';
  const cand = R.res.filter((x) => x.u <= R.bestU);
  const picks = new Set([0, cand.length - 1]);
  for (let k = 1; k < 7; k++) picks.add(Math.round((k * (cand.length - 1)) / 7));
  [...picks].sort((a, b) => a - b).forEach((i) => {
    const x = cand[i];
    h += `<tr${x.u === R.bestU ? ' class="best"' : ''}><td>${42 + 10 * x.u}${x.u === P.step ? ' (현재 · 확장 없음)' : ''}${x.u === R.bestU ? ' (최적)' : ''}</td><td>${fmt(x.rub)}</td><td>${fmt(x.luna)}</td><td>${sg(x.rub - B.rub)}</td></tr>`;
  });
  h += '</table><p class="sub">최적 칸수를 넘는 목표는 남은 기간 안에 비용을 회수하지 못해 사지 않으므로 결과가 같습니다.</p></div>';

  h += '<h2>일별 추이</h2><div class="box"><div class="scroll win-tbl"><table><tr><th>일</th><th>칸수</th><th>사용 중</th><th>명성 합</th><th>루블</th><th>루나</th></tr>';
  B.tl.forEach((x) => {
    h += `<tr${x.up ? ' class="best"' : ''}><td>${x.day === 0 ? '오늘' : x.day + '일째'}${x.up ? ' · 확장' : ''}</td><td>${x.slots}</td><td>${fmt(x.N)}</td><td class="${cls(x.F)}">${fmt(x.F)}</td><td>${fmt(x.rub)}</td><td>${fmt(x.luna)}</td></tr>`;
  });
  h += '</table></div><p class="sub">매일 그날의 구매·확장을 판단해서 계산합니다. 표의 수치는 그날 구매·확장을 마친 뒤, 그날 수입을 받기 전 값이고, 확장한 날은 색으로 표시됩니다.</p></div>';

  h += '<div class="box"><b>기간 중 구매 합계</b><ul>';
  const tot = new Map();
  B.types.forEach((c, i) => { if (B.bought[i] > 0) tot.set(c.name, (tot.get(c.name) || 0) + B.bought[i]); });
  tot.forEach((k, name) => { h += `<li>${esc(name)}: ${fmt(k)}장</li>`; });
  if (!tot.size) h += '<li class="mut">구매 없음</li>';
  h += '</ul></div>';

  h += '<p class="sub">가정: 칸이 비는 날 바로 다시 구매하고, 이득이 없는 엽서는 사지 않습니다. 확률 엽서(주사위 등)는 기대값으로 계산하므로 실제 결과는 운에 따라 달라집니다. 명성은 우체통 전체의 합으로 계산하고, 합이 마이너스면 버프 없이 −100루블씩 깎입니다.</p>';
  return h;
}
