'use client'

import { Shield, RotateCcw } from 'lucide-react'
import { useVeriViewStore } from '@/lib/veriview-store'

export function Header() {
  const { attackScan, safeScan, killActivated, pipelineLogs, resetAll } = useVeriViewStore()

  const hasThreats = attackScan?.blocked || killActivated
  const threatLevel = killActivated ? 'CRITICAL' : attackScan?.blocked ? 'HIGH' : safeScan ? 'LOW' : 'STANDBY'
  const threatColor = killActivated ? 'text-rose-400' : attackScan?.blocked ? 'text-rose-400' : safeScan ? 'text-emerald-400' : 'text-yellow-400'

  return (
    <header className="h-12 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent animate-scan-lines" />
      <div className={`absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${hasThreats ? 'via-rose-500/40' : 'via-emerald-500/20'} to-transparent`} />

      <div className="flex items-center gap-3 relative z-10">
        <Shield className={`w-5 h-5 ${hasThreats ? 'text-rose-400' : 'text-emerald-400'} animate-pulse`} />
        <span className={`text-sm font-semibold font-sans tracking-widest ${hasThreats ? 'text-rose-400' : 'text-emerald-400'}`}>
          VERIVIEW v1.0.4
        </span>
      </div>

      <div className="flex items-center gap-6 relative z-10">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className={`${threatColor} font-semibold`}>THREAT LEVEL: {threatLevel}</span>
        </div>
        <div className="w-px h-4 bg-zinc-700/50" />
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className={`w-2 h-2 ${killActivated ? 'bg-rose-500' : 'bg-emerald-500'} rounded-full pulsing-dot`} />
          <span className={`${killActivated ? 'text-rose-400' : 'text-emerald-400'} font-semibold`}>
            VERIVIEW ENGINE: {killActivated ? 'HALTED' : 'ONLINE'}
          </span>
        </div>
        <div className="w-px h-4 bg-zinc-700/50" />
        <div className="text-xs font-mono text-zinc-500">
          {pipelineLogs.length} events
        </div>
        <button onClick={resetAll} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Reset All">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
