'use client'
import { useEffect, useRef, useState } from 'react'
import styles from './SixLayers.module.css'

type Axis = { n: string; v: string; s: 'pass' | 'threat' | 'warn' }

const AXES: Record<'clean' | 'attack', Axis[]> = {
  clean: [
    { n: 'Opacity analysis',   v: '0.95',      s: 'pass' },
    { n: 'Z-index physics',    v: 'clean',     s: 'pass' },
    { n: 'Contrast ratio',     v: '7.2:1',     s: 'pass' },
    { n: 'Viewport clipping',  v: 'none',      s: 'pass' },
    { n: 'OCR extraction',     v: 'match',     s: 'pass' },
    { n: 'LLM verification',   v: 'benign',    s: 'pass' },
  ],
  attack: [
    { n: 'Opacity analysis',   v: '0.001',     s: 'threat' },
    { n: 'Z-index physics',    v: '9999',      s: 'threat' },
    { n: 'Contrast ratio',     v: '1.0:1',     s: 'threat' },
    { n: 'Viewport clipping',  v: 'off-screen',s: 'warn'  },
    { n: 'OCR extraction',     v: 'injection', s: 'threat' },
    { n: 'LLM verification',   v: 'malicious', s: 'threat' },
  ],
}

const AXIS_NODES = [
  { id: 0, label: 'Opacity',   sub: 'AXIS 01', left: '39.7%', top: '30%' },
  { id: 1, label: 'Z-Index',   sub: 'AXIS 02', left: '50%',   top: '25.6%' },
  { id: 2, label: 'Contrast',  sub: 'AXIS 03', left: '60.3%', top: '30%' },
  { id: 3, label: 'Viewport',  sub: 'AXIS 04', left: '39.7%', top: '70%' },
  { id: 4, label: 'OCR Layer', sub: 'AXIS 05', left: '50%',   top: '74.3%' },
  { id: 5, label: 'LLM Check', sub: 'AXIS 06', left: '60.3%', top: '70%' },
]

const SPOKES = [
  { id: 's1', x1: 340, y1: 207, x2: 270, y2: 138, delay: 0 },
  { id: 's2', x1: 340, y1: 207, x2: 340, y2: 118, delay: .18 },
  { id: 's3', x1: 340, y1: 207, x2: 410, y2: 138, delay: .36 },
  { id: 's4', x1: 340, y1: 253, x2: 270, y2: 322, delay: .54 },
  { id: 's5', x1: 340, y1: 253, x2: 340, y2: 342, delay: .72 },
  { id: 's6', x1: 340, y1: 253, x2: 410, y2: 322, delay: .9  },
]

const ICONS = ['🤖','🌐','⚡','🔗','📄','🛠']

