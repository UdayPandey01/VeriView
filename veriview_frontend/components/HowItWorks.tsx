'use client'
import { useEffect, useRef } from 'react'
import styles from './HowItWorks.module.css'

const STEPS = [
  {
    n: '01 — RENDER',
    title: 'Full browser render',
    pill: 'Headless Chromium',
    desc: "We don't parse HTML. We spin up a real browser, execute all JavaScript, apply all CSS, expand all iframes, and capture the final computed DOM state. This is the only way to catch dynamically injected payloads that don't exist in the source HTML.",
    tags: ['JS execution', 'computed styles', 'iframe expansion', 'screenshot capture'],
  },
  {
    n: '02 — PHYSICS',
    title: '6-axis DOM physics',
    pill: 'Rust core',
    desc: 'Every DOM element is scored across six independent axes: opacity, z-index layering, contrast ratio, viewport clipping, text visibility, and stack order. An element must pass all six to be considered visible. Hidden elements fail this check regardless of technique.',
    tags: ['opacity', 'z-index', 'contrast', 'viewport-clip', 'visibility', 'stacking'],
  },
  {
    n: '03 — VISION',
    title: 'Visual-DOM consensus',
    pill: 'OCR + CV',
    desc: 'We screenshot the rendered page and run OCR to extract every text element. We cross-reference OCR output against the DOM tree. Text in the DOM but absent from the visual snapshot is a threat signal. Attackers cannot make text both invisible to humans and readable to agents simultaneously.',
    tags: ['OCR extraction', 'visual snapshot', 'cross-reference', 'consensus scoring'],
  },
  {
    n: '04 — VERIFY',
    title: 'LLM semantic verification',
    pill: 'Parallel',
    desc: 'Anything flagged by physics or vision is passed to an LLM for semantic review. Does this text read like an instruction for an AI agent? Does it attempt to override context, exfiltrate data, or alter behavior? This stage catches sophisticated social engineering that purely structural checks miss.',
    tags: ['intent detection', 'instruction classification', 'confidence scoring', 'Redis shared blob'],
  },
]

export default function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.classList.add('in') }, { threshold: .07 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <section ref={ref} className={`${styles.wrap} reveal`}>
      <div className={styles.inner}>
        <div className="eyebrow">How It Works</div>
        <h2 className="section-h" style={{ maxWidth: 600 }}>
          Not a regex.<br />
          <span className="dim">A visual intelligence<br />pipeline.</span>
        </h2>

        <div className={styles.list}>
          {STEPS.map(s => (
            <div key={s.n} className={styles.step}>
              <span className={styles.stepN}>{s.n}</span>
              <div>
                <div className={styles.stepTitle}>
                  {s.title}
                  <span className={styles.pill}>{s.pill}</span>
                </div>
                <p className={styles.stepDesc}>{s.desc}</p>
                <div className={styles.tags}>
                  {s.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
