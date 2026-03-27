'use client'
import { useEffect, useRef } from 'react'
import styles from './Pricing.module.css'

const CHECK = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M3 7l3 3 5-5" stroke="#10b981" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const TIERS = [
  {
    tier: 'HOBBY',
    price: '$0',
    period: '/ month',
    desc: 'For developers evaluating and prototyping. No credit card required.',
    cta: 'Get started',
    ctaStyle: 'outline' as const,
    features: [
      '500 scans / month',
      'All 6 DOM axes',
      'REST API + SDK',
      '7-day audit log',
    ],
  },
  {
    tier: 'PRO',
    price: '$49',
    period: '/ month',
    desc: 'For teams running agents in production. Full access, no feature limits.',
    cta: 'Get started',
    ctaStyle: 'solid' as const,
    featured: true,
    features: [
      '50,000 scans / month',
      'Streaming SSE verdicts',
      'Webhook callbacks',
      '90-day audit log',
      'Custom thresholds',
      'Priority support',
    ],
  },
  {
    tier: 'ENTERPRISE',
    price: 'Custom',
    period: '',
    desc: 'For organizations with compliance requirements, SLAs, and volume commitments.',
    cta: 'Contact us',
    ctaStyle: 'outline' as const,
    features: [
      'Unlimited scans',
      'On-premise deployment',
      'SOC 2 Type II',
      '99.99% SLA',
      'Dedicated support',
    ],
  },
]

export default function Pricing() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.classList.add('in') }, { threshold: .07 })
    io.observe(el); return () => io.disconnect()
  }, [])

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const card = e.currentTarget
    const r = card.getBoundingClientRect()
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%')
    card.style.setProperty('--my', ((e.clientY - r.top)  / r.height * 100) + '%')
  }

  return (
    <section ref={ref} className={`${styles.wrap} reveal`}>
      <div className={styles.inner}>
        <div className="eyebrow">Pricing</div>
        <h2 className="section-h">
          Start free.<br />
          <span className="dim">Scale when you&apos;re ready.</span>
        </h2>
        <p className="section-p" style={{ marginTop: 12 }}>
          No seat licenses. You pay for scans, and only when you need more than the free tier.
        </p>

        <div className={styles.grid}>
          {TIERS.map(t => (
            <div
              key={t.tier}
              className={`${styles.card} ${t.featured ? styles.featured : ''}`}
              onMouseMove={handleMouseMove}
            >
              <div className={styles.tier}>{t.tier}</div>
              <div className={styles.price}>
                {t.price}
                {t.period && <span className={styles.period}>{t.period}</span>}
              </div>
              <p className={styles.desc}>{t.desc}</p>
              <button className={`${styles.cta} ${t.ctaStyle === 'solid' ? styles.ctaSolid : styles.ctaOutline}`}>
                {t.cta}
              </button>
              <div className={styles.features}>
                {t.features.map(f => (
                  <div key={f} className={styles.feat}>
                    {CHECK}
                    {f}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
