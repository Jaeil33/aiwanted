import { TEAMS } from '../domain/teams.js';
import type { TeamCode } from '../types/data.js';
import type { PromptContext, Subject } from '../types/domain.js';
import { tokensOf } from './text.js';
import type { Clause, PreparedText } from './text.js';

/*
 * 대상 추론(ADR-013 4단계). 순수 모듈이다. 절 하나가 누구 이야기인지 정한다.
 * 먼저 걸린 규칙이 이긴다: 받는 사람 → 이름 → 타순·장면 밖 선수 → 역할어 → 팀 이름·별칭 → 동사 단서 → 지금 타자.
 * 절 안에 주어가 있으면 그 주어부터 보고, 앞 절에서 이어받은 주어는 절 안의 사람·팀 언급 다음에 본다.
 * Subject를 선수 id·진영으로 확정하는 일은 엔진(compileEffects)이 한다(ADR-003).
 */

export interface TargetResolution {
  subject: Subject;
  /** 해설에 쓸 이름표. 예: "김타자", "박투수", "원정 팀", "주심" */
  label: string;
  via: 'name' | 'recipient' | 'lineup' | 'role' | 'team' | 'verb' | 'default';
  /** 지금 타자·투수 개인이 아니라 팀 전체에만 반영해야 하는 경우 true */
  teamOnly: boolean;
}

type Via = TargetResolution['via'];
type Side = 'home' | 'away';

