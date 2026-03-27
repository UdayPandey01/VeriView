'use client'
import styles from './Nav.module.css'

const links = ['Product', 'Docs', 'Changelog', 'Pricing', 'Blog']

export default function Nav() {
  return (
    <nav className={styles.nav}>
      <a href="#" className={styles.logo}>
        <div className={styles.logoIcon}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M11 2L19 6.5V15.5L11 20L3 15.5V6.5L11 2Z"
              stroke="rgba(167,139,250,.65)" strokeWidth="1.2"
              fill="rgba(124,58,237,.1)" />
            <path d="M11 7.5v4M8.5 10l2.5 1.5 2.5-1.5"
              stroke="#a78bfa" strokeWidth="1.1"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        VeriView
      </a>

      <div className={styles.links}>
        {links.map(l => (
          <span key={l} className={styles.link}>{l}</span>
        ))}
      </div>

      <div className={styles.right}>
        <button className={styles.btnGhost}>Log in</button>
        <button className={styles.btnSolid}>Get API Key</button>
      </div>
    </nav>
  )
}
