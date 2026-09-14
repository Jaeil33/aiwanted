import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fixtureAppData } from '../../test/fixtures/appData';
import { renderWithGame } from '../../test/gameHarness';
import { PlayScreen } from './PlayScreen';

const SCENE = fixtureAppData.scenes[0];

describe('PlayScreen (자리 표시)', () => {
  it('장면을 열기 전에는 여는 중이라는 제목을 보여준다', () => {
    renderWithGame(<PlayScreen />);
    expect(screen.getByRole('heading', { level: 2, name: '장면을 여는 중…' })).toBeInTheDocument();
  });

  it('열린 장면의 제목을 보여준다', async () => {
    const { game } = renderWithGame(<PlayScreen />);
    await act(async () => {
      await game().actions.openScene(SCENE.id, null);
    });
    expect(screen.getByRole('heading', { level: 2, name: SCENE.title })).toBeInTheDocument();
  });
});
