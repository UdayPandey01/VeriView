'use client'

export interface InterceptionLogItem {
  timestamp: string
  method: string
  endpoint: string
  status: 'blocked' | 'allowed' | 'flagged'
  reason?: string
}

const mockLogs: InterceptionLogItem[] = [
  {
    timestamp: '10:42:05',
    method: 'POST',
    endpoint: '/api/chat',
    status: 'blocked',
    reason: 'XSS Detected',
  },
  {
    timestamp: '10:41:58',
    method: 'GET',
    endpoint: '/assets/style.css',
    status: 'allowed',
  },
  {
    timestamp: '10:41:52',
    method: 'POST',
    endpoint: '/api/login',
    status: 'allowed',
  },
  {
    timestamp: '10:41:45',
    method: 'GET',
    endpoint: '/user/profile',
    status: 'allowed',
  },
  {
    timestamp: '10:41:38',
    method: 'POST',
    endpoint: '/api/transfer',
    status: 'flagged',
    reason: 'Suspicious Activity',
  },
  {
    timestamp: '10:41:30',
    method: 'GET',
    endpoint: '/dashboard',
    status: 'allowed',
  },
  {
    timestamp: '10:41:22',
    method: 'POST',
    endpoint: '/api/webhook',
    status: 'blocked',
    reason: 'CSRF Token Invalid',
  },
  {
    timestamp: '10:41:15',
    method: 'GET',
    endpoint: '/help',
    status: 'allowed',
  },
]

export function InterceptionLog() {
  return (
    <div className="flex flex-col h-full bg-zinc-950 border-l border-zinc-800 relative">
      {/* Glow effect */}
      <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-cyan-500/5 to-transparent pointer-events-none"></div>

      {/* Header */}
      <div className="h-12 border-b border-zinc-800 px-4 flex items-center relative z-10">
        <h2 className="text-xs font-mono font-semibold text-cyan-400 tracking-widest animate-glow-pulse">
          REAL-TIME INTERCEPTION LOG
        </h2>
      </div>

      {/* Scrolling content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar">
        <div className="space-y-0">
          {mockLogs.map((log, index) => (
            <div
              key={index}
              className={`px-4 py-2 border-b border-zinc-800/50 text-xs font-mono transition-all duration-300 ${
                log.status === 'blocked'
                  ? 'bg-rose-900/40 border-l-2 border-l-rose-500 text-white'
                  : log.status === 'flagged'
                    ? 'bg-yellow-900/20 border-l-2 border-l-yellow-500 text-yellow-200 hover:bg-yellow-900/40'
                    : 'text-zinc-400 hover:text-zinc-300'
              }`}
              style={log.status === 'blocked' ? {
                backgroundColor: 'rgba(217, 70, 239, 0.15)',
                borderLeft: '2px solid rgba(244, 63, 94, 0.7)',
                boxShadow: '0 0 10px rgba(244, 63, 94, 0.1)'
              } : {}}
            >
              <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                <span className="text-zinc-500">[{log.timestamp}]</span>
                <span className="font-semibold">{log.method}</span>
                <span className="truncate">{log.endpoint}</span>
                <span
                  className={`ml-auto whitespace-nowrap font-bold ${
                    log.status === 'blocked'
                      ? 'text-rose-300'
                      : log.status === 'flagged'
                        ? 'text-yellow-400'
                        : 'text-emerald-400'
                  }`}
                >
                  {log.status === 'blocked'
                    ? '🛑 BLOCKED'
                    : log.status === 'flagged'
                      ? '⚠ FLAGGED'
                      : '✓ ALLOWED'}
                </span>
              </div>
              {log.reason && (
                <div className={`mt-1 ml-14 ${log.status === 'blocked' ? 'text-rose-300/70' : 'text-zinc-500'}`}>
                  → {log.reason}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
