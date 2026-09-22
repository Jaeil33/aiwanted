// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ruleInterpret } from '../../src/ai/rules';
import { fixtureContext, fixtureEvidence } from '../../src/ai/test-helpers';

/*
 * 배포 모양 점검(ADR-028). Vercel Node 런타임은 api/*.ts를 파일마다 JS로 옮기기만 하고(묶지 않는다) Node ESM으로 import한다.
 * 확장자 없는 상대 import(ERR_MODULE_NOT_FOUND)나 속성 없는 JSON import는 핸들러에 들어가기 전, 모듈을 불러올 때 죽어
 * 500 FUNCTION_INVOCATION_FAILED가 된다(2026-09-15·09-22 운영 확인). Vitest는 Vite 해석기를 거치므로 이 오류를 못 본다.
 * 그래서 함수가 닿는 모듈을 같은 방식으로 임시 폴더에 옮겨 적고, 별도 node 프로세스에서 import해 불러 본다.
 * 네트워크는 쓰지 않는다: 자식 프로세스의 전역 fetch는 부르면 throw하고, AI·저장소 환경변수는 넘기지 않는다.
 */

const API_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ROOT = path.dirname(API_DIR);

/** Vercel이 함수로 만드는 api 파일 이름(확장자 없음): _·. 로 시작하는 파일, .d.ts, 테스트는 뺀다 */
function functionNames(): string[] {
  return readdirSync(API_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ts$/.test(entry.name) && !/\.(test|d)\.ts$/.test(entry.name) && !/^[_.]/.test(entry.name))
    .map((entry) => entry.name.replace(/\.ts$/, ''))
    .sort();
}

/** 번들러처럼 상대 import를 소스 파일로 푼다(확장자 없음·.js→.ts·index.ts). Node가 풀 수 있는지는 자식 프로세스가 판정한다 */
function resolveSource(fromFile: string, specifier: string): string {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, base.replace(/\.js$/, '.ts'), `${base}.ts`, path.join(base, 'index.ts')];
  const found = candidates.find((file) => existsSync(file) && /\.(ts|json)$/.test(file) && !file.endsWith('.d.ts'));
  if (!found) throw new Error(`${path.relative(ROOT, fromFile)}: '${specifier}' 소스를 찾지 못했어요`);
  return found;
}

/** 함수 진입 파일에서 닿는 모든 소스(.ts·.json)를 ROOT 기준 상대 경로로 */
function reachableSources(entries: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!file.endsWith('.ts')) continue;
    for (const { fileName } of ts.preProcessFile(readFileSync(file, 'utf8'), true, true).importedFiles) {
      if (fileName.startsWith('.')) queue.push(resolveSource(file, fileName));
    }
  }
  return [...seen].map((file) => path.relative(ROOT, file)).sort();
}

/** Vercel처럼 파일마다 따로 JS로 옮긴다(import 경로·속성은 그대로 둔다). JSON은 그대로 복사한다 */
function emitLikeVercel(sources: string[], outDir: string): void {
  writeFileSync(path.join(outDir, 'package.json'), JSON.stringify({ type: 'module' }));
  for (const rel of sources) {
    const from = path.join(ROOT, rel);
    const to = path.join(outDir, rel.replace(/\.ts$/, '.js'));
    mkdirSync(path.dirname(to), { recursive: true });
    if (rel.endsWith('.json')) {
      copyFileSync(from, to);
      continue;
    }
    const { outputText } = ts.transpileModule(readFileSync(from, 'utf8'), {
      fileName: from,
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    writeFileSync(to, outputText);
  }
}

/** 자식 node 프로세스: 함수 모듈을 import하고 사례마다 export된 메서드를 Web Request로 부른다 */
const CHILD = `
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls += 1; throw new Error('smoke: network disabled'); };
const { modules, cases } = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const loaded = {};
const out = { loads: {}, results: [], fetchCalls: 0 };
for (const [name, file] of Object.entries(modules)) {
  try {
    loaded[name] = await import(pathToFileURL(file).href);
    out.loads[name] = { ok: true, exports: Object.keys(loaded[name]).sort() };
  } catch (e) {
    out.loads[name] = { ok: false, error: String(e && e.code ? e.code + ': ' : '') + String(e && e.message ? e.message.split('\\n')[0] : e) };
  }
}
for (const c of cases) {
  const mod = loaded[c.name];
  if (!mod) { out.results.push({ id: c.id, error: 'not loaded' }); continue; }
  try {
    const res = await mod[c.method](new Request('https://tmi.example/api/' + c.name, {
      method: c.method,
      headers: { 'content-type': 'application/json', 'x-forwarded-for': c.ip },
      body: c.body,
    }));
    out.results.push({ id: c.id, status: res.status, contentType: res.headers.get('content-type'), body: await res.text() });
  } catch (e) {
    out.results.push({ id: c.id, error: String(e && e.message ? e.message : e) });
  }
}
out.fetchCalls = fetchCalls;
process.stdout.write(JSON.stringify(out));
`;

interface Case {
  id: string;
  name: string;
  method: 'POST';
  ip: string;
  body: string;
}
interface ChildOutput {
  loads: Record<string, { ok: true; exports: string[] } | { ok: false; error: string }>;
  results: Array<{ id: string; status?: number; contentType?: string | null; body?: string; error?: string }>;
  fetchCalls: number;
}

const ctx = fixtureContext();
const TEXT = '오늘 34도 폭염';
/** AI 프록시 함수별로 키 없음 경로까지 가는 올바른 본문 */
const VALID_BODY: Record<string, string> = {
  interpret: JSON.stringify({ text: TEXT, ctx, measuredAvailable: true }),
  verdict: JSON.stringify({ text: TEXT, interpretation: ruleInterpret(TEXT, ctx, { measuredAvailable: true }), ctx, evidence: fixtureEvidence() }),
};

/** AI·저장소 비밀값은 자식에게 넘기지 않는다(값을 읽지 않고 이름으로 거른다). 키 없음 경로를 보려고 ANTHROPIC_API_KEY는 빈 값 */
function childEnv(): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(ANTHROPIC_|TMI_MODEL_|KV_)/.test(name)));
  return { ...env, ANTHROPIC_API_KEY: '' };
}

