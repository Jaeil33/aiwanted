import styles from './Screen.module.css';

/** 자리 표시: 만든 이유·데이터 출처·한계는 step 6에서 채운다 */
export function AboutScreen() {
  return (
    <section className={styles.screen} aria-labelledby="about-title">
      <h2 id="about-title" className={styles.title}>
        만든 이유
      </h2>
    </section>
  );
}