/** 10개 구단 별칭(소문자): 공식 이름 외의 한글·영문 표기와 별명. 공식 이름(teams.ts)도 함께 찾는다 */
export const TEAM_ALIASES: Readonly<Record<TeamCode, readonly string[]>> = {
  HT: ['kia', '기아', '타이거즈', '호랑이', 'tigers'],
  LT: ['롯데', '자이언츠', '거인', 'lotte', 'giants'],
  NC: ['nc', '엔씨', '다이노스', '공룡', 'dinos'],
  HH: ['한화', '이글스', '독수리', 'hanwha', 'eagles'],
  LG: ['lg', '엘지', '트윈스', '쌍둥이', 'twins'],
  OB: ['두산', '베어스', '곰', 'doosan', 'bears'],
  SS: ['삼성', '라이온즈', '사자', 'samsung', 'lions'],
  SK: ['ssg', '랜더스', '쓱', 'landers'],
  KT: ['kt', '케이티', '위즈', '마법사', 'wiz'],
  WO: ['키움', '히어로즈', '영웅', 'kiwoom', 'heroes'],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const byLengthDesc = (a: string, b: string) => b.length - a.length;

// ---------- 팀 별칭 ----------

const ALIAS_CODE = new Map<string, TeamCode>();
for (const code of Object.keys(TEAM_ALIASES) as TeamCode[]) {
  for (const alias of [TEAMS[code].name.toLowerCase(), ...TEAM_ALIASES[code]]) ALIAS_CODE.set(alias, code);
}

/** 영문은 낱말 경계, 한 글자 한글(곰·쓱)은 뒤에 조사만, 나머지 한글은 낱말 시작 */
function aliasPattern(alias: string): string {
  if (/^[a-z0-9]+$/.test(alias)) return `\\b${escapeRe(alias)}\\b`;
  if (Array.from(alias).length === 1) return `(?<![가-힣])${escapeRe(alias)}(?=$|[^가-힣]|[들이은는가을의도])`;
  return `(?<![가-힣])${escapeRe(alias)}`;
}

const ALIAS_SOURCE = [...ALIAS_CODE.keys()].sort(byLengthDesc).map(aliasPattern).join('|');
const ALIAS_RE = new RegExp(ALIAS_SOURCE);
/** 역할어 바로 앞의 팀 표시: "롯데 감독", "기아의 수비진", "원정 팬", "홈팀 코치" */
const ALIAS_BEFORE = new RegExp(`(${ALIAS_SOURCE})(?:\\s*팀)?(?:의)?\\s*$`);
const AWAY_BEFORE = /원정\s*(?:팀)?(?:의)?\s*$/;
const HOME_BEFORE = /(?<![가-힣])홈\s*(?:팀)?(?:의)?\s*$/;
const AWAY_WORD = /원정\s*(?:팀|선수단|선수들|선수)/;
const HOME_WORD = /(?<![가-힣])홈\s*(?:팀|선수단|선수들|선수)/;

function codeOfName(name: string): TeamCode | null {
  return ALIAS_CODE.get(name.trim().toLowerCase()) ?? null;
}

// ---------- 역할어·동사 ----------

const BENCH_COMPOUND = /(?:투수|타격|수비|주루|배터리|불펜|수석)\s*코치/;
const PITCHER_ROLE = /투수|선발|마무리|불펜|에이스|클로저|셋업맨/;
const BATTER_ROLE = /타자|대타|타석에\s*선/;
const FIELD_ROLE = /포수|유격수|내야수|외야수|좌익수|중견수|우익수|[1-3]루수|수비/;
const BENCH_ROLE = /감독|코치|벤치|더그아웃/;
const NEUTRAL_ROLE = /주심|구심|루심|심판|캐스터|해설/;
const CROWD_ROLE = /관중|관객|팬(?!티)|응원단|치어리더/;
const FAMILY = /어머니|어머님|엄마|아버지|아버님|아빠|아내|와이프|남편|아들|딸(?![기꾹])|누나|동생|할머니|할아버지|가족|부모님|부모|(?<![가-힣])형(?=$|[^가-힣]|[이은도님네한])/;
/** 이름으로 쓰면 역할어와 헷갈리는 말(세 글자 이름의 "이름만"에서 뺀다) */
const ROLE_LIKE = new RegExp([PITCHER_ROLE, BATTER_ROLE, FIELD_ROLE, BENCH_ROLE, NEUTRAL_ROLE, CROWD_ROLE, FAMILY].map((re) => re.source).join('|'));

const PITCHER_VERB = /던지|던졌|던져|던질|투구|구속|볼넷\s*(?:을\s*)?(?:내주|내줬|허용)|폭투|보크|피안타|피홈런|홈런\s*(?:을\s*)?맞|안타\s*(?:를\s*)?맞|실점|삼진\s*(?:을\s*)?(?:잡|뺏)|제구|마운드|등판/;
const BATTER_VERB = /(?<![가-힣])(?:쳐(?!다)|쳤|치고|치면|친다|칠\s)|스윙|타격|홈런|안타|번트|볼넷\s*(?:을\s*)?(?:골라|골랐|고르|얻)|삼진\s*(?:을\s*)?당|타석|출루|장타|달리기|달려|뛰어(?!난|나)|도루|주루/;
const FIELD_VERB = /실책|송구|포구|(?<![가-힣])잡(?:다|았|아|고|는|을)/;

/** "X에게/X한테/X께"(께서는 주어라서 뺀다) */
const RECIPIENT_SUFFIX = /^(.+?)(?:선수)?(?:에게|한테|께)$/;
/** "X 위해/X를 향해" */
const RECIPIENT_NEXT = /^(?:위해|위해서|향해|향해서)$/;
/** "X 칭찬함", "X 응원가"처럼 X를 향한 행동 */
const DIRECTED_NEXT = /^(?:칭찬|응원|격려|축하|위로|야유|선물|편지|문자|박수)/;
/** 주어 조사가 붙은 낱말("포수가", "관중은")은 받는 사람이 아니라 행동하는 사람이다 */
const SUBJECT_PARTICLE = /(?:이|가|은|는|께서)$/;
const SURNAME_SUNSU = /(?<![가-힣])([가-힣])\s?선수/g;
const NAME_AFTER = '(?=$|[^가-힣]|[이가은는을를도의에한랑와과께선형님아야])';

// ---------- 장면 사람 색인 ----------

type PersonKey = 'batter' | 'pitcher' | 'batting' | 'fielding' | 'other';

interface Person {
  name: string;
  key: PersonKey;
  /** 팀 이름(PromptContext.battingTeam/fieldingTeam 표기) */
  team: string;
}

interface PersonHit {
  index: number;
  person: Person;
  bySurname: boolean;
}

interface SceneIndex {
  fullRe: RegExp | null;
  givenRe: RegExp | null;
  full: Map<string, Person>;
  given: Map<string, Person>;
  /** 장면 사람(타자·투수·두 타순)의 성 → 서로 다른 이름 */
  surnames: Map<string, Person[]>;
  awayCode: TeamCode | null;
  homeCode: TeamCode | null;
}

const PRIORITY: Readonly<Record<PersonKey, number>> = { batter: 0, pitcher: 1, batting: 2, fielding: 3, other: 4 };
const INDEX_CACHE = new WeakMap<PromptContext, SceneIndex>();

function keepHigher(map: Map<string, Person>, key: string, person: Person): void {
  const prev = map.get(key);
  if (!prev || PRIORITY[person.key] < PRIORITY[prev.key]) map.set(key, person);
}

function indexOf(ctx: PromptContext): SceneIndex {
  const cached = INDEX_CACHE.get(ctx);
  if (cached) return cached;
  const people: Person[] = [
    { name: ctx.batter.name, key: 'batter', team: ctx.battingTeam },
    { name: ctx.pitcher.name, key: 'pitcher', team: ctx.fieldingTeam },
    ...ctx.battingLineup.map((entry): Person => ({ name: entry.name, key: 'batting', team: ctx.battingTeam })),
    ...ctx.fieldingLineup.map((entry): Person => ({ name: entry.name, key: 'fielding', team: ctx.fieldingTeam })),
    ...ctx.otherPlayers.map((player): Person => ({ name: player.name, key: 'other', team: player.team })),
  ];
  const full = new Map<string, Person>();
  const given = new Map<string, Person>();
  const surnames = new Map<string, Person[]>();
  for (const person of people) {
    const name = person.name.trim().toLowerCase();
    const hangul = /^[가-힣]+$/.test(name);
    if (hangul ? name.length < 2 : name.length < 3) continue;
    keepHigher(full, name, person);
    if (person.key === 'other' || !hangul) continue;
    if (name.length === 3 && !ROLE_LIKE.test(name.slice(1))) keepHigher(given, name.slice(1), person);
    const list = surnames.get(name[0]) ?? [];
    if (!list.some((p) => p.name.trim().toLowerCase() === name)) list.push(person);
    surnames.set(name[0], list);
  }
  const alternation = (keys: Iterable<string>) => [...keys].sort(byLengthDesc).map(escapeRe).join('|');
  const index: SceneIndex = {
    fullRe: full.size > 0 ? new RegExp(`(?<![가-힣a-z0-9])(?:${alternation(full.keys())})`, 'g') : null,
    givenRe: given.size > 0 ? new RegExp(`(?<![가-힣])(?:${alternation(given.keys())})${NAME_AFTER}`, 'g') : null,
    full,
    given,
    surnames,
    awayCode: codeOfName(ctx.awayName),
    homeCode: codeOfName(ctx.homeName),
  };
  INDEX_CACHE.set(ctx, index);
  return index;
}

function peopleIn(source: string, ix: SceneIndex): PersonHit[] {
  const hits: PersonHit[] = [];
  const collect = (re: RegExp | null, map: Map<string, Person>) => {
    if (!re) return;
    for (const m of source.matchAll(re)) {
      const person = map.get(m[0]);
      if (person) hits.push({ index: m.index ?? 0, person, bySurname: false });
    }
  };
  collect(ix.fullRe, ix.full);
  collect(ix.givenRe, ix.given);
  for (const m of source.matchAll(SURNAME_SUNSU)) {
    const list = ix.surnames.get(m[1]);
    if (list && list.length === 1) hits.push({ index: m.index ?? 0, person: list[0], bySurname: true });
  }
  return hits.sort((a, b) => a.index - b.index);
}

// ---------- 규칙 ----------

class Resolver {
  private readonly ix: SceneIndex;

  constructor(private readonly ctx: PromptContext) {
    this.ix = indexOf(ctx);
  }

  private batter(via: Via): TargetResolution {
    return { subject: 'batter', label: this.ctx.batter.name.trim() || '타자', via, teamOnly: false };
  }

  private pitcher(via: Via): TargetResolution {
    return { subject: 'pitcher', label: this.ctx.pitcher.name.trim() || '투수', via, teamOnly: false };
  }

  private sideSubject(side: Side): Subject {
    const name = side === 'away' ? this.ctx.awayName : this.ctx.homeName;
    return this.ctx.battingTeam === name ? 'battingTeam' : 'fieldingTeam';
  }

  private sideName(side: Side): string {
    return side === 'away' ? this.ctx.awayName : this.ctx.homeName;
  }

  private codeSide(code: TeamCode): Side | null {
    if (code === this.ix.awayCode) return 'away';
    return code === this.ix.homeCode ? 'home' : null;
  }

  /** 사람 → 대상. 장면 밖 팀 선수면 null */
  private person(person: Person, via: Via): TargetResolution | null {
    if (person.key === 'batter') return this.batter(via);
    if (person.key === 'pitcher') return this.pitcher(via);
    if (person.team === this.ctx.battingTeam) return { subject: 'battingTeam', label: person.name, via, teamOnly: true };
    if (person.team === this.ctx.fieldingTeam) return { subject: 'fieldingTeam', label: person.name, via, teamOnly: true };
    return null;
  }

  /** 역할어 바로 앞의 원정·홈·팀 이름으로 진영을 찾는다 */
  private sideBefore(clauseText: string, word: string): Side | null {
    const i = clauseText.indexOf(word);
    if (i < 0) return null;
    const before = clauseText.slice(0, i);
    if (AWAY_BEFORE.test(before)) return 'away';
    if (HOME_BEFORE.test(before)) return 'home';
    const alias = ALIAS_BEFORE.exec(before);
    const code = alias ? ALIAS_CODE.get(alias[1]) : undefined;
    return code ? this.codeSide(code) : null;
  }

  private bench(clauseText: string, word: string): TargetResolution {
    const side = this.sideBefore(clauseText, word);
    if (side) return { subject: this.sideSubject(side), label: `${this.sideName(side)} 벤치`, via: 'role', teamOnly: true };
    return { subject: 'battingTeam', label: '공격 팀 벤치', via: 'role', teamOnly: true };
  }

  private fielder(clauseText: string, word: string): TargetResolution {
    const side = this.sideBefore(clauseText, word);
    if (side) return { subject: this.sideSubject(side), label: `${this.sideName(side)} ${word}`, via: 'role', teamOnly: true };
    return { subject: 'fieldingTeam', label: word, via: 'role', teamOnly: true };
  }

  /** 관중·팬: 기본은 홈 팀, "원정 팬·원정 응원"은 원정 팀, "기아 팬"은 그 팀 */
  private crowd(clauseText: string, word: string): TargetResolution {
    const side = this.sideBefore(clauseText, word)
      ?? (/원정\s*(?:팬|응원|관중|관객|석)/.test(clauseText) ? 'away' : 'home');
    return { subject: this.sideSubject(side), label: side === 'home' ? '홈 팬' : '원정 팬', via: 'role', teamOnly: true };
  }

  /** 선수 가족: 바로 앞 낱말(이름·역할어)이 그 선수 */
  private family(clauseText: string, word: string): TargetResolution | null {
    const i = clauseText.indexOf(word);
    if (i <= 0) return null;
    const owner = (clauseText.slice(0, i).trimEnd().split(' ').pop() ?? '').replace(/(?:의|네)$/, '');
    if (!owner) return null;
    const hits = peopleIn(owner, this.ix);
    for (const hit of hits) {
      const resolved = this.person(hit.person, 'name');
      if (resolved) return resolved;
    }
    if (PITCHER_ROLE.test(owner)) return this.pitcher('role');
    if (BATTER_ROLE.test(owner)) return this.batter('role');
    return null;
  }

  /** 4. 역할어: 가장 먼저 나온 역할어(같은 자리면 "투수 코치" 같은 복합어가 먼저) */
  private role(source: string, clauseText: string, personOnly: boolean): TargetResolution | null {
    const hits: Array<{ index: number; make: () => TargetResolution | null }> = [];
    const at = (re: RegExp, make: (word: string) => TargetResolution | null) => {
      const m = re.exec(source);
      if (m) hits.push({ index: m.index, make: () => make(m[0]) });
    };
    at(BENCH_COMPOUND, (word) => this.bench(clauseText, word));
    at(PITCHER_ROLE, () => this.pitcher('role'));
    at(BATTER_ROLE, () => this.batter('role'));
    at(FIELD_ROLE, (word) => this.fielder(clauseText, word));
    at(BENCH_ROLE, (word) => this.bench(clauseText, word));
    at(FAMILY, (word) => this.family(clauseText, word));
    if (!personOnly) {
      at(NEUTRAL_ROLE, (word) => ({ subject: 'everyone', label: word === '해설' ? '해설위원' : word, via: 'role', teamOnly: false }));
      at(CROWD_ROLE, (word) => this.crowd(clauseText, word));
    }
    hits.sort((a, b) => a.index - b.index);
    for (const hit of hits) {
      const resolved = hit.make();
      if (resolved) return resolved;
    }
    return null;
  }

  /** 5. 팀 이름·별칭, 원정팀·홈팀, 장면 밖 팀 선수 */
  private team(source: string, outside: Person | null): TargetResolution | null {
    const hits: Array<{ index: number; resolved: TargetResolution }> = [];
    const alias = ALIAS_RE.exec(source);
    const code = alias ? ALIAS_CODE.get(alias[0]) : undefined;
    if (alias && code) {
      const side = this.codeSide(code);
      hits.push({
        index: alias.index,
        resolved: side
          ? { subject: this.sideSubject(side), label: this.sideName(side), via: 'team', teamOnly: true }
          : { subject: 'everyone', label: TEAMS[code].name, via: 'team', teamOnly: false },
      });
    }
    const awayWord = AWAY_WORD.exec(source);
    if (awayWord) hits.push({ index: awayWord.index, resolved: { subject: this.sideSubject('away'), label: '원정 팀', via: 'team', teamOnly: true } });
    const homeWord = HOME_WORD.exec(source);
    if (homeWord) hits.push({ index: homeWord.index, resolved: { subject: this.sideSubject('home'), label: '홈 팀', via: 'team', teamOnly: true } });
    if (hits.length > 0) return hits.sort((a, b) => a.index - b.index)[0].resolved;
    return outside ? { subject: 'everyone', label: outside.name, via: 'team', teamOnly: false } : null;
  }

  /** 규칙 2~5를 한 글(주어 낱말 또는 절 문장)에 적용한다 */
  source(source: string, clauseText: string): TargetResolution | null {
    const hits = peopleIn(source, this.ix);
    for (const hit of hits) {
      if (hit.person.key === 'batter' || hit.person.key === 'pitcher') return this.person(hit.person, 'name');
    }
    let outside: Person | null = null;
    for (const hit of hits) {
      if (hit.bySurname) continue;
      const resolved = this.person(hit.person, 'lineup');
      if (resolved) return resolved;
      outside ??= hit.person;
    }
    return this.role(source, clauseText, false) ?? this.team(source, outside);
  }

  /** 받는 사람으로 쓸 수 있는 장면 사람: 이름·타순·사람 역할어(관중·심판·팀은 아니다) */
  private personTerm(term: string, clauseText: string): TargetResolution | null {
    for (const hit of peopleIn(term, this.ix)) {
      const resolved = this.person(hit.person, hit.person.key === 'batter' || hit.person.key === 'pitcher' ? 'name' : 'lineup');
      if (resolved) return resolved;
    }
    return this.role(term, clauseText, true);
  }

  /** 1. 받는 사람: "X에게/X한테/X께", "X 위해/향해", "X 칭찬·응원·야유…" */
  recipient(clauseText: string): TargetResolution | null {
    const words = clauseText.split(' ').map((word) => word.replace(/[^\p{L}\p{N}]+$/u, ''));
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const next = words[i + 1] ?? '';
      let term: string | null = null;
      const suffix = word.endsWith('께서') ? null : RECIPIENT_SUFFIX.exec(word);
      if (suffix) term = suffix[1];
      else if ((RECIPIENT_NEXT.test(next) || DIRECTED_NEXT.test(next)) && !SUBJECT_PARTICLE.test(word)) term = word.replace(/(?:을|를|의)$/, '');
      if (!term) continue;
      const resolved = this.personTerm(term, clauseText);
      if (resolved) return { ...resolved, via: 'recipient' };
    }
    return null;
  }

  /** 6. 동사 단서: 가장 먼저 나온 단서(같은 자리면 투수 → 타자 → 수비 순서) */
  verb(text: string): TargetResolution | null {
    const hits: Array<{ index: number; resolved: TargetResolution }> = [];
    const at = (re: RegExp, resolved: TargetResolution) => {
      const m = re.exec(text);
      if (m) hits.push({ index: m.index, resolved });
    };
    at(PITCHER_VERB, this.pitcher('verb'));
    at(BATTER_VERB, this.batter('verb'));
    at(FIELD_VERB, { subject: 'fieldingTeam', label: '수비 팀', via: 'verb', teamOnly: true });
    return hits.length > 0 ? hits.sort((a, b) => a.index - b.index)[0].resolved : null;
  }

  fallback(): TargetResolution {
    return this.batter('default');
  }
}