const AI_FUNCTIONS = Object.keys(VALID_BODY);
const HTTP_METHODS = ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'DELETE', 'PATCH'];

let outDir = '';
let output: ChildOutput;
const names = functionNames();

beforeAll(() => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tmi-vercel-esm-'));
  const sources = reachableSources(names.map((name) => path.join(API_DIR, `${name}.ts`)));
  emitLikeVercel(sources, outDir);
  const cases: Case[] = AI_FUNCTIONS.flatMap((name, i) => [
    { id: `${name}:empty`, name, method: 'POST' as const, ip: `192.0.2.${100 + i * 2}`, body: '' },
    { id: `${name}:valid`, name, method: 'POST' as const, ip: `192.0.2.${101 + i * 2}`, body: VALID_BODY[name] },
  ]);
  const modules = Object.fromEntries(names.map((name) => [name, path.join(outDir, 'api', `${name}.js`)]));
  const input = path.join(outDir, 'smoke-input.json');
  writeFileSync(input, JSON.stringify({ modules, cases }));
  const script = path.join(outDir, 'smoke.mjs');
  writeFileSync(script, CHILD);
  const child = spawnSync(process.execPath, [script, input], { cwd: outDir, env: childEnv(), encoding: 'utf8', timeout: 30_000 });
  if (child.status !== 0) throw new Error(`smoke 자식 프로세스 실패(${child.status}): ${child.stderr}`);
  output = JSON.parse(child.stdout) as ChildOutput;
}, 60_000);

afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

const result = (id: string) => output.results.find((r) => r.id === id);

describe('Vercel Node ESM 로드(api 함수를 파일마다 옮겨 native import)', () => {
  it('함수 목록에 interpret·verdict가 있고 테스트·_lib는 함수가 아니다', () => {
    expect(names).toEqual(expect.arrayContaining(AI_FUNCTIONS));
    for (const name of names) expect(name).not.toMatch(/\.test$|^_/);
  });

  it.each(names)('%s: 모듈이 오류 없이 로드되고 HTTP 메서드 export가 있다', (name) => {
    const load = output.loads[name];
    expect(load, `${name} 로드 결과`).toMatchObject({ ok: true });
    expect(load.ok && load.exports.some((key) => HTTP_METHODS.includes(key))).toBe(true);
  });

  it.each(AI_FUNCTIONS)('%s: 빈 본문 POST는 크래시 대신 400 JSON이다', (name) => {
    expect(result(`${name}:empty`)).toMatchObject({ status: 400, contentType: 'application/json; charset=utf-8' });
    expect(JSON.parse(result(`${name}:empty`)?.body ?? 'null')).toEqual({ error: 'invalid_request' });
  });

  it.each(AI_FUNCTIONS)('%s: 키가 없으면 503 ai_unconfigured(클라이언트는 규칙 해석으로 대신)이고 fetch를 부르지 않는다', (name) => {
    expect(result(`${name}:valid`)).toMatchObject({ status: 503 });
    expect(JSON.parse(result(`${name}:valid`)?.body ?? 'null')).toEqual({ error: 'ai_unconfigured' });
  });

  it('어느 사례도 네트워크(fetch)를 부르지 않는다', () => {
    expect(output.fetchCalls).toBe(0);
  });
});
