// 브라우저 저장소(localStorage) 래퍼. 닉네임별로 입력값을 따로 저장합니다.
// 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 메모리에만 두고 write()가 false를 돌려줍니다.
const KEY = 'm42planner.v1';
let mem = { current: '', profiles: {} };

function read() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) {
      const o = JSON.parse(s);
      if (o && typeof o === 'object' && o.profiles) mem = { current: o.current || '', profiles: o.profiles };
    }
  } catch (e) { /* 저장소 사용 불가 */ }
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(mem)); return true; } catch (e) { return false; }
}

export function init() { read(); return mem; }
export function list() { return Object.keys(mem.profiles); }
export function current() { return mem.current; }
export function get(nick) { return mem.profiles[nick || ''] || null; }

export function save(state) {
  mem.profiles[state.nick || ''] = JSON.parse(JSON.stringify(state));
  mem.current = state.nick || '';
  return write();
}

export function remove(nick) {
  delete mem.profiles[nick || ''];
  if (mem.current === (nick || '')) mem.current = '';
  return write();
}

export function exportAll() { return JSON.stringify(mem, null, 1); }

export function importAll(text) {
  const o = JSON.parse(text);
  if (!o || typeof o !== 'object' || !o.profiles || typeof o.profiles !== 'object') throw new Error('형식이 맞지 않습니다');
  Object.assign(mem.profiles, o.profiles);
  if (o.current) mem.current = o.current;
  return write();
}
