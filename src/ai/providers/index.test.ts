import { describe, expect, it, vi } from 'vitest';
import { fixtureContext } from '../test-helpers';
import type { SampleLike } from './artifact';
import * as providers from './index';
import { pickProvider } from './index';

const ctx = fixtureContext();

/** 호출만 기록하는 가짜 fetch (응답은 200 {raw}) */
function fakeFetch() {
  const urls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return { status: 200, ok: true, json: async () => ({ raw: { parts: [] } }) } as unknown as Response;
  }) as typeof fetch;
  return { fetchImpl, urls };
}

describe('pickProvider', () => {
  it('아티팩트 sample이 있으면 artifact가 먼저다', async () => {
    const json = vi.fn(async () => ({ parts: [] }));
    const sample: SampleLike = { json };
    const { fetchImpl, urls } = fakeFetch();
    const provider = pickProvider({ artifactSample: sample, apiBase: '/api', fetch: fetchImpl });
    expect(provider?.name).toBe('artifact');
    await provider?.interpret({ text: '오늘 폭염', ctx, measuredAvailable: false });
    expect(json).toHaveBeenCalledTimes(1);
    expect(urls).toEqual([]);
    expect(pickProvider({ artifactSample: sample, apiBase: null })?.name).toBe('artifact');
  });

  it('sample이 없으면 apiBase와 fetch가 모두 있을 때 http', async () => {
    const { fetchImpl, urls } = fakeFetch();
    const provider = pickProvider({ artifactSample: null, apiBase: '/api', fetch: fetchImpl });
    expect(provider?.name).toBe('http');
    await provider?.interpret({ text: '오늘 폭염', ctx, measuredAvailable: false });
    expect(urls).toEqual(['/api/interpret']);
  });

  it('둘 다 안 되면 null', () => {
    const { fetchImpl } = fakeFetch();
    expect(pickProvider({ artifactSample: null, apiBase: '/api' })).toBeNull();
    expect(pickProvider({ artifactSample: null, apiBase: null, fetch: fetchImpl })).toBeNull();
    expect(pickProvider({ artifactSample: null, apiBase: '', fetch: fetchImpl })).toBeNull();
  });

  it('프로바이더 모듈의 내보내기 목록', () => {
    expect(Object.keys(providers).sort()).toEqual([
      'AiError',
      'createArtifactProvider',
      'createHttpProvider',
      'fromSampleError',
      'pickProvider',
      'resolveArtifactSample',
    ]);
  });
});
