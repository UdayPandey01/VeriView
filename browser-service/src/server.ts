import express from 'express';
import { chromium, Browser } from 'playwright';

const app = express();
app.use(express.json({ limit: '50mb' }));

let browserInstance: Browser | null = null;

async function initBrowser() {
    if (!browserInstance) {
        browserInstance = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
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

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);

        let elementCount = 0;

        while (walker.nextNode()) {
            const el = walker.currentNode as HTMLElement;
            elementCount++;

            if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META'].includes(el.tagName)) continue;

            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();

            const reasons: string[] = [];

            if (style.display === 'none') reasons.push("display:none");
            if (style.visibility === 'hidden') reasons.push("visibility:hidden");
            if (parseFloat(style.opacity) < 0.1) reasons.push(`opacity:${style.opacity}`);
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

    try {
        const browser = await initBrowser();
        const context = await browser.newContext({
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

        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(1500);

        const result = await injectSanitizer(page);
        const cleanDOM = result.cleanNodes;
        const suspiciousDOM = result.suspiciousNodes;
        const screenshotBuffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 80 });

        await context.close();

        console.log(`[SNAP] Done. ${cleanDOM.length} clean, ${suspiciousDOM.length} suspicious, screenshot captured.`);

        res.json({
            clean_dom: cleanDOM,
            suspicious_nodes: suspiciousDOM,
            screenshot_b64: screenshotBuffer.toString('base64')
        });

    } catch (e: any) {
        console.error("Browser Error:", e.message);
        res.status(500).json({ error: "Pipeline Failed at Phase 2" });
    }
});

app.listen(3002, () => console.log('Browser Service running on port 3002'));