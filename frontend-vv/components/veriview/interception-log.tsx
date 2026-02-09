'use client'

import { useEffect, useRef } from 'react'
import { useVeriViewStore, PipelineLog } from '@/lib/veriview-store'
import { Activity } from 'lucide-react'

function getLogStyle(log: PipelineLog) {
  const msg = log.message.toLowerCase()
  if (log.risk_score >= 80 || msg.includes('ghost') || msg.includes('blocked') || msg.includes('injection')) {
    return { bg: 'bg-rose-900/40', border: 'border-l-rose-500', text: 'text-rose-200', badge: 'THREAT', badgeColor: 'text-rose-300' }
  }
  if (log.risk_score >= 40 || msg.includes('suspicious') || msg.includes('warning')) {
    return { bg: 'bg-yellow-900/20', border: 'border-l-yellow-500', text: 'text-yellow-200', badge: 'WARNING', badgeColor: 'text-yellow-400' }
  }
  if (msg.includes('safe snapshot') || msg.includes('air-gap verified')) {
    return { bg: 'bg-emerald-900/10', border: 'border-l-emerald-500', text: 'text-emerald-300', badge: 'SAFE', badgeColor: 'text-emerald-400' }
  }
  return { bg: '', border: 'border-l-zinc-700', text: 'text-zinc-400', badge: 'INFO', badgeColor: 'text-zinc-500' }
}

export function InterceptionLog() {
  const { pipelineLogs, fetchLogs, safeStatus, attackStatus } = useVeriViewStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const interval = setInterval(fetchLogs, 2000)
    return () => clearInterval(interval)
  }, [fetchLogs])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [pipelineLogs])

  return (
    <div className="flex flex-col h-full bg-zinc-950 relative">
      <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-cyan-500/5 to-transparent pointer-events-none" />

      {/* Header */}
      <div className="h-10 border-b border-zinc-800 px-4 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <Activity className={`w-4 h-4 text-cyan-400 ${(safeStatus === 'scanning' || attackStatus === 'scanning') ? 'animate-pulse' : ''}`} />
          <h2 className="text-xs font-mono font-semibold text-cyan-400 tracking-widest">
            PIPELINE LOG
          </h2>
        </div>
        <span className="text-xs font-mono text-zinc-600">{pipelineLogs.length} events</span>
      </div>

      {/* Scrolling content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar">
        {pipelineLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600">
            <Activity className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-xs font-mono">Waiting for scans...</p>
            <p className="text-xs font-mono text-zinc-700 mt-1">Logs appear here in real-time</p>
          </div>
        ) : (
          <div className="space-y-0">
            {pipelineLogs.map((log, index) => {
              const style = getLogStyle(log)
              return (
                <div
                  key={index}
                  className={`px-3 py-2 border-b border-zinc-800/50 border-l-2 ${style.border} ${style.bg} text-xs font-mono transition-all duration-300`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-zinc-600 whitespace-nowrap shrink-0">
                      [{log.timestamp.split(' ')[1] || log.timestamp}]
                    </span>
                    <span className={`${style.badgeColor} font-bold shrink-0`}>
                      [{log.phase}]
                    </span>
                    <span className={`${style.text} break-all leading-relaxed`}>
                      {log.message}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 ml-14">
                    <span className="text-zinc-600 truncate text-[10px]">{log.url}</span>
                    {log.risk_score > 0 && (
                      <span className={`ml-auto shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${log.risk_score >= 80 ? 'bg-rose-500/20 text-rose-300' :
                        log.risk_score >= 40 ? 'bg-yellow-500/20 text-yellow-300' :
                          'bg-zinc-700 text-zinc-400'
                        }`}>
                        RISK:{log.risk_score}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