const withTokens = (text: string) => {
  const tokens = tokensOf(text);
  return tokens.length > 0 ? `${text} ${tokens.join(' ')}` : text;
};

/** 절의 주어 낱말이 그 절 안에 있으면 그것부터, 없으면(이어받았으면) 절 문장 다음에 본다 */
function ownOrInherited(resolver: Resolver, clause: Clause): { own: TargetResolution | null; inherited: TargetResolution | null } {
  const hint = clause.subjectHint;
  const explicit = hint !== null && clause.text.includes(hint);
  const fromHint = hint === null ? null : resolver.source(hint, clause.text);
  const fromText = resolver.source(withTokens(clause.text), clause.text);
  return explicit ? { own: fromHint ?? fromText, inherited: null } : { own: fromText, inherited: fromHint };
}

export function resolveTarget(clause: Clause, prepared: PreparedText, ctx: PromptContext): TargetResolution {
  const resolver = new Resolver(ctx);
  const recipient = resolver.recipient(clause.text);
  if (recipient) return recipient;

  const { own, inherited } = ownOrInherited(resolver, clause);
  if (own) return own;
  if (inherited) return inherited;

  // 주어 표시 없이 사람을 말한 앞 절("박투수 짜장면 먹고, 잠 못 잠")을 이어받는다
  const position = prepared.clauses.indexOf(clause);
  for (let i = position - 1; i >= 0; i--) {
    const previous = ownOrInherited(resolver, prepared.clauses[i]);
    const found = previous.own ?? previous.inherited;
    if (found) return found;
  }

  return resolver.verb(withTokens(clause.text)) ?? resolver.fallback();
}
