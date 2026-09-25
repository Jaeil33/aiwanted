import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';

/*
 * `npm run dev`가 /api도 함께 띄운다. Vercel의 함수 런타임 대신 Vite가 api/<이름>.ts를 SSR로 불러
 * export된 GET·POST에 Web Request를 넘기고 Response를 Node 응답으로 쓴다.
 * 이 파일은 개발 서버 전용이다: 배포에서는 Vercel이 api/*.ts를 직접 함수로 만든다(ADR-028).
 */

/** `/api/<이름>` 하나만 받는다. 점·빗금이 든 이름은 받지 않는다(경로 탈출 방지) */
const API_PATH = /^\/api\/([A-Za-z0-9_-]+)\/?$/;

/** '/api/games?date=..' → 'games'. /api 밖이거나 이름이 이상하면 null */
export function apiNameOf(url: string): string | null {
  const path = url.split(/[?#]/)[0];
  const match = API_PATH.exec(path);
  return match ? match[1] : null;
}

export interface NodeRequestLike {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface NodeResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk?: Uint8Array | string): void;
}

/** 그대로 옮기면 undici가 요청을 거부하는 홉 단위 헤더 */
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-authorization', 'proxy-authenticate', 'te', 'trailer']);

/** Node 요청을 Web Request로. GET·HEAD에는 본문을 넣지 않는다 */
export function toWebRequest(req: NodeRequestLike, body: string | null, origin: string): Request {
  const method = (req.method ?? 'GET').toUpperCase();
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || HOP_BY_HOP.has(name.toLowerCase())) continue;
    for (const one of Array.isArray(value) ? value : [value]) headers.append(name, one);
  }
  const hasBody = method !== 'GET' && method !== 'HEAD' && body !== null && body !== '';
  return new Request(new URL(req.url ?? '/', origin), { method, headers, body: hasBody ? body : null });
}

/** Web Response를 Node 응답으로 쓴다 */
export async function writeWebResponse(res: NodeResponseLike, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => {
    res.setHeader(name, value);
  });
  res.end(new Uint8Array(await response.arrayBuffer()));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

type Handler = (request: Request) => Promise<Response> | Response;

async function serve(server: ViteDevServer, name: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const file = join(server.config.root, 'api', `${name}.ts`);
  if (!existsSync(file)) {
    await writeWebResponse(res, json(404, { error: 'not_found', name }));
    return;
  }
  try {
    const mod = (await server.ssrLoadModule(`/api/${name}.ts`)) as Record<string, unknown>;
    const method = (req.method ?? 'GET').toUpperCase();
    const handler = mod[method];
    if (typeof handler !== 'function') {
      await writeWebResponse(res, json(405, { error: 'method_not_allowed', method }));
      return;
    }
    const origin = `http://${req.headers.host ?? 'localhost'}`;
    const response = await (handler as Handler)(toWebRequest(req, await readBody(req), origin));
    await writeWebResponse(res, response);
  } catch (error) {
    // 개발 중에만 보이는 응답이다: 원인을 그대로 보여 준다(배포 함수는 이 경로를 쓰지 않는다)
    const message = error instanceof Error ? error.message : String(error);
    server.config.logger.error(`[api-dev] /api/${name} 실패: ${message}`);
    await writeWebResponse(res, json(500, { error: 'dev_handler_failed', message }));
  }
}

/** 개발 서버에서 /api/<이름>을 api/<이름>.ts로 넘긴다 */
export function apiDevPlugin(): Plugin {
  return {
    name: 'tmi-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = apiNameOf(req.url ?? '');
        if (name === null) {
          next();
          return;
        }
        void serve(server, name, req, res);
      });
    },
  };
}
