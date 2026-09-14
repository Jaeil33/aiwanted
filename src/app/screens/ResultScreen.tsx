import styles from './Screen.module.css';

/** 자리 표시: 결과·실제 결과 공개·공유는 step 5에서 채운다 */
export function ResultScreen() {
  return (
    <section className={styles.screen} aria-labelledby="result-title">
      <h2 id="result-title" className={styles.title}>
        결과
      </h2>
    </section>
  );
}
