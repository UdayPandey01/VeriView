'use client'
import { useEffect, useRef } from 'react'
import styles from './CtaSection.module.css'

export default function CtaSection() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.classList.add('in') }, { threshold: .07 })
    io.observe(el); return () => io.disconnect()
  }, [])

  return (
    <section ref={ref} className={`${styles.wrap} reveal`}>
      <div className={styles.radial} />
      <div className={styles.content}>
        <h2 className={styles.h2}>
          Stop injections.<br />
          <span className={styles.grad}>Ship with confidence.</span>
        </h2>
        <p className={styles.p}>
          Your backend is built. Your agents need this layer.<br />
          Free tier. No credit card. Running in 5 minutes.
        </p>
        <div className={styles.ctas}>
          <button className="btn-primary">Get your API key →</button>
          <button className="btn-secondary">Read the docs</button>
        </div>
      </div>
    </section>
  )
}
