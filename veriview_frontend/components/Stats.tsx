'use client'
import { useEffect, useRef } from 'react'
import styles from './Stats.module.css'

const STATS = [
  { n: '6',       l: 'DOM physics axes analyzed simultaneously per scan' },
  { n: '<100ms',  l: 'Average verdict latency in production environments' },
  { n: '3×',      l: 'Parallel ML workers sharing one Redis DOM snapshot' },
  { n: '0',       l: 'Target false negative rate across all attack vectors' },
]

export default function Stats() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.classList.add('in') }, { threshold: .07 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} className={`${styles.stats} reveal`}>
      {STATS.map(s => (
        <div key={s.n} className={styles.cell}>
          <div className={styles.num}>{s.n}</div>
          <div className={styles.label}>{s.l}</div>
        </div>
      ))}
    </div>
  )
}
