/*
 * 엔진 워커 진입점: 무거운 createGame·evaluate·playout을 메인 스레드 밖에서 계산한다.
 * 불러오는 순간 전역 self에 리스너를 달기 때문에 index.ts에서 재내보내지 않는다.
 * 워커 생성(`import('../game/engine.worker?worker&inline')`)은 src/app/platform.ts가 맡는다.
 */
import { createLocalEngineClient, handleEngineMessage, type EngineRequestMessage } from './engineClient';

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
}

const scope = self as unknown as WorkerScope;
const client = createLocalEngineClient();

scope.addEventListener('message', (event) => {
  const msg = event.data;
  // 짝지을 id가 없으면 응답할 수 없으니 무시한다 (kind·req 오류는 handleEngineMessage가 ok: false로 돌려준다)
  if (typeof msg !== 'object' || msg === null || typeof (msg as { id?: unknown }).id !== 'number') return;
  void handleEngineMessage(client, msg as EngineRequestMessage).then((response) => scope.postMessage(response));
});