export default function SixLayers() {
  const ref = useRef<HTMLDivElement>(null)
  const [mode,    setMode]    = useState<'clean'|'attack'>('clean')
  const [selIdx,  setSelIdx]  = useState(-1)

  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.classList.add('in') }, { threshold: .07 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const axes     = AXES[mode]
  const isAttack = mode === 'attack'

  const verdictNode = isAttack
    ? { cls: styles.blocked, text: 'BLOCKED ✗' }
    : { cls: styles.safe,    text: 'SAFE ✓'    }

  const panelVerdict = isAttack
    ? { score: '94', scoreColor: 'var(--red)',   tag: 'BLOCKED', tagCls: styles.tagR, sub: '5 axes violated · conf: 0.97' }
    : { score: '4',  scoreColor: 'var(--green)', tag: 'SAFE',    tagCls: styles.tagG, sub: 'all axes clean' }

  function selectAxis(i: number) {
    setSelIdx(i)
  }

  return (
    <section ref={ref} className={`section reveal`}>
      <div className="section-inner">
        <div className={styles.header}>
          <div>
            <div className="eyebrow">The Architecture</div>
            <h2 className="section-h">Six layers.<br /><span className="dim">One verdict.</span></h2>
          </div>
          <p className="section-p" style={{ paddingTop: 24 }}>
            Every page your agent visits passes through six independent analysis axes
            simultaneously. An attack payload must evade all six at once —
            computationally infeasible by design.
          </p>
        </div>

        {/* Graph card */}
        <div className={styles.card}>
          {/* Top bar */}
          <div className={styles.topBar}>
            <span className={styles.topTitle}>DOM Physics Engine</span>
            <span className={styles.topSub}>— 6 axes · parallel · Rust core</span>
            <div className={styles.modeGroup}>
              <button
                className={`${styles.modeBtn} ${mode === 'clean' ? styles.modeBtnOn : ''}`}
                onClick={() => { setMode('clean'); setSelIdx(-1) }}
              >Clean scan</button>
              <button
                className={`${styles.modeBtn} ${mode === 'attack' ? styles.modeBtnOn : ''}`}
                onClick={() => { setMode('attack'); setSelIdx(-1) }}
              >Attack demo</button>
            </div>
          </div>

          <div className={styles.body}>
            {/* Canvas */}
            <div className={styles.canvas}>
              <div className={styles.canvasBg} />
              <div className={styles.canvasGlow} />

              {/* SVG lines */}
              <svg
                className={styles.svg}
                viewBox="0 0 680 460"
                preserveAspectRatio="xMidYMid meet"
              >
                {/* static shadow lines */}
                <line x1="150" y1="230" x2="272" y2="230" stroke="rgba(255,255,255,.05)" strokeWidth="1"/>
                <line x1="408" y1="230" x2="530" y2="230" stroke="rgba(255,255,255,.05)" strokeWidth="1"/>
                {/* animated in-flow */}
                <line x1="150" y1="230" x2="272" y2="230"
                  stroke="rgba(124,58,237,.45)" strokeWidth="1.5"
                  strokeDasharray="4 8"
                  style={{ animation: 'dashflow 1.3s linear infinite' }}/>
                {/* animated out-flow */}
                <line x1="408" y1="230" x2="530" y2="230"
                  stroke={isAttack ? 'rgba(239,68,68,.45)' : 'rgba(16,185,129,.45)'}
                  strokeWidth="1.5" strokeDasharray="4 8"
                  style={{ animation: 'dashflow 1.3s linear infinite', animationDelay: '.5s' }}/>
                {/* spokes */}
                {SPOKES.map((s, i) => (
                  <line key={s.id}
                    x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
                    stroke={isAttack && i < 5 ? 'rgba(239,68,68,.3)' : 'rgba(124,58,237,.2)'}
                    strokeWidth="1" strokeDasharray="3 7"
                    style={{ animation: `dashflow 1.7s linear infinite`, animationDelay: `${s.delay}s` }}
                  />
                ))}
              </svg>

              {/* Icon cluster */}
              <div className={styles.cluster}>
                {ICONS.map((icon, i) => (
                  <div key={i} className={styles.clusterIcon}>{icon}</div>
                ))}
              </div>

              {/* Center node */}
              <div className={`${styles.node} ${styles.nodeCenter}`} style={{ left: '50%', top: '50%' }}>
                <div className={styles.nodeBox}>VeriView</div>
                <div className={styles.nodeLbl}>CORE ENGINE</div>
              </div>

              {/* 6 axis nodes */}
              {AXIS_NODES.map(n => (
                <div
                  key={n.id}
                  className={`${styles.node} ${selIdx === n.id ? styles.nodeSelected : ''}`}
                  style={{ left: n.left, top: n.top }}
                  onClick={() => selectAxis(n.id)}
                >
                  <div className={styles.nodeBox}>{n.label}</div>
                  <div className={styles.nodeLbl}>{n.sub}</div>
                </div>
              ))}

              {/* Verdict node */}
              <div
                className={`${styles.node} ${styles.nodeVerdict} ${verdictNode.cls}`}
                style={{ left: '80%', top: '50%' }}
              >
                <div className={styles.nodeBox}>{verdictNode.text}</div>
                <div className={styles.nodeLbl}>VERDICT</div>
              </div>

              <div className={styles.hint}>Click any axis to inspect</div>
            </div>

            {/* Right panel */}
            <div className={styles.panel}>
              <div className={styles.panelH}>
                {selIdx >= 0 ? `AXIS ${selIdx + 1} — ${axes[selIdx].n.toUpperCase()}` : 'AXIS INSPECTOR — select a node'}
              </div>

              {axes.map((a, i) => (
                <div
                  key={i}
                  className={`${styles.axisRow}
                    ${a.s === 'threat' ? styles.axisRowThreat : ''}
                    ${selIdx === i ? styles.axisRowSel : ''}`}
                  onClick={() => selectAxis(i)}
                >
                  <div className={styles.axDot} />
                  <span className={styles.axName}>{a.n}</span>
                  <span className={styles.axVal}>{a.v}</span>
                </div>
              ))}

              <div className={`${styles.verdict} ${styles.verdictOn}`}>
                <div className={styles.verdictLbl}>VERDICT</div>
                <div className={styles.verdictScore} style={{ color: panelVerdict.scoreColor }}>
                  {panelVerdict.score}
                </div>
                <div className={styles.verdictFooter}>
                  <span className={`${styles.verdictTag} ${panelVerdict.tagCls}`}>{panelVerdict.tag}</span>
                  <span className={styles.verdictSub}>{panelVerdict.sub}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
