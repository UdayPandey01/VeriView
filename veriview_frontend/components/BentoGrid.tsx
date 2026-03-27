'use client'
import { useEffect, useRef, useState } from 'react'
import styles from './BentoGrid.module.css'

const PILL_IDS = ['p0','p1','p2','p3','p4','p5']
const PILL_LABELS = ['opacity','z-index','contrast','viewport-clip','text-visibility','layer-stack']
const FW_TAGS = ['LangChain','AutoGPT','CrewAI','OpenAI Agents','Claude CU','Custom']

const STREAM_VERDICTS = ['SAFE','BLOCKED','SAFE','REVIEW','SAFE','BLOCKED','SAFE']
const STREAM_MS       = [82, 87, 79, 94, 85, 91, 78]

type StreamRow = { id: string; v: string; ms: number }

function BentoCard({
  children,
  span,
  className = '',
}: {
  children: React.ReactNode
  span: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current; if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%')
    el.style.setProperty('--my', ((e.clientY - r.top)  / r.height * 100) + '%')
  }

  return (
    <div
      ref={ref}
      className={`${styles.bc} ${styles[span]} ${className}`}
      onMouseMove={handleMouseMove}
    >
      {children}
    </div>
  )
}

export default function BentoGrid() {
  const ref     = useRef<HTMLDivElement>(null)
  const [axesOn, setAxesOn]   = useState(false)
  const [stream, setStream]   = useState<StreamRow[]>([
    { id: 'sc_0001', v: 'SAFE',    ms: 82 },
    { id: 'sc_0002', v: 'BLOCKED', ms: 87 },
    { id: 'sc_0003', v: 'SAFE',    ms: 79 },
  ])

  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.classList.add('in') }, { threshold: .07 })
    io.observe(el); return () => io.disconnect()
  }, [])

  /* Stream rows cycling */
  useEffect(() => {
    let idx = 0
    const iv = setInterval(() => {
      idx = (idx + 1) % 7
      setStream([
        { id: `sc_${String(idx * 10 + 0).padStart(4, '0')}`, v: STREAM_VERDICTS[idx % 7],       ms: STREAM_MS[idx % 7]       },
        { id: `sc_${String(idx * 10 + 1).padStart(4, '0')}`, v: STREAM_VERDICTS[(idx+1) % 7],   ms: STREAM_MS[(idx+1) % 7]   },
        { id: `sc_${String(idx * 10 + 2).padStart(4, '0')}`, v: STREAM_VERDICTS[(idx+2) % 7],   ms: STREAM_MS[(idx+2) % 7]   },
      ])
    }, 1800)
    return () => clearInterval(iv)
  }, [])

  return (
    <section ref={ref} className={`${styles.wrap} reveal`}>
      <div className={styles.inner}>
        <div className="eyebrow">Features</div>
        <div className={styles.topRow}>
          <h2 className="section-h">
            Everything you need<br />
            <span className="dim">to ship safe agents.</span>
          </h2>
          <p className="section-p" style={{ paddingTop: 16 }}>
            Built for teams running real agents against real web surfaces.
            Every feature exists because a real attack required it.
          </p>
        </div>

        <div className={styles.grid}>
          {/* ── ROW 1 ── */}

          {/* Parallel ML */}
          <BentoCard span="c5">
            <div className={styles.bcN}>01</div>
            <div className={styles.bcT}>Parallel ML Pipeline</div>
            <div className={styles.bcD}>Three workers, one Redis snapshot. No redundant renders. All fire simultaneously.</div>
            <div className={styles.pipeViz}>
              {[
                { name: 'OCR',    cls: styles.pOcr, ms: '23ms' },
                { name: 'Vision', cls: styles.pVis, ms: '31ms' },
                { name: 'LLM',    cls: styles.pLlm, ms: '87ms' },
              ].map(p => (
                <div key={p.name} className={styles.pipeRow}>
                  <span className={styles.pipeName}>{p.name}</span>
                  <div className={styles.pipeTrack}><div className={`${styles.pipeBar} ${p.cls}`} /></div>
                  <span className={styles.pipeMs}>{p.ms}</span>
                </div>
              ))}
            </div>
          </BentoCard>

          {/* Latency */}
          <BentoCard span="c4">
            <div className={styles.bcN}>02</div>
            <div className={styles.bcBig}>&lt;100<span className={styles.bcBigUnit}>ms</span></div>
            <div className={styles.bcT}>Verdict Latency</div>
            <div className={styles.bcD}>Fast enough for production. Zero impact on the happy path.</div>
          </BentoCard>

          {/* Redis */}
          <BentoCard span="c3">
            <div className={styles.bcN}>03</div>
            <div className={styles.bcT}>Redis Blob</div>
            <div className={styles.bcD}>One snapshot, three workers. Shared state, no duplication.</div>
            <div className={styles.redisViz}>
              <div className={styles.redisCenter}>Redis<br />blob</div>
              <div className={styles.redisWorkers}>
                {['OCR','CV','LLM'].map(w => (
                  <div key={w} className={styles.redisW}>{w}</div>
                ))}
              </div>
            </div>
          </BentoCard>

          {/* ── ROW 2 ── */}

          {/* 6-axis */}
          <BentoCard span="c7">
            <div className={styles.bcN}>04</div>
            <div className={styles.bcT}>6-Axis DOM Physics</div>
            <div className={styles.bcD}>Every element measured across six axes simultaneously. An attack must defeat all six at once.</div>
            {/* toggle */}
            <div
              className={`${styles.toggle} ${axesOn ? styles.toggleOn : ''}`}
              onClick={() => setAxesOn(v => !v)}
            />
            <div className={styles.pills}>
              {PILL_LABELS.map((label, i) => (
                <span
                  key={i}
                  className={styles.pill}
                  style={axesOn ? {
                    borderColor: 'rgba(239,68,68,.35)',
                    color: 'var(--red)',
                    background: 'rgba(239,68,68,.05)',
                    transitionDelay: `${i * 80}ms`,
                  } : {}}
                >{label}</span>
              ))}
            </div>
          </BentoCard>

          {/* Streaming SSE */}
          <BentoCard span="c5">
            <div className={styles.bcN}>05</div>
            <div className={styles.bcT}>Streaming SSE</div>
            <div className={styles.bcD}>Abort before the scan finishes. Results stream as produced.</div>
            <div className={styles.streamRows}>
              {stream.map((r, i) => (
                <div key={i} className={styles.sr}>
                  <span className={styles.srId}>{r.id}</span>
                  <span className={`${styles.srV} ${r.v === 'SAFE' ? styles.srOk : r.v === 'BLOCKED' ? styles.srBl : styles.srRv}`}>{r.v}</span>
                  <span className={styles.srMs}>{r.ms}ms</span>
                </div>
              ))}
            </div>
          </BentoCard>

          {/* ── ROW 3 ── */}

          {/* Audit log */}
          <BentoCard span="c3">
            <div className={styles.bcN}>06</div>
            <div className={styles.bcT}>Audit Log</div>
            <div className={styles.bcD}>Every scan: DOM snapshot, axis scores, OCR output, LLM reasoning, verdict. 90-day retention on Pro.</div>
          </BentoCard>

          {/* Frameworks */}
          <BentoCard span="c4">
            <div className={styles.bcN}>07</div>
            <div className={styles.bcT}>Framework-Agnostic</div>
            <div className={styles.bcD}>One SDK, every agent framework that browses the web.</div>
            <div className={styles.fwTags}>
              {FW_TAGS.map(t => <span key={t} className={styles.fwTag}>{t}</span>)}
            </div>
          </BentoCard>

          {/* Webhooks */}
          <BentoCard span="c5">
            <div className={styles.bcN}>08</div>
            <div className={styles.bcT}>Webhook Callbacks</div>
            <div className={styles.bcD}>Real-time notifications when threats are blocked. Pipe into SIEM, PagerDuty, Slack, or any HTTP endpoint. Retry logic built-in.</div>
          </BentoCard>
        </div>
      </div>
    </section>
  )
}
