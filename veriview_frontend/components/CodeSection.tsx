'use client'
import { useEffect, useRef, useState } from 'react'
import styles from './CodeSection.module.css'

const RESPONSE_ROWS = [
  { v: 'SAFE', id: 'sc_01hwx · risk: 4', ms: '82ms', cls: 'ok' },
  { v: 'SAFE', id: 'sc_01hwy · risk: 9', ms: '91ms', cls: 'ok' },
  { v: 'BLOCKED', id: 'sc_01hwz · risk: 94 · opacity+z+ocr', ms: '87ms', cls: 'bad' },
  { v: 'SAFE', id: 'sc_01hxa · risk: 3', ms: '78ms', cls: 'ok' },
  { v: 'REVIEW', id: 'sc_01hxb · risk: 41 · contrast', ms: '94ms', cls: 'warn' },
  { v: 'SAFE', id: 'sc_01hxc · risk: 2', ms: '85ms', cls: 'ok' },
  { v: 'BLOCKED', id: 'sc_01hxd · risk: 88 · viewport+layer', ms: '92ms', cls: 'bad' },
  { v: 'SAFE', id: 'sc_01hxe · risk: 6', ms: '79ms', cls: 'ok' },
]

const LANGS = ['Node.js', 'Python', 'Rust', 'cURL']

const CODE_NODE = `<span class="cc">// npm i @veriview/veriview-core</span>
<span class="ck">import</span> <span class="cm">{ <span class="cn">VeriView</span> }</span> <span class="ck">from</span> <span class="cs">'@veriview/veriview-core'</span>

<span class="ck">const</span> <span class="cm">vv</span> <span class="ck">=</span> <span class="ck">new</span> <span class="cn">VeriView</span><span class="cm">({</span>
<span class="cm">  apiKey: process.env.<span class="co">VERIVIEW_API_KEY</span>!,</span>
<span class="cm">  gatewayUrl: process.env.<span class="co">VERIVIEW_BACKEND_URL</span> ?? <span class="cs">'http://13.51.169.6:8082'</span>,</span>
<span class="cm">})</span>

<span class="cc">// Wrap every agent.browse() call</span>
<span class="ck">export async function</span> <span class="cn">safeBrowse</span><span class="cm">(url: <span class="ck">string</span>) {</span>
<span class="cm">  <span class="ck">const</span> report <span class="ck">=</span> <span class="ck">await</span> vv.<span class="cn">inspect</span>(url)</span>

<span class="cm">  <span class="ck">if</span> (report.blocked) {</span>
<span class="cm">    <span class="ck">throw new</span> <span class="cn">Error</span>(<span class="cs">'Blocked by VeriView (risk: '</span> + report.riskScore + <span class="cs">')'</span>)</span>
<span class="cm">  }</span>

<span class="cm">  <span class="cc">// Safe. Let agent proceed.</span></span>
<span class="cm">  <span class="ck">return</span> agent.<span class="cn">browse</span>(url)</span>
<span class="cm">}</span>`

const CODE_PYTHON = `<span class="cc"># pip install veriview</span>
<span class="ck">from</span> <span class="cm">veriview</span> <span class="ck">import</span> <span class="cn">VeriView</span><span class="cm">, InjectionError</span>
<span class="ck">import</span> <span class="cm">os</span>

<span class="cm">vv</span> <span class="ck">=</span> <span class="cn">VeriView</span><span class="cm">(os.environ[</span><span class="cs">"VV_KEY"</span><span class="cm">])</span>

<span class="cc"># Use as a pre-flight check</span>
<span class="ck">def</span> <span class="cn">safe_browse</span><span class="cm">(url: </span><span class="ck">str</span><span class="cm">):</span>
<span class="cm">    result</span> <span class="ck">=</span> <span class="cm">vv.scan(url</span><span class="ck">=</span><span class="cm">url, axes</span><span class="ck">=</span><span class="cs">"all"</span><span class="cm">)</span>

<span class="cm">    <span class="ck">if</span> result.threat_detected:</span>
<span class="cm">        <span class="ck">raise</span> <span class="cn">InjectionError</span>(</span>
<span class="cm">            url, result.risk_score</span>
<span class="cm">        )</span>

<span class="cm">    <span class="cc"># Safe to proceed</span></span>
<span class="cm">    <span class="ck">return</span> agent.browse(url)</span>`

