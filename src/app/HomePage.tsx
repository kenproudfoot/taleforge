import styles from './HomePage.module.css';

export function HomePage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>An AI Dungeon Master for your table</p>
        <h1 className={styles.title}>Gather your party. The tale begins.</h1>
        <p className={styles.lede}>
          One to four players, one computer, and a Dungeon Master who narrates aloud, paints every scene and keeps the
          dice honest. A full adventure in under an hour.
        </p>
      </section>
    </div>
  );
}
