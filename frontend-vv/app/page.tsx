'use client'

import { Header } from '@/components/veriview/header'
import { BrowserViewport } from '@/components/veriview/browser-viewport'
import { InterceptionLog } from '@/components/veriview/interception-log'
import { AgentTerminal } from '@/components/veriview/agent-terminal'
import { KillSwitch } from '@/components/veriview/kill-switch'

export default function Page() {
  return (
    <div className="h-screen flex flex-col bg-zinc-950">
      {/* Header - 48px */}
      <Header />

      {/* Main Content Area */}
      <div className="flex-1 flex gap-0 min-h-0">
        {/* Left Panel - 70% */}
        <div className="flex flex-col" style={{ width: '70%' }}>
          {/* Browser Viewport - 65vh */}
          <div style={{ height: '65vh' }} className="border-b border-zinc-800">
            <BrowserViewport />
          </div>

          {/* Bottom Console - 20vh */}
          <div style={{ height: '20vh' }} className="flex">
            {/* Agent Terminal - 75% */}
            <div className="flex-1 border-r border-zinc-800">
              <AgentTerminal />
            </div>

            {/* Kill Switch - 25% */}
            <div style={{ width: '25%' }}>
              <KillSwitch />
            </div>
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
