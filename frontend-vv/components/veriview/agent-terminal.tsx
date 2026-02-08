'use client'

import { useEffect, useState } from 'react'

interface TerminalLog {
  id: string
  text: string
  type: 'info' | 'success' | 'warning' | 'error'
}

export function AgentTerminal() {
  const [logs, setLogs] = useState<TerminalLog[]>([
    { id: '1', text: '> AEGIS Threat Analysis Agent initialized', type: 'success' },
    { id: '2', text: '> Analyzing DOM structure...', type: 'info' },
    { id: '3', text: '> Detected form element: LoginForm', type: 'info' },
    { id: '4', text: '> Goal matched: Identify "Transfer Funds" form', type: 'warning' },
    { id: '5', text: '> Cross-referencing attack vectors...', type: 'info' },
    { id: '6', text: '> XSS vulnerability detected in chat endpoint', type: 'error' },
    { id: '7', text: '> Initiating protective measures...', type: 'success' },
    {
      id: '8',
      text: '> DOM sanitization applied - 12 potential threats neutralized',
      type: 'success',
    },
  ])

  const [displayedLogs, setDisplayedLogs] = useState<TerminalLog[]>([logs[0]])

  useEffect(() => {
    if (displayedLogs.length < logs.length) {
      const timer = setTimeout(() => {
        setDisplayedLogs((prev) => [...prev, logs[prev.length]])
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [displayedLogs, logs])

  const getTextColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'text-emerald-400'
      case 'error':
        return 'text-rose-400'
      case 'warning':
        return 'text-yellow-400'
      default:
        return 'text-blue-400'
    }
  }

  return (
    <div className="flex flex-col h-full bg-black border-t border-zinc-800 relative">
      {/* Subtle scan line effect */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-green-500 to-transparent animate-scan-lines"></div>
      </div>

      {/* Header */}
      <div className="h-10 border-b border-zinc-800 px-4 flex items-center bg-zinc-900/50 relative z-10">
        <h2 className="text-xs font-mono font-semibold text-green-400 tracking-wide">
          AEGIS TERMINAL [AGENT MODE]
        </h2>
      </div>

      {/* Terminal Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-4 font-mono text-sm relative z-10">
        <div className="space-y-1">
          {displayedLogs.map((log) => (
            <div key={log.id} className={`${getTextColor(log.type)} transition-opacity duration-300`}>
              {log.text}
            </div>
          ))}
          <div className="text-green-400 animate-pulse">_</div>
        </div>
      </div>
    </div>
  )
}
