'use client'

import { useState } from 'react'

export function BrowserViewport() {
  const [mode, setMode] = useState<'raw' | 'sanitized'>('sanitized')

  return (
    <div className="flex flex-col h-full bg-zinc-950 border-r border-zinc-800">
      {/* Top Bar with Toggle */}
      <div className="h-12 border-b border-zinc-800 px-4 flex items-center justify-between bg-zinc-900/50">
        <h2 className="text-xs font-mono font-semibold text-blue-400">DOM ANALYZER</h2>

        {/* Toggle Switch */}
        <div className="flex items-center gap-2 bg-zinc-800/50 rounded px-2 py-1.5">
          <button
            onClick={() => setMode('raw')}
            className={`text-xs font-mono font-semibold px-3 py-1 rounded transition-all ${
              mode === 'raw'
                ? 'bg-red-900/60 text-red-200 shadow-lg'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            RAW DOM (UNSAFE)
          </button>
          <div className="w-px h-5 bg-zinc-700/50"></div>
          <button
            onClick={() => setMode('sanitized')}
            className={`text-xs font-mono font-semibold px-3 py-1 rounded transition-all ${
              mode === 'sanitized'
                ? 'bg-cyan-500/25 text-cyan-300 shadow-lg cyan-glow'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            SANITIZED (SAFE)
          </button>
        </div>
      </div>

      {/* Bank Login Mock with Grid Overlay */}
      <div className="flex-1 overflow-y-auto relative hide-scrollbar bg-gradient-to-br from-blue-950/20 to-transparent">
        {/* Hexagonal Grid Background */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none animate-hex-grid"
          style={{
            backgroundImage: `
              linear-gradient(30deg, #3b82f6 1px, transparent 1px),
              linear-gradient(150deg, #3b82f6 1px, transparent 1px),
              linear-gradient(90deg, #3b82f6 1px, transparent 1px)
            `,
            backgroundSize: '30px 52px',
            backgroundPosition: '0 0, 0 0, 0 0',
          }}
        ></div>

        {/* Scanning effect overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-5">
          <div className="h-px bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-scan-lines"></div>
        </div>

        {/* Bank Login Content */}
        <div className="relative z-10 p-8">
          <div className="max-w-md mx-auto bg-white rounded-lg shadow-xl overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
              <h1 className="text-2xl font-bold text-white">SecureBank</h1>
              <p className="text-blue-100 text-sm">Online Banking Portal</p>
            </div>

            {/* Form */}
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-gray-700 font-semibold mb-2">
                  Username
                </label>
                <input
                  type="text"
                  placeholder="Enter your username"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled
                />
              </div>

              <div className="mb-6">
                <label className="block text-gray-700 font-semibold mb-2">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="Enter your password"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled
                />
              </div>

              <button className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50" disabled>
                Sign In
              </button>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 text-center text-xs text-gray-600">
              <a href="#" className="text-blue-600 hover:text-blue-700">
                Forgot Password?
              </a>
              {' | '}
              <a href="#" className="text-blue-600 hover:text-blue-700">
                Create Account
              </a>
            </div>
          </div>

          {/* AI Analysis Labels */}
          <div className="mt-8 max-w-md mx-auto space-y-2">
            <div className="bg-blue-900/20 border border-blue-500/30 rounded px-3 py-2 text-xs text-blue-300 font-mono">
              ✓ Form detected: #login-form
            </div>
            <div className="bg-blue-900/20 border border-blue-500/30 rounded px-3 py-2 text-xs text-blue-300 font-mono">
              ✓ Input fields: username, password
            </div>
            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded px-3 py-2 text-xs text-yellow-300 font-mono">
              ⚠ Potential target: Transfer Funds form
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
