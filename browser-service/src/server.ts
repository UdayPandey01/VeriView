import express from 'express';
import { chromium, Browser, BrowserContext } from 'playwright';
import Redis from 'ioredis';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json({ limit: '50mb' }));

let browserInstance: Browser | null = null;

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
redis.on('error', (error) => {
    console.error('[Redis] Connection error:', error?.message ?? error);
});

// Session store for persistent browser contexts (sessionId -> {context, page})
const sessionStore = new Map<string, { context: BrowserContext; page: any }>();
const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes session expiry

function isPrivateOrLocalHost(hostname: string): boolean {
    const host = hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
    if (host.startsWith('10.')) return true;
    if (host.startsWith('192.168.')) return true;
    if (host.startsWith('172.')) {
        const parts = host.split('.');
        if (parts.length >= 2) {
            const secondOctet = Number(parts[1]);
            if (Number.isInteger(secondOctet) && secondOctet >= 16 && secondOctet <= 31) {
                return true;
            }
        }
    }
    return false;
}

function buildNavigationCandidates(rawUrl: string): string[] {
    const fallbackHost = process.env.BROWSER_FALLBACK_HOST || 'host.docker.internal';
    const candidates: string[] = [];
    try {
        const parsed = new URL(rawUrl);
        if (isPrivateOrLocalHost(parsed.hostname) && parsed.hostname !== fallbackHost) {
            const original = rawUrl;
            parsed.hostname = fallbackHost;
            candidates.push(parsed.toString());
            candidates.push(original);
            return Array.from(new Set(candidates));
        }
    } catch {
        return [rawUrl];
    }
    return [rawUrl];
}

async function gotoWithFallback(page: any, rawUrl: string) {
    const candidates = buildNavigationCandidates(rawUrl);
    let lastError: any = null;

    for (const candidate of candidates) {
        try {
            if (candidate !== rawUrl) {
                console.warn(`[SNAP] Retrying with fallback host: ${candidate}`);
            }
            await page.goto(candidate, { waitUntil: 'domcontentloaded', timeout: 30000 });
            return;
        } catch (err: any) {
            lastError = err;
            const message = `${err?.message ?? err}`;
            const shouldRetry = message.includes('ERR_CONNECTION_REFUSED')
                || message.includes('ERR_NAME_NOT_RESOLVED')
                || message.includes('ERR_CONNECTION_TIMED_OUT')
                || message.includes('chrome-error://chromewebdata/');
            if (!shouldRetry) {
                throw err;
            }
            try {
                await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 5000 });
            } catch {
                // ignore page reset issues between retries
            }
        }
    }

    throw lastError;
}

async function bypassInterstitialIfPresent(page: any) {
    try {
        const bodyText = await page.locator('body').innerText({ timeout: 2000 });
        const looksLikeInterstitial = /one more step|open the page|third-party git repository|rawgit\.hack/i.test(bodyText || '');
        if (!looksLikeInterstitial) {
            return false;
        }

        const buttonByRole = page.getByRole('button', { name: /open the page/i });
        if (await buttonByRole.count()) {
            await buttonByRole.first().click({ timeout: 5000 });
            await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
            console.warn('[SNAP] Interstitial detected; clicked "Open the page" button.');
            return true;
        }

        const linkByRole = page.getByRole('link', { name: /open the page/i });
        if (await linkByRole.count()) {
            await linkByRole.first().click({ timeout: 5000 });
            await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
            console.warn('[SNAP] Interstitial detected; followed "Open the page" link.');
            return true;
        }

        const fallbackLink = page.locator('a:has-text("Open the page")');
        if (await fallbackLink.count()) {
            await fallbackLink.first().click({ timeout: 5000 });
            await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
            console.warn('[SNAP] Interstitial detected; followed fallback open link.');
            return true;
        }
    } catch (e: any) {
        console.warn(`[SNAP] Interstitial check failed: ${e?.message ?? e}`);
    }

    return false;
}

function resolveChromiumExecutablePath(): string | undefined {
    const envPath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
    if (envPath && fs.existsSync(envPath)) {
        return envPath;
    }

    const commonPaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
    ];

    for (const candidate of commonPaths) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    const cacheRoot = '/home/pptruser/.cache/puppeteer/chrome-headless-shell';
    if (fs.existsSync(cacheRoot)) {
        const versions = fs.readdirSync(cacheRoot).sort().reverse();
        for (const version of versions) {
            const candidate = path.join(
                cacheRoot,
                version,
                'chrome-headless-shell-linux64',
                'chrome-headless-shell'
            );
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
    }

    return undefined;
}

