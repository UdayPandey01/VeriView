'use client'

import { Shield } from 'lucide-react'

export function Header() {
  return (
    <header className="h-12 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-6 relative overflow-hidden">
      {/* Top scanning effect line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent animate-scan-lines"></div>

      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>

      {/* Left side - Logo and title */}
      <div className="flex items-center gap-3 relative z-10">
        <Shield className="w-5 h-5 safe-text animate-pulse" />
        <span className="text-sm font-semibold font-sans tracking-widest text-emerald-400">
          VERIVIEW v1.0.4
        </span>
      </div>

      {/* Right side - Status indicators */}
      <div className="flex items-center gap-6 relative z-10">
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="safe-text font-semibold animate-flicker">THREAT LEVEL: LOW</span>
        </div>
        <div className="w-px h-4 bg-zinc-700/50"></div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <div className="w-2 h-2 bg-emerald-500 rounded-full pulsing-dot"></div>
          <span className="safe-text font-semibold">AEGIS ENGINE: ONLINE</span>
        </div>
      </div>
    </header>
  )
}
