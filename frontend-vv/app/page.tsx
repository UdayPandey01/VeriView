'use client'

import { Header } from '@/components/veriview/header'
import { BrowserViewport } from '@/components/veriview/browser-viewport'
import { InterceptionLog } from '@/components/veriview/interception-log'
import { AgentTerminal } from '@/components/veriview/agent-terminal'

export default function Page() {
  return (
    <div className="h-screen flex flex-col bg-zinc-950">
      {/* Header - 48px */}
      <Header />

      {/* Main Content Area */}
      <div className="flex-1 flex gap-0 min-h-0">
        {/* Left Panel - 70% */}
        <div className="flex flex-col min-h-0" style={{ width: '70%' }}>
          {/* Browser Viewport - 65vh */}
          <div style={{ height: '65vh' }} className="border-b border-zinc-800">
            <BrowserViewport />
          </div>

          {/* Bottom Console - Extends to bottom */}
          <div className="flex-1 min-h-0">
            <AgentTerminal />
          </div>
        </div>

        {/* Right Panel - 30% */}
        <div style={{ width: '30%' }} className="flex flex-col border-l border-zinc-800">
          <InterceptionLog />
        </div>
      </div>
    </div>
  )
}