async function initBrowser() {
    if (!browserInstance) {
        const executablePath = resolveChromiumExecutablePath();
        browserInstance = await chromium.launch({
            headless: true,
            executablePath,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        console.log(`Playwright executable: ${executablePath || 'bundled default'}`);
        console.log("Browser: Speed Trap & Watchdog Ready");
    }
    return browserInstance;
}

async function injectSanitizer(page: any) {
    return await page.evaluate(() => {
        const cleanNodes: any[] = [];
        const suspiciousNodes: any[] = [];
        let vvIdCounter = 0;

        function getLuminance(r: number, g: number, b: number) {
            const a = [r, g, b].map((v: number) => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            });
            return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
        }

        function parseColor(colorStr: string) {
            const m = colorStr.match(/\d+/g);
            return m ? { r: parseInt(m[0]), g: parseInt(m[1]), b: parseInt(m[2]) } : { r: 0, g: 0, b: 0 };
        }

        function parseCssNumber(value: string, fallback = 0) {
            const n = Number.parseFloat((value || '').trim().replace('px', ''));
            return Number.isFinite(n) ? n : fallback;
        }

        function isPositioned(pos: string) {
            return pos === 'absolute' || pos === 'fixed' || pos === 'relative';
        }

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);

        let elementCount = 0;

        while (walker.nextNode()) {
            const el = walker.currentNode as HTMLElement;
            elementCount++;

            if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META'].includes(el.tagName)) continue;

            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();

            const reasons: string[] = [];
            const fontSize = parseCssNumber(style.fontSize, 16);
            const opacity = parseCssNumber(style.opacity, 1);
            const zIndex = parseCssNumber(style.zIndex, 0);
            const position = (style.position || '').toLowerCase();

            if (style.display === 'none') reasons.push("display:none");
            if (style.visibility === 'hidden') reasons.push("visibility:hidden");
            if (parseFloat(style.opacity) < 0.1) reasons.push(`opacity:${style.opacity}`);
            if (fontSize < 2) reasons.push(`micro-text:${fontSize}px`);
            if (opacity < 0.05) reasons.push(`transparent:${opacity}`);
            if (isPositioned(position) && zIndex < 0) reasons.push(`buried:z=${zIndex},pos=${position}`);
            if (rect.width < 2 || rect.height < 2) reasons.push(`tiny:${Math.round(rect.width)}x${Math.round(rect.height)}`);

            if (rect.left + rect.width < 0 || rect.top + rect.height < 0 ||
                rect.left > window.innerWidth || rect.top > window.innerHeight) {
                reasons.push("offscreen");
            }

            // Use textContent (ignores CSS) for suspicious detection.
            // innerText can be empty for overflow:hidden + tiny elements.
            const visibleText = (el.innerText || "").substring(0, 500).replace(/\s+/g, ' ').trim();
            const rawText = (el.textContent || "").substring(0, 500).replace(/\s+/g, ' ').trim();

            if (visibleText.length > 0 && reasons.length === 0) {
                const fg = parseColor(style.color);
                const bg = parseColor(style.backgroundColor === 'rgba(0, 0, 0, 0)' ? 'rgb(255,255,255)' : style.backgroundColor);
                const l1 = getLuminance(fg.r, fg.g, fg.b);
                const l2 = getLuminance(bg.r, bg.g, bg.b);
                const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
                if (ratio < 1.5) reasons.push(`low-contrast:${ratio.toFixed(2)}`);
            }

            if (reasons.length > 0) {
                // Prefer rawText (textContent) — CSS clipping hides text from innerText
                const suspText = rawText.length > 0 ? rawText : visibleText;
                if (suspText.length > 2) {
                    suspiciousNodes.push({
                        tag: el.tagName,
                        text: suspText,
                        reasons: reasons.join(", "),
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                    });
                }
                continue;
            }
            const cx = rect.x + rect.width / 2;
            const cy = rect.y + rect.height / 2;
            const topEl = document.elementFromPoint(cx, cy);
            let occluded = false;
            if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
                occluded = true;
            }

            const isInteractive = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);

            if (isInteractive) {
                vvIdCounter++;
                el.setAttribute('data-vv-id', `vv-${vvIdCounter}`);
            }

            cleanNodes.push({
                tag: el.tagName,
                text: visibleText.substring(0, 200),
                vv_id: isInteractive ? `vv-${vvIdCounter}` : null,
                interactive: isInteractive,
                occluded,
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                w: Math.round(rect.width),
                h: Math.round(rect.height),
            });
        }

        return { cleanNodes, suspiciousNodes };
    });
}

