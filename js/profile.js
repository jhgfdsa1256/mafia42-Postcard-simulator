// 닉네임으로 우체통 정보를 불러오는 어댑터.
// 게임 데이터를 조회하는 주소는 CONFIG.profileApi에 직접 연결해야 합니다.
// 브라우저에서 다른 사이트를 직접 부르면 CORS에 막히는 경우가 많아서, 보통은 작은 중계 서버가 필요합니다.
import { CONFIG } from './config.js';

export class ProfileApiError extends Error {}

/**
 * API 응답을 계산기 상태로 바꿉니다.
 * 기대하는 응답: { holdings: [{ id | name, count, remain }], step?, rub?, luna? }
 * id가 cards.json과 맞지 않으면 name으로 찾고, 둘 다 못 찾은 항목은 unknown으로 셉니다.
 */
export function toState(data, cards) {
  const ids = new Set(cards.map((c) => c.id));
  const byName = new Map(cards.map((c) => [c.name, c.id]));
  const rows = Array.isArray(data.holdings) ? data.holdings : [];
  let unknown = 0;
  const holdings = [];
  for (const h of rows) {
    const id = ids.has(h.id) ? h.id : byName.get(h.name);
    const count = Math.floor(+h.count || 0);
    const remain = Math.floor(+h.remain || 0);
    if (!id) { unknown++; continue; }
    if (count > 0 && remain > 0) holdings.push({ id, count, remain });
  }
  const state = { holdings };
  for (const k of ['step', 'rub', 'luna']) {
    if (Number.isFinite(+data[k]) && data[k] !== null && data[k] !== '') state[k] = Math.max(0, Math.floor(+data[k]));
  }
  return { state, unknown };
}

export async function fetchMailbox(nick, cards) {
  if (!CONFIG.profileApi) throw new ProfileApiError('NO_API');
  const sep = CONFIG.profileApi.includes('?') ? '&' : '?';
  const res = await fetch(CONFIG.profileApi + sep + 'nick=' + encodeURIComponent(nick));
  if (!res.ok) throw new ProfileApiError('서버 응답 ' + res.status);
  return toState(await res.json(), cards);
}
