// 화면 문자열을 만드는 순수 함수 모음 (DOM에 의존하지 않아 Node에서도 테스트할 수 있습니다)
import { cardStats } from './engine.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
export const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('ko-KR');
export const sg = (n) => (Math.round(n) > 0 ? '+' : '') + fmt(n);
const cls = (n) => (Math.round(n) > 0 ? 'ok' : Math.round(n) < 0 ? 'bad' : '');

/** 엽서 이미지. 파일이 없으면 이름 첫 글자가 보입니다. */
export function thumb(c) {
  const initial = esc((c && c.name ? c.name : '?').trim().charAt(0));
  const img = c && c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<span class="thumb"><b>${initial}</b>${img}</span>`;
}

export function fameText(c) {
  const f = Math.round(c.fameMean * 100) / 100;
  const d = c.random ? `${c.days[0].d}~${c.maxDay}일` : `${c.maxDay}일`;
  return `명성 ${f > 0 ? '+' : ''}${f}${c.random || c.days.length > 1 ? ' (평균)' : ''} · ${d}`;
}

export function priceText(c) {
  return c.purchasable ? `${fmt(c.price)} ${c.currency}` : '구매 불가';
}

function statsTable(P) {
  const shop = P.cards.filter((c) => c.purchasable);
  const rubShop = shop.map((c) => ({ c, s: cardStats(c, P) })).filter((x) => x.c.currency === '루블' && x.s.rubNet > 0);
  const baseSd = rubShop.length ? Math.max(...rubShop.map((x) => x.s.perSlotDay)) : 0;
  let h = '<h2>엽서별 효율</h2><div class="box scroll"><table><tr><th>엽서</th><th>가격</th><th>순수익(루블)</th><th>순루나</th><th>칸 기회비용 반영</th></tr>';
  P.cards.forEach((c) => {
    const s = cardStats(c, P);
    const vs = s.rubNet - baseSd * c.meanDays;
    const off = (P.exclude || []).includes(c.id);
    h += `<tr class="${off ? 'mut' : ''}"><td class="l">${thumb(c)} ${esc(c.name)}${c.source === 'event' ? ' <em>이벤트</em>' : ''}${off ? ' (제외)' : ''}</td>`
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
  let h = statsTable(P);

  h += `<h2>최적 계획 (${P.days}일)</h2><div class="box"><div class="big">목표 우체통 ${B.step}단계 (${42 + 10 * B.step}칸)</div>`
    + `<div>기간 종료 시 <b>${fmt(B.rub)} 루블 · ${fmt(B.luna)} 루나</b></div>`
    + `<div class="mut">확장 없이 현재 단계 유지: ${fmt(Z.rub)} 루블 · ${fmt(Z.luna)} 루나 → 확장 이득 <span class="${cls(gain)}">${sg(gain)} 루블</span></div></div>`;

  h += '<h2>오늘의 추천</h2><div class="box">';
  const upToday = B.ups.filter((u) => u.day === 0);
  if (B.today.length || upToday.length) {
    h += '<ul class="flat">';
    B.today.forEach((t) => { h += `<li>${esc(t.name)} <b>${fmt(t.k)}장</b> 구매 (${fmt(t.cost)} ${t.currency})</li>`; });
    upToday.forEach((u) => { h += `<li>우체통 ${u.step}단계로 확장 (${fmt(u.cost)} 루블)</li>`; });
    h += '</ul>';
  } else h += '<span class="mut">오늘 살 수 있는 이득 엽서가 없습니다 (빈 칸이 없거나 자금이 부족).</span>';
  h += '</div>';

  h += recallSection(recall);

  h += '<h2>우체통 확장 일정</h2><div class="box">';
  if (B.ups.length) {
    h += '<div class="scroll"><table><tr><th>시점</th><th>단계</th><th>칸수</th><th>비용</th></tr>';
    const long = B.ups.length > 30;
    B.ups.forEach((u, i) => {
      if (long && i >= 15 && i < B.ups.length - 5) { if (i === 15) h += '<tr><td colspan="4" class="mut c">…</td></tr>'; return; }
      h += `<tr><td>${u.day}일째</td><td>${u.step}</td><td>${42 + 10 * u.step}</td><td>${fmt(u.cost)}</td></tr>`;
    });
    h += '</table></div>';
  } else h += '<span class="mut">확장하지 않는 것이 최선입니다.</span>';
  h += '</div>';

  h += '<h2>목표 단계별 비교</h2><div class="box scroll"><table><tr><th>목표 단계</th><th>최종 루블</th><th>최종 루나</th><th>최선 대비</th></tr>';
  const cand = R.res.filter((x) => x.u <= R.bestU);
  const picks = new Set([0, cand.length - 1]);
  for (let k = 1; k < 7; k++) picks.add(Math.round((k * (cand.length - 1)) / 7));
  [...picks].sort((a, b) => a - b).forEach((i) => {
    const x = cand[i];
    h += `<tr${x.u === R.bestU ? ' class="best"' : ''}><td>${x.u}${x.u === R.bestU ? ' (최적)' : ''}</td><td>${fmt(x.rub)}</td><td>${fmt(x.luna)}</td><td>${sg(x.rub - B.rub)}</td></tr>`;
  });
  h += '</table><p class="sub">최적 단계를 넘는 목표는 남은 기간 안에 비용을 회수하지 못해 사지 않으므로 결과가 같습니다.</p></div>';

  h += '<h2>30일 단위 추이</h2><div class="box scroll"><table><tr><th>일</th><th>단계</th><th>칸수</th><th>사용 중</th><th>명성 합</th><th>루블</th><th>루나</th></tr>';
  const tl = B.tl.length > 16 ? B.tl.filter((x, i) => i % Math.ceil(B.tl.length / 14) === 0 || i === B.tl.length - 1) : B.tl;
  tl.forEach((x) => { h += `<tr><td>${x.day}</td><td>${x.step}</td><td>${x.slots}</td><td>${fmt(x.N)}</td><td class="${cls(x.F)}">${fmt(x.F)}</td><td>${fmt(x.rub)}</td><td>${fmt(x.luna)}</td></tr>`; });
  h += '</table></div>';

  h += '<div class="box"><b>기간 중 구매 합계</b><ul>';
  const any = B.types.some((_, i) => B.bought[i] > 0);
  B.types.forEach((c, i) => { if (B.bought[i] > 0) h += `<li>${esc(c.name)}: ${fmt(B.bought[i])}장</li>`; });
  if (!any) h += '<li class="mut">구매 없음</li>';
  h += '</ul></div>';

  h += '<p class="sub">가정: 칸이 비는 날 바로 다시 구매하고, 이득이 없는 엽서는 사지 않습니다. 확률 엽서(주사위 등)는 기대값으로 계산하므로 실제 결과는 운에 따라 달라집니다. 명성은 우체통 전체의 합으로 계산하고, 합이 마이너스면 버프 없이 −100루블씩 깎입니다.</p>';
  return h;
}