app.post('/snap', async (req, res) => {
    const { url } = req.body;
    console.log(`[SNAP] Received request for ${url}`);

    let context: BrowserContext | null = null;

    try {
        const browser = await initBrowser();
        context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        await page.addInitScript(() => {
            const observer = new MutationObserver((mutations: MutationRecord[]) => {
                let addedCount = 0;
                for (const m of mutations) {
                    addedCount += m.addedNodes.length;
                }
                if (addedCount > 0) {
                    console.log(`WATCHDOG: ${addedCount} new DOM nodes injected after load`);
                }
            });
            observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
        });

        await gotoWithFallback(page, url);

        try {
            await page.waitForLoadState('networkidle', { timeout: 3000 });
        } catch (e: any) {
            console.warn(`Network idle wait timed out for ${url}: ${e?.message ?? e}`);
        }

        const [result, screenshotBuffer] = await Promise.all([
            injectSanitizer(page),
            page.screenshot({ fullPage: false, type: 'jpeg', quality: 80 })
        ]);
        const cleanDOM = result.cleanNodes;
        const suspiciousDOM = result.suspiciousNodes;

        const id = crypto.randomUUID();
        try {
            // Store raw JPEG bytes in Redis for 60s, shared across services.
            await (redis as any).setBuffer(`vv:img:${id}`, screenshotBuffer as Buffer, 'EX', 60);
        } catch (e: any) {
            console.error(`Redis write failed for screenshot ${id}:`, e?.message ?? e);
            res.status(503).json({ error: "Redis unavailable (screenshot blob store)" });
            return;
        }

        console.log(`[SNAP] Done. ${cleanDOM.length} clean, ${suspiciousDOM.length} suspicious, screenshot captured.`);

        res.json({
            clean_dom: cleanDOM,
            suspicious_nodes: suspiciousDOM,
            screenshot_id: id
        });

    } catch (e: any) {
        console.error("Browser Error:", e.message);
        res.status(500).json({ error: "Pipeline Failed at Phase 2" });
    } finally {
        if (context) {
            try {
                await context.close();
            } catch (e: any) {
                console.error("Failed to close browser context:", e?.message ?? e);
            }
        }
    }
});

// POST /action - Execute click or type action on an element by vv_id
interface ActionRequest {
    sessionId: string;
    action: 'click' | 'type';
    vv_id: string;
    value?: string;
}

interface ActionResponse {
    success: boolean;
    message?: string;
    error?: string;
}

app.post('/action', async (req: express.Request<ActionRequest>, res: express.Response<ActionResponse>) => {
    const { sessionId, action, vv_id, value } = req.body;
    console.log(`[ACTION] Received: ${action} on ${vv_id} for session ${sessionId}`);

    if (!sessionId || !vv_id || !action) {
        return res.status(400).json({
            success: false,
            error: "Missing required fields: sessionId, action, vv_id"
        });
    }

    if (action === 'type' && !value) {
        return res.status(400).json({
            success: false,
            error: "Type action requires 'value' field"
        });
    }

    // Look up session from memory
    const session = sessionStore.get(sessionId);
    if (!session) {
        console.error(`[ACTION] Session not found: ${sessionId}`);
        return res.status(404).json({
            success: false,
            error: "Session not found or expired"
        });
    }

    const { page } = session;

    try {
        // Find element by vv_id attribute
        const selector = `[data-vv-id="${vv_id}"]`;
        const element = await page.$(selector);

        if (!element) {
            console.error(`[ACTION] Element not found: ${vv_id}`);
            return res.status(404).json({
                success: false,
                error: `Element with vv_id "${vv_id}" not found on page`
            });
        }

        // Execute the action
        if (action === 'click') {
            await element.click({ timeout: 5000 });
            console.log(`[ACTION] Clicked element ${vv_id}`);
        } else if (action === 'type') {
            await element.fill(value!, { timeout: 5000 });
            console.log(`[ACTION] Typed into element ${vv_id}`);
        }

        // Wait for network idle to ensure page has finished changing
        try {
            await page.waitForLoadState('networkidle', { timeout: 5000 });
            console.log('[ACTION] Network idle achieved');
        } catch (e: any) {
            console.warn(`[ACTION] Network idle timeout (continuing): ${e?.message ?? e}`);
        }

        res.json({ success: true, message: "Action completed successfully" });

    } catch (e: any) {
        console.error(`[ACTION] Error: ${e?.message ?? e}`);
        res.status(500).json({
            success: false,
            error: `Action failed: ${e?.message ?? e}`
        });
    }
});

// POST /snap-with-session - Navigate and create persistent session
interface SnapWithSessionRequest {
    url: string;
}

interface SnapWithSessionResponse {
    session_id: string;
    clean_dom: any[];
    suspicious_nodes: any[];
    screenshot_id: string;
}

