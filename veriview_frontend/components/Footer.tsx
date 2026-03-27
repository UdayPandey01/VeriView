import styles from './Footer.module.css'

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.wordmarkWrap} aria-hidden="true">
        <div className={styles.wordmark}>VeriView</div>
      </div>
    </footer>
  )
}
