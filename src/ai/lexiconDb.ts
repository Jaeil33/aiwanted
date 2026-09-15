import type { Concept } from './lexicon';

/*
 * 일상 낱말 DB(ADR-026). AI 없이도 사람들이 쓸 만한 말 대부분을 손잡이로 옮기려고 핵심 개념(lexicon.ts) 밖의 낱말을 모은다.
 * 순수 데이터다: 손잡이·세기(−2..2)만 두고 확률 숫자는 담지 않는다(ADR-003). 민감 주제 낱말은 넣지 않는다.
 */
export const DB_CONCEPTS: readonly Concept[] = [];