const CODE_CURL = `<span class="cc"># Single scan</span>
<span class="ck">curl</span> <span class="cm">-X POST \\</span>
<span class="cm">  https://api.veriview.dev/v1/scan \\</span>
<span class="cm">  -H <span class="cs">"Authorization: Bearer $VV_KEY"</span> \\</span>
<span class="cm">  -H <span class="cs">"Content-Type: application/json"</span> \\</span>
<span class="cm">  -d <span class="cs">'{</span></span>
<span class="cs">    "url": "https://target.com",</span>
<span class="cs">    "axes": ["all"],</span>
<span class="cs">    "stream": true</span>
<span class="cs">  }'</span>

<span class="cc"># Response streams SSE events</span>
<span class="cc"># Final verdict in &lt;100ms</span>`

const CODE_RUST = `<span class="cc">// Cargo.toml: veriview = "1"</span>
<span class="ck">use</span> <span class="cm">veriview::{</span><span class="cn">VeriView</span><span class="cm">, ScanOptions};</span>

<span class="ck">let</span> <span class="cm">vv</span> <span class="ck">=</span> <span class="cn">VeriView</span><span class="cm">::new(</span>
<span class="cm">    std::env::var(</span><span class="cs">"VV_KEY"</span><span class="cm">)?</span>
<span class="cm">);</span>

<span class="ck">let</span> <span class="cm">result</span> <span class="ck">=</span> <span class="cm">vv.scan(</span><span class="cn">ScanOptions</span> <span class="cm">{</span>
<span class="cm">    url: url.to_string(),</span>
<span class="cm">    axes: </span><span class="cn">Axes</span><span class="cm">::All,</span>
<span class="cm">    ..Default::default()</span>
<span class="cm">}).await?;</span>

<span class="ck">if</span> <span class="cm">result.threat_detected {</span>
<span class="cm">    <span class="ck">return</span> <span class="cn">Err</span>(InjectionError::new(url))</span>
<span class="cm">}</span>`

const CODE_MAP: Record<string, string> = {
  'Node.js': CODE_NODE,
  'Python': CODE_PYTHON,
  'cURL': CODE_CURL,
  'Rust': CODE_RUST,
}

export default function CodeSection() {
  const ref = useRef<HTMLDivElement>(null)
  const [lang, setLang] = useState('Node.js')

  useEffect(() => {
    const el = ref.current; if (!el) return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.classList.add('in') }, { threshold: .07 })
    io.observe(el); return () => io.disconnect()
  }, [])

  return (
    <section ref={ref} className={`${styles.wrap} reveal`}>
      <div className={styles.inner}>
        <div className="eyebrow">Integrate</div>
        <h2 className="section-h">
          One call.<br />
          <span className="dim">Between every agent<br />and every page.</span>
        </h2>
        <p className="section-p" style={{ marginTop: 12 }}>
          Drop VeriView in as a pre-flight check before any browse() action. Five minutes. Any framework.
        </p>

        <div className={styles.grid}>
          {/* Code col */}
          <div className={styles.col}>
            <div className={styles.colHeader}>
              <span className={styles.colTitle}>SDK</span>
              <div className={styles.langTabs}>
                {LANGS.map(l => (
                  <button
                    key={l}
                    className={`${styles.langTab} ${lang === l ? styles.langTabOn : ''}`}
                    onClick={() => setLang(l)}
                  >{l}</button>
                ))}
              </div>
            </div>
            <div
              className={styles.codeBody}
              dangerouslySetInnerHTML={{ __html: CODE_MAP[lang] }}
            />
          </div>

          {/* Response col */}
          <div className={`${styles.col} ${styles.colRight}`}>
            <div className={styles.colHeader}>
              <span className={styles.colTitle}>Live scan stream</span>
              <span className={styles.streamLabel}>production · last 60s</span>
            </div>
            <div className={styles.respRows}>
              {RESPONSE_ROWS.map((r, i) => (
                <div key={i} className={styles.rr}>
                  <span className={`${styles.rrV} ${styles[r.cls]}`}>{r.v}</span>
                  <span className={styles.rrId}>{r.id}</span>
                  <span className={styles.rrMs}>{r.ms}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
