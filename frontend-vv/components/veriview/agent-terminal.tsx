'use client'

import { useEffect, useRef } from 'react'
import { useVeriViewStore } from '@/lib/veriview-store'
import { Terminal } from 'lucide-react'

export function AgentTerminal() {
  const { terminalLines, safeStatus, attackStatus } = useVeriViewStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [terminalLines])

  const getTextColor = (type: string) => {
    switch (type) {
      case 'success': return 'text-emerald-400'
      case 'error': return 'text-rose-400'
      case 'warning': return 'text-yellow-400'
      default: return 'text-blue-400'
    }
  }

  const isActive = safeStatus === 'scanning' || attackStatus === 'scanning'

  return (
    <div className="flex flex-col h-full bg-black border-t border-zinc-800 relative">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-green-500 to-transparent animate-scan-lines" />
      </div>

      {/* Header */}
      <div className="h-10 border-b border-zinc-800 px-4 flex items-center justify-between bg-zinc-900/50 relative z-10">
        <div className="flex items-center gap-2">
          <Terminal className={`w-4 h-4 text-green-400 ${isActive ? 'animate-pulse' : ''}`} />
          <h2 className="text-xs font-mono font-semibold text-green-400 tracking-wide">
            VERIVIEW TERMINAL [AGENT MODE]
          </h2>
        </div>
        {isActive && (
          <span className="text-xs font-mono text-green-400 animate-pulse">RUNNING...</span>
        )}
      </div>

      {/* Terminal Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto hide-scrollbar p-3 font-mono text-xs relative z-10">
        <div className="space-y-0.5">
          {terminalLines.length === 0 ? (
            <div className="text-zinc-600">
              <p>&gt; VERIVIEW Agent ready.</p>
              <p>&gt; Click SCAN or RUN FULL DEMO to start analysis.</p>
            </div>
          ) : (
            terminalLines.map((line, i) => (
              <div key={i} className={`${getTextColor(line.type)} leading-relaxed whitespace-pre-wrap`}>
                {line.text}
              </div>
            ))
          )}
          <div className={`${isActive ? 'text-green-400' : 'text-green-600'} animate-pulse`}>_</div>
        </div>
      </div>
    </div>
  )
}
