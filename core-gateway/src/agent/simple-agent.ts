import type { Page } from 'playwright';
import { askGemini, AgentDecision } from './llm-service';

import { sanitizeDOM } from '../security/aegis-core';


export async function runAgentLoop(page: Page, userGoal: string, io: any) {
    
    io.emit('log', { type: 'info', message: `🤖 AGENT: Initializing mission: "${userGoal}"` });
    
    let step = 0;
    const MAX_STEPS = 15;
    let missionComplete = false;

    while (step < MAX_STEPS && !missionComplete) {
        step++;
        io.emit('log', { type: 'info', message: `🔄 Step ${step}: Scanning page...` });

        try {
           
            await page.waitForLoadState('domcontentloaded');
           
            const safeView = await sanitizeDOM(page, io);
         
            io.emit('log', { type: 'system', message: '🧠 Agent is thinking...' });
            
            const decision: AgentDecision = await askGemini(userGoal, safeView);

            io.emit('log', { 
                type: 'action', 
                message: `👉 Action: ${decision.action.toUpperCase()} ${decision.selector ? 'on ' + decision.selector : ''}` 
            });

            if (decision.action === 'finish') {
                io.emit('log', { type: 'success', message: '✅ Mission Accomplished!' });
                missionComplete = true;
                break;
            }

            if (decision.action === 'wait') {
                io.emit('log', { type: 'warning', message: `⏳ Agent waiting: ${decision.reason}` });
                await page.waitForTimeout(2000);
                continue;
            }

            if (decision.selector) {
                
                const count = await page.locator(decision.selector).count();
                if (count === 0) {
                    io.emit('log', { type: 'warning', message: `⚠️ Element not found: ${decision.selector}. Retrying...` });
                    continue;
                }

                const element = page.locator(decision.selector).first();
                await element.highlight(); 
                
                if (decision.action === 'click') {
                    await element.click({ timeout: 5000 });
                    
                    try { await page.waitForLoadState('networkidle', { timeout: 3000 }); } catch (e) 
                } 
                else if (decision.action === 'type' && decision.text) {
                    await element.fill(decision.text);
                    io.emit('log', { type: 'info', message: `⌨️ Typed: "${decision.text}"` });
                }
            }

        } catch (error: any) {
            console.error("Agent Loop Error:", error);
            io.emit('log', { type: 'error', message: `❌ Error in step ${step}: ${error.message}` });
            
            await page.waitForTimeout(2000);
        }
    }

    if (!missionComplete) {
        io.emit('log', { type: 'warning', message: '🛑 Max steps reached. Stopping agent.' });
    }
}