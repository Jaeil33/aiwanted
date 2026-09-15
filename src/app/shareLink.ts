/* 링크 공유: Web Share(휴대폰 공유 시트) → 클립보드 복사. 브라우저 입출력이라 app 층(platform)에서만 쓴다 */

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface NavigatorLike {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
  clipboard?: { writeText(text: string): Promise<void> };
}

const isAbort = (error: unknown) => typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';

/** 공유 시트를 먼저 열고, 없거나 실패하면 링크를 클립보드에 복사한다. 사용자가 시트를 닫으면 cancelled */
export async function shareLinkWith(nav: NavigatorLike | null | undefined, url: string, title: string): Promise<ShareOutcome> {
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ title, url });
      return 'shared';
    } catch (error) {
      if (isAbort(error)) return 'cancelled';
    }
  }
  const clipboard = nav?.clipboard;
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(url);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  return 'failed';
}
