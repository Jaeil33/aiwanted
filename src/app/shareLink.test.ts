import { describe, expect, it, vi } from 'vitest';
import { shareLinkWith } from './shareLink';

const URL = 'https://example.test/#/scene/x?t=abc';

describe('shareLinkWith', () => {
  it('Web Share가 있으면 navigator 메서드로 부르고 shared', async () => {
    const nav = { share: vi.fn(async function (this: unknown) {}), clipboard: { writeText: vi.fn(async () => undefined) } };
    expect(await shareLinkWith(nav, URL, 'TMI 야구')).toBe('shared');
    expect(nav.share).toHaveBeenCalledWith({ title: 'TMI 야구', url: URL });
    expect(nav.share.mock.contexts[0]).toBe(nav);
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('사용자가 공유를 닫으면(AbortError) cancelled이고 클립보드는 쓰지 않는다', async () => {
    const nav = { share: vi.fn(async () => Promise.reject(new DOMException('닫음', 'AbortError'))), clipboard: { writeText: vi.fn(async () => undefined) } };
    expect(await shareLinkWith(nav, URL, 'TMI 야구')).toBe('cancelled');
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('공유가 다른 이유로 실패하거나 없으면 클립보드에 복사한다', async () => {
    const failing = { share: vi.fn(async () => Promise.reject(new Error('안 됨'))), clipboard: { writeText: vi.fn(async () => undefined) } };
    expect(await shareLinkWith(failing, URL, 'TMI 야구')).toBe('copied');
    expect(failing.clipboard.writeText).toHaveBeenCalledWith(URL);
    const clipboardOnly = { clipboard: { writeText: vi.fn(async () => undefined) } };
    expect(await shareLinkWith(clipboardOnly, URL, 'TMI 야구')).toBe('copied');
  });

  it('클립보드도 실패하거나 둘 다 없으면 failed', async () => {
    expect(await shareLinkWith({ clipboard: { writeText: async () => Promise.reject(new Error('권한 없음')) } }, URL, 'TMI 야구')).toBe('failed');
    expect(await shareLinkWith({}, URL, 'TMI 야구')).toBe('failed');
    expect(await shareLinkWith(undefined, URL, 'TMI 야구')).toBe('failed');
  });
});
