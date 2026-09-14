import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from './Sheet';
import styles from './Sheet.module.css';

function Harness({ onClose, dimStage }: { onClose?: () => void; dimStage?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        TMI 시트 열기
      </button>
      <Sheet
        open={open}
        labelledBy="sheet-title"
        dimStage={dimStage}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        <h2 id="sheet-title">TMI 카드</h2>
        <input aria-label="TMI 한 줄" />
        <button type="button">TMI 걸기</button>
      </Sheet>
    </>
  );
}

const backdrop = (): HTMLElement => {
  const element = document.querySelector<HTMLElement>('[data-sheet-backdrop]');
  if (!element) throw new Error('시트 바탕이 없어요');
  return element;
};

afterEach(() => {
  document.body.style.overflow = '';
});

describe('Sheet', () => {
  it('open이 false면 아무것도 그리지 않는다', () => {
    render(
      <Sheet open={false} onClose={vi.fn()} labelledBy="log-title">
        <h2 id="log-title">기록</h2>
      </Sheet>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('기록')).toBeNull();
    expect(document.querySelector('[data-sheet-backdrop]')).toBeNull();
  });

  it('열리면 dialog(aria-modal·aria-labelledby)로 그리고 첫 포커스 가능한 요소로 포커스를 옮긴다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'TMI 시트 열기' }));
    const dialog = screen.getByRole('dialog', { name: 'TMI 카드' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'sheet-title');
    expect(dialog).toHaveClass(styles.dialog);
    expect(dialog.querySelector(`.${styles.panel}`)).not.toBeNull();
    expect(dialog.querySelector(`.${styles.grabber}`)).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('textbox', { name: 'TMI 한 줄' })).toHaveFocus();
  });

  it('Escape는 onClose를 부르고, 닫히면 열기 전 포커스로 돌려준다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'TMI 시트 열기' });
    await user.click(opener);
    expect(opener).not.toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('바탕을 누르면 onClose를 부르고, 시트 안을 누르면 부르지 않는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Sheet open onClose={onClose} labelledBy="log-title">
        <h2 id="log-title">기록</h2>
        <button type="button">안쪽 버튼</button>
      </Sheet>,
    );
    await user.click(screen.getByRole('button', { name: '안쪽 버튼' }));
    await user.click(screen.getByRole('heading', { name: '기록' }));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(backdrop());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('dimStage면 바탕을 어둡게 덮는 클래스를 단다', () => {
    const { rerender } = render(
      <Sheet open onClose={vi.fn()} labelledBy="tmi-title" dimStage>
        <h2 id="tmi-title">TMI 카드</h2>
      </Sheet>,
    );
    expect(backdrop()).toHaveClass(styles.backdrop, styles.dim);
    rerender(
      <Sheet open onClose={vi.fn()} labelledBy="tmi-title">
        <h2 id="tmi-title">TMI 카드</h2>
      </Sheet>,
    );
    expect(backdrop()).toHaveClass(styles.backdrop);
    expect(backdrop()).not.toHaveClass(styles.dim);
  });

  it('포커스 가능한 요소가 없으면 시트 자체에 포커스를 둔다', () => {
    render(
      <Sheet open onClose={vi.fn()} labelledBy="log-title">
        <h2 id="log-title">기록</h2>
        <p>아직 기록이 없어요</p>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: '기록' })).toHaveFocus();
  });

  it('Tab·Shift+Tab은 시트 안에서만 돈다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'TMI 시트 열기' }));
    const input = screen.getByRole('textbox', { name: 'TMI 한 줄' });
    const go = screen.getByRole('button', { name: 'TMI 걸기' });
    await user.tab();
    expect(go).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(go).toHaveFocus();
  });

  it('열린 동안 뒤 페이지 스크롤을 잠그고, 닫히면 원래 값으로 돌린다', () => {
    document.body.style.overflow = 'auto';
    const { rerender } = render(
      <Sheet open onClose={vi.fn()} labelledBy="log-title">
        <h2 id="log-title">기록</h2>
      </Sheet>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <Sheet open={false} onClose={vi.fn()} labelledBy="log-title">
        <h2 id="log-title">기록</h2>
      </Sheet>,
    );
    expect(document.body.style.overflow).toBe('auto');
  });

  it('above는 시트 판 위, 대화상자 안에 함께 그린다(시트 뒤 작은 승률 판 자리)', () => {
    render(
      <Sheet open onClose={vi.fn()} labelledBy="tmi-title" dimStage above={<p>KT 승리확률 53.6% → 54.0%</p>}>
        <h2 id="tmi-title">TMI 카드</h2>
      </Sheet>,
    );
    const above = screen.getByText('KT 승리확률 53.6% → 54.0%');
    const dialog = screen.getByRole('dialog', { name: 'TMI 카드' });
    expect(dialog).toContainElement(above);
    expect(above.closest(`.${styles.above}`)).not.toBeNull();
    expect(above.closest(`.${styles.panel}`)).toBeNull();
  });
});
