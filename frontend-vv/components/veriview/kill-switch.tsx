'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'

export function KillSwitch() {
  const [isArmed, setIsArmed] = useState(true)
  const [activated, setActivated] = useState(false)
  const [hovered, setHovered] = useState(false)

  const handleFlip = () => {
    if (isArmed) {
      setActivated(true)
      setTimeout(() => {
        setActivated(false)
      }, 2000)
    }
  }

  return (
    <div className="flex flex-col h-full bg-black border-t border-zinc-800 border-l" style={{
      borderLeftColor: 'rgba(244, 63, 94, 0.5)',
      boxShadow: 'inset -20px 0 40px rgba(244, 63, 94, 0.15), -10px 0 30px rgba(244, 63, 94, 0.2)'
    }}>
      {/* Header */}
      <div className="h-10 border-b border-zinc-800 px-4 flex items-center bg-zinc-900/50">
        <h2 className="text-xs font-mono font-semibold text-rose-400 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 animate-pulse" />
          EMERGENCY KILL SWITCH
        </h2>
      </div>

      {/* Switch Container */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        {/* Status Indicator */}
        <div className="mb-8">
          <div className={`text-xs font-mono font-semibold text-center transition-colors ${isArmed ? 'text-rose-400' : 'text-yellow-400'}`}>
            STATUS: {isArmed ? 'ARMED' : 'DISARMED'}
          </div>
        </div>

        {/* Physical Flip Switch Container */}
        <div className="relative">
          {/* Outer Glow Ring */}
          <div className={`absolute inset-0 w-32 h-40 border-2 rounded-lg transition-all duration-300 pointer-events-none ${
            hovered || activated ? 'animate-glow-ring' : 'border-rose-500/30'
          }`}
          style={{
            borderColor: hovered || activated ? 'rgba(244, 63, 94, 0.6)' : 'rgba(244, 63, 94, 0.3)',
            boxShadow: hovered || activated ? '0 0 25px rgba(244, 63, 94, 0.4), inset 0 0 15px rgba(244, 63, 94, 0.1)' : 'none'
          }}></div>

          {/* Physical Flip Switch */}
          <button
            onClick={handleFlip}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={`relative w-24 h-36 border-4 rounded-lg cursor-pointer transition-all duration-300 flex flex-col items-center justify-center select-none ${
              isArmed
                ? 'border-rose-500 bg-gradient-to-br from-rose-900/40 to-rose-950/60'
                : 'border-yellow-500/70 bg-yellow-900/20'
            } ${activated ? 'scale-95' : 'hover:scale-105'} z-10`}
            style={{
              boxShadow: activated 
                ? '0 0 30px rgba(244, 63, 94, 0.6), inset 0 0 20px rgba(244, 63, 94, 0.3)'
                : hovered
                  ? '0 0 20px rgba(244, 63, 94, 0.4), inset 0 0 15px rgba(244, 63, 94, 0.2)'
                  : '0 0 15px rgba(244, 63, 94, 0.2)'
            }}
          >
            {/* Switch Toggle */}
            <div
              className={`w-20 h-12 border-2 border-rose-500 rounded-md flex items-center justify-center transition-all duration-300 font-mono font-bold text-xs mb-2 ${
                activated 
                  ? 'bg-rose-600/60 text-rose-100 shadow-lg'
                  : 'bg-rose-500/30 text-rose-300 shadow-md'
              }`}
              style={{
                boxShadow: activated ? '0 0 20px rgba(244, 63, 94, 0.6), inset 0 0 10px rgba(244, 63, 94, 0.4)' : 'none'
              }}
            >
              {activated ? 'ABORT' : 'FLIP'}
            </div>

            {/* Center indicator light */}
            <div className={`w-3 h-3 rounded-full ${
              activated ? 'bg-rose-400 animate-pulse' : 'bg-rose-500/50'
            }`} style={{
              boxShadow: activated ? '0 0 12px rgba(244, 63, 94, 0.8)' : '0 0 6px rgba(244, 63, 94, 0.4)'
            }}></div>
          </button>
        </div>

        {/* Instructions */}
        <div className="mt-10 text-center max-w-xs">
          <p className="text-xs font-mono text-rose-300 font-semibold mb-2">
            FLIP TO ABORT
          </p>
          <p className="text-xs text-zinc-500 leading-snug">
            Execute emergency protocol termination. All processes halt immediately upon activation.
          </p>
        </div>

        {/* Activation Indicator */}
        {activated && (
          <div className="mt-8 w-full max-w-xs space-y-3">
            <div className="w-full h-1 bg-rose-900/30 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-transparent via-rose-500 to-transparent animate-pulse"></div>
            </div>
            <p className="text-xs font-mono text-rose-400 text-center font-semibold animate-pulse">
              ⚠ PROTOCOL ACTIVATED
            </p>
          </div>
        )}
      </div>

      {/* Bottom warning */}
      <div className="h-10 border-t border-zinc-800 px-4 flex items-center justify-center bg-rose-900/20">
        <span className="text-xs font-mono text-rose-400 font-semibold">
          ⚠ IRREVERSIBLE ACTION
        </span>
      </div>
    </div>
  )
}