app.post('/snap-with-session', async (req: express.Request<SnapWithSessionRequest>, res: express.Response<SnapWithSessionResponse>) => {
    const { url } = req.body;
    console.log(`[SNAP-SESSION] Received request for ${url}`);

    let context: BrowserContext | null = null;
    let sessionId = crypto.randomUUID();

    try {
        const browser = await initBrowser();
        context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        // Store session in memory
        sessionStore.set(sessionId, { context, page });
        console.log(`[SNAP-SESSION] Created session ${sessionId}`);

        // Set up session expiry
        setTimeout(() => {
            sessionStore.delete(sessionId);
            console.log(`[SNAP-SESSION] Session ${sessionId} expired and cleaned up`);
        }, SESSION_TTL_MS);

        await page.addInitScript(() => {
            const observer = new MutationObserver((mutations: MutationRecord[]) => {
                let addedCount = 0;
                for (const m of mutations) {
                    addedCount += m.addedNodes.length;
                }
                if (addedCount > 0) {
                    console.log(`WATCHDOG: ${addedCount} new DOM nodes injected after load`);
                }
            });
            observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
        });

        await gotoWithFallback(page, url);
        await bypassInterstitialIfPresent(page);

        try {
            await page.waitForLoadState('networkidle', { timeout: 3000 });
        } catch (e: any) {
            console.warn(`Network idle wait timed out for ${url}: ${e?.message ?? e}`);
        }

        const [result, screenshotBuffer] = await Promise.all([
            injectSanitizer(page),
            page.screenshot({ fullPage: false, type: 'jpeg', quality: 80 })
        ]);
        const cleanDOM = result.cleanNodes;
        const suspiciousDOM = result.suspiciousNodes;

        const id = crypto.randomUUID();
        try {
            await (redis as any).setBuffer(`vv:img:${id}`, screenshotBuffer as Buffer, 'EX', 60);
        } catch (e: any) {
            console.error(`Redis write failed for screenshot ${id}:`, e?.message ?? e);
        }

        console.log(`[SNAP-SESSION] Done. Session: ${sessionId}, ${cleanDOM.length} clean, ${suspiciousDOM.length} suspicious`);

        res.json({
            session_id: sessionId,
            clean_dom: cleanDOM,
            suspicious_nodes: suspiciousDOM,
            screenshot_id: id
        });

    } catch (e: any) {
        console.error("Browser Error:", e.message);
        // Clean up session on error
        if (sessionId && sessionStore.has(sessionId)) {
            const session = sessionStore.get(sessionId);
            if (session) {
                await session.context.close().catch(() => {});
            }
            sessionStore.delete(sessionId);
        }
        res.status(500).json({ error: "Pipeline Failed at Phase 2" } as any);
    }
});

// POST /resnap - Take a new DOM snapshot of existing session (for rescan loop)
interface ResnapRequest {
    sessionId: string;
}

interface ResnapResponse {
    session_id: string;
    clean_dom: any[];
    suspicious_nodes: any[];
    screenshot_id: string;
    current_url: string;
}

app.post('/resnap', async (req: express.Request<ResnapRequest>, res: express.Response<ResnapResponse>) => {
    const { sessionId } = req.body;
    console.log(`[RESNAP] Resnapshot request for session ${sessionId}`);

    if (!sessionId) {
        return res.status(400).json({ error: "Missing sessionId" } as any);
    }

    const session = sessionStore.get(sessionId);
    if (!session) {
        console.error(`[RESNAP] Session not found: ${sessionId}`);
        return res.status(404).json({ error: "Session not found or expired" } as any);
    }

    const { page } = session;

    try {
        // Get current URL
        const currentUrl = page.url();
        console.log(`[RESNAP] Current URL: ${currentUrl}`);

        // Wait a moment for any pending animations/transitions
        await page.waitForTimeout(500);

        const [result, screenshotBuffer] = await Promise.all([
            injectSanitizer(page),
            page.screenshot({ fullPage: false, type: 'jpeg', quality: 80 })
        ]);
        const cleanDOM = result.cleanNodes;
        const suspiciousDOM = result.suspiciousNodes;

        const id = crypto.randomUUID();
        try {
            await (redis as any).setBuffer(`vv:img:${id}`, screenshotBuffer as Buffer, 'EX', 60);
        } catch (e: any) {
            console.error(`Redis write failed for screenshot ${id}:`, e?.message ?? e);
        }

        console.log(`[RESNAP] Done. ${cleanDOM.length} clean, ${suspiciousDOM.length} suspicious`);

        res.json({
            session_id: sessionId,
            clean_dom: cleanDOM,
            suspicious_nodes: suspiciousDOM,
            screenshot_id: id,
            current_url: currentUrl
        });

    } catch (e: any) {
        console.error(`[RESNAP] Error: ${e?.message ?? e}`);
        res.status(500).json({ error: "Resnapshot failed" } as any);
    }
});

app.listen(3002, () => console.log('Browser Service running on port 3002'));