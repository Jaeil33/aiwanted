import { useGame } from '../GameProvider';
import styles from './Screen.module.css';

/** 자리 표시: 경기장·확률판·조작은 step 4에서 채운다 */
export function PlayScreen() {
  const { setup } = useGame();
  return (
    <section className={styles.screen} aria-labelledby="play-title">
      <h2 id="play-title" className={styles.title}>
        {setup ? setup.scene.title : '장면을 여는 중…'}
      </h2>
    </section>
  );
}
