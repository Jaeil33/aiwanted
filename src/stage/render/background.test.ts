import { describe, expect, it } from 'vitest';
import { H, W, project } from '../math';
import { buildBackground } from './background';
import { createFakeContext } from './testing';

describe('buildBackground', () => {
  it('하늘·조명탑·관중·전광판·펜스·잔디·흙·마운드·홈플레이트를 논리 좌표에 그린다', () => {
    const fake = createFakeContext();
    buildBackground(fake.ctx);
    // 하늘 1개 + 조명탑 불빛 3개 + 비네트 1개
    expect(fake.count('createLinearGradient')).toBe(1);
    expect(fake.count('createRadialGradient')).toBe(4);
    // 관중 2600명은 2×2 점
    const crowd = fake.argsOf('fillRect').filter(([, , w, h]) => w === 2 && h === 2);
    expect(crowd).toHaveLength(2600);
    // 전광판 틀
    expect(fake.argsOf('fillRect')).toContainEqual([386, 64, 188, 54]);
    expect(fake.argsOf('strokeRect')).toContainEqual([386.5, 64.5, 187, 53]);
    // 내야 흙·마운드·홈플레이트
    expect(fake.valuesOf('fillStyle')).toEqual(expect.arrayContaining(['#83573A', '#8F6242', '#F4F4EE']));
    // 비네트는 화면 전체
    expect(fake.argsOf('fillRect')).toContainEqual([0, 0, W, H]);
  });

  it('펜스 위 노란 선이 385ft 담장 꼭대기(10ft)에 온다', () => {
    const fake = createFakeContext();
    buildBackground(fake.ctx);
    const wallTop = project(0, 385, 10).y;
    expect(fake.argsOf('fillRect')).toContainEqual([0, wallTop - 1, W, 2]);
  });

  it('배터 박스와 파울 라인을 흰 선으로 긋는다', () => {
    const fake = createFakeContext();
    buildBackground(fake.ctx);
    // 배터 박스 2개 × 4변 + 파울 라인 2개
    expect(fake.count('stroke')).toBe(10);
    expect(fake.valuesOf('strokeStyle')).toContain('rgba(238, 242, 233, 0.8)');
  });

  it('관중 배치는 시드 고정이라 몇 번을 그려도 같다', () => {
    const a = createFakeContext();
    const b = createFakeContext();
    buildBackground(a.ctx);
    buildBackground(b.ctx);
    expect(a.argsOf('fillRect')).toEqual(b.argsOf('fillRect'));
  });

  it('글로우 그림자·필터를 쓰지 않는다', () => {
    const fake = createFakeContext();
    buildBackground(fake.ctx);
    expect(fake.valuesOf('shadowBlur')).toEqual([]);
    expect(fake.valuesOf('filter')).toEqual([]);
  });
});
