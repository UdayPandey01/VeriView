'use client'

import { create } from 'zustand'

export interface ScanResult {
    safe_snapshot: string[]
    interactive_elements: { vv_id: string; tag: string; text: string }[]
    risk_score: number
    blocked: boolean
    logs: string[]
}

export interface PipelineLog {
    timestamp: string
    url: string
    phase: string
    message: string
    risk_score: number
}

export interface SuspiciousNode {
    tag: string
    text: string
    reasons: string
}

export type ScanStatus = 'idle' | 'scanning' | 'done'

interface VeriViewState {
    safeScan: ScanResult | null
    attackScan: ScanResult | null
    safeStatus: ScanStatus
    attackStatus: ScanStatus
    pipelineLogs: PipelineLog[]
    terminalLines: { text: string; type: 'info' | 'success' | 'warning' | 'error' }[]
    activeScan: 'safe' | 'attack' | null
    killActivated: boolean

    runSafeScan: () => Promise<void>
    runAttackScan: () => Promise<void>
    runFullDemo: () => Promise<void>
    fetchLogs: () => Promise<void>
    activateKillSwitch: () => void
    addTerminalLine: (text: string, type: 'info' | 'success' | 'warning' | 'error') => void
    resetAll: () => void
}

const SAFE_URL = 'http://localhost:8000/trap.html'
const ATTACK_URL = 'http://localhost:8000/trap.html?attack=true'
const GATEWAY = 'http://localhost:8082'

async function callNavigate(url: string): Promise<ScanResult> {
    const res = await fetch(`${GATEWAY}/api/v1/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
    })
    if (!res.ok) throw new Error(`Gateway returned ${res.status}`)
    return res.json()
}

async function fetchPipelineLogs(): Promise<PipelineLog[]> {
    const res = await fetch(`${GATEWAY}/api/v1/logs`)
    if (!res.ok) return []
    return res.json()
}

export const useVeriViewStore = create<VeriViewState>((set, get) => ({
    safeScan: null,
    attackScan: null,
    safeStatus: 'idle',
    attackStatus: 'idle',
    pipelineLogs: [],
    terminalLines: [],
    activeScan: null,
    killActivated: false,

    addTerminalLine: (text, type) => {
        set((s) => ({ terminalLines: [...s.terminalLines, { text, type }] }))
    },

    fetchLogs: async () => {
        const logs = await fetchPipelineLogs()
        set({ pipelineLogs: logs })
    },

    runSafeScan: async () => {
        const { addTerminalLine, fetchLogs } = get()
        set({ safeStatus: 'scanning', activeScan: 'safe', safeScan: null })
        addTerminalLine('> Initiating SAFE MODE scan...', 'info')
        addTerminalLine(`> Target: ${SAFE_URL}`, 'info')

        try {
            const result = await callNavigate(SAFE_URL)
            set({ safeScan: result, safeStatus: 'done' })
            await fetchLogs()

            for (const log of result.logs) {
                const type = log.includes('ALERT') ? 'error' : log.includes('WARNING') ? 'warning' : log.includes('Safe Snapshot') ? 'success' : 'info'
                addTerminalLine(`  ${log}`, type)
            }

            if (result.blocked) {
                addTerminalLine(`> BLOCKED. Risk: ${result.risk_score}`, 'error')
            } else {
                addTerminalLine(`> SAFE. Risk: ${result.risk_score}. ${result.interactive_elements.length} interactive elements found.`, 'success')
                if (result.interactive_elements.length > 0) {
                    addTerminalLine('> Agent: Scanning interactive elements...', 'info')
                    for (const el of result.interactive_elements) {
                        addTerminalLine(`    [${el.vv_id}] <${el.tag}> "${el.text}"`, 'info')
                    }
                    const btn = result.interactive_elements.find(
                        e => e.text.toLowerCase().includes('sign in') || e.tag === 'BUTTON'
                    )
                    if (btn) {
                        addTerminalLine(`> Agent Decision: Would click ${btn.vv_id} ("${btn.text}")`, 'success')
                    }
                }
            }
        } catch (e: any) {
            addTerminalLine(`> ERROR: ${e.message}`, 'error')
            set({ safeStatus: 'idle' })
        }
    },

    runAttackScan: async () => {
        const { addTerminalLine, fetchLogs } = get()
        set({ attackStatus: 'scanning', activeScan: 'attack', attackScan: null })
        addTerminalLine('', 'info')
        addTerminalLine('> Initiating ATTACK MODE scan...', 'warning')
        addTerminalLine(`> Target: ${ATTACK_URL}`, 'warning')

        try {
            const result = await callNavigate(ATTACK_URL)
            set({ attackScan: result, attackStatus: 'done' })
            await fetchLogs()

            for (const log of result.logs) {
                const type = log.includes('ALERT') || log.includes('GHOST') ? 'error' : log.includes('WARNING') || log.includes('suspicious') ? 'warning' : log.includes('Safe Snapshot') ? 'success' : 'info'
                addTerminalLine(`  ${log}`, type)
            }

            if (result.blocked) {
                addTerminalLine(`> THREAT NEUTRALIZED. Risk: ${result.risk_score}. Page BLOCKED.`, 'error')
                addTerminalLine('> Agent: REFUSING to interact. Hidden injection detected.', 'error')
            } else {
                addTerminalLine(`> SAFE. Risk: ${result.risk_score}.`, 'success')
            }
        } catch (e: any) {
            addTerminalLine(`> ERROR: ${e.message}`, 'error')
            set({ attackStatus: 'idle' })
        }
    },

    runFullDemo: async () => {
        const { runSafeScan, runAttackScan, addTerminalLine } = get()
        set({ terminalLines: [], safeScan: null, attackScan: null, safeStatus: 'idle', attackStatus: 'idle', killActivated: false })
        addTerminalLine('========================================', 'info')
        addTerminalLine('  VERIVIEW FULL DEMO SEQUENCE', 'success')
        addTerminalLine('========================================', 'info')

        await runSafeScan()
        addTerminalLine('', 'info')
        addTerminalLine('----------------------------------------', 'info')
        await runAttackScan()

        addTerminalLine('', 'info')
        addTerminalLine('========================================', 'info')
        addTerminalLine('  DEMO COMPLETE', 'success')
        addTerminalLine('========================================', 'info')

        const { safeScan, attackScan } = get()
        addTerminalLine(`  Safe risk:   ${safeScan?.risk_score ?? '?'}`, safeScan?.blocked ? 'error' : 'success')
        addTerminalLine(`  Attack risk: ${attackScan?.risk_score ?? '?'}`, attackScan?.blocked ? 'error' : 'success')
        addTerminalLine(`  Attack blocked: ${attackScan?.blocked ? 'YES' : 'NO'}`, attackScan?.blocked ? 'success' : 'error')
    },

    activateKillSwitch: () => {
        set({ killActivated: true, activeScan: null })
        get().addTerminalLine('> !! KILL SWITCH ACTIVATED !! All scans halted.', 'error')
    },

    resetAll: () => {
        set({
            safeScan: null,
            attackScan: null,
            safeStatus: 'idle',
            attackStatus: 'idle',
            pipelineLogs: [],
            terminalLines: [],
            activeScan: null,
            killActivated: false,
        })
    },
}))
