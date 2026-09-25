import type { CoreData, PlayerRecord } from '../types/data.js';

/*
 * 선수 레코드 조회. 같은 선수 id가 타자·투수 둘 다일 수 있어서(투타 겸업, 대타로 선 투수)
 * `core.players`는 투수를 `<id>`, 그 사람의 타자 기록을 `<id>:H`에 둔다 (ADR-035).
 * 순수 모듈이다. `src/data/appData.ts`가 같은 이름으로 다시 내보낸다.
 */

/** 같은 id가 타자·투수 둘 다일 때 타자 레코드에 붙는 꼬리. pipeline contract.HITTER_KEY_SUFFIX와 같아야 한다 */
export const HITTER_KEY_SUFFIX = ':H';

/** 타자 레코드. 겸업이면 `<id>:H`, 아니면 `<id>`. 투수뿐인 id면 null이라 호출부가 rel 1로 떨어진다 */
export function hitterOf(core: CoreData, id: string): PlayerRecord | null {
  const dual = core.players[`${id}${HITTER_KEY_SUFFIX}`];
  if (dual) return dual;
  const plain = core.players[id];
  return plain && plain.kind === 'H' ? plain : null;
}

/** 투수 레코드. 투수는 언제나 꼬리 없는 `<id>`다 */
export function pitcherOf(core: CoreData, id: string): PlayerRecord | null {
  const plain = core.players[id];
  return plain && plain.kind === 'P' ? plain : null;
}

/** 이름 표시용: 어느 쪽이든 먼저 찾히는 레코드 */
export function anyPlayerOf(core: CoreData, id: string): PlayerRecord | null {
  return hitterOf(core, id) ?? pitcherOf(core, id);
}
