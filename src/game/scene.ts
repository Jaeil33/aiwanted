import type { AppData } from '../types/data';
import { buildSituationSetup, situationFromScene, type SituationSetup } from './situation';

/*
 * 골라 둔 장면(scenes.json) → SituationSetup. 장면 경로를 상황 경로 위에 올려 둔 다리다.
 * 2026 시즌 전체 탐색이 들어오면(19-season step 10) 이 파일과 scenes.json은 사라진다(ADR-032).
 */

/** 장면 id로 설정을 만든다. 모르는 id면 Error */
export function buildSceneSetup(data: AppData, sceneId: string): SituationSetup {
  const scene = data.scenes.find((s) => s.id === sceneId);
  if (!scene) throw new Error(`buildSceneSetup: 모르는 장면 id "${sceneId}"`);
  return buildSituationSetup(data.core, situationFromScene(scene), {
    // 장면 제목은 파이프라인이 교체 기록까지 보고 붙였다(", 대타"). 상황만 보고는 알 수 없다
    title: scene.title,
    actualFinal: { away: scene.away.final, home: scene.home.final },
  });
}
