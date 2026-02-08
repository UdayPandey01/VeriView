import express from 'express';
import bodyParser from 'body-parser';
import { chromium, Browser } from 'playwright';

const app = express();
app.use(bodyParser.json());

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

        function getLuminance(r: number, g: number, b: number) {
            const a = [r, g, b].map(v => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            });
            return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
        }

        // Helper: Parse RGB/RGBA string from ComputedStyle
        function parseColor(colorStr: string) {
            const m = colorStr.match(/\d+/g);
            return m ? { r: parseInt(m[0]), g: parseInt(m[1]), b: parseInt(m[2]) } : { r: 0, g: 0, b: 0 };
        }

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);

        while (walker.nextNode()) {
            const el = walker.currentNode as HTMLElement;
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();

            // 1. OPACITY & VISIBILITY CHECK
            if (parseFloat(style.opacity) < 0.1 || style.display === 'none' || style.visibility === 'hidden') {
                continue; // DELETE NODE (Skip it)
            }

            // 2. GEOMETRY CHECK (The "Pixel Dust")
            if (rect.width < 2 || rect.height < 2) {
                continue; // DELETE NODE
            }

            // 3. CONTRAST RATIO CHECK (The Invisible Text)
            // We only check text nodes or inputs to save performance
            if (el.innerText && el.innerText.length > 0) {
                const fg = parseColor(style.color);
                // Simplify background finding (defaulting to white if transparent)
                const bg = parseColor(style.backgroundColor === 'rgba(0, 0, 0, 0)' ? 'rgb(255,255,255)' : style.backgroundColor);

                const l1 = getLuminance(fg.r, fg.g, fg.b);
                const l2 = getLuminance(bg.r, bg.g, bg.b);
                const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

                if (ratio < 1.5) {
                    continue; // DELETE NODE (Low Contrast)
                }
            }

            // 4. Z-INDEX STACKING (The Hidden Layer)
            const cx = rect.x + rect.width / 2;
            const cy = rect.y + rect.height / 2;
            const topEl = document.elementFromPoint(cx, cy);

            // If the element at this position is NOT us (or our child/parent), we are covered.
            if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
                // We verify if it's suspicious coverage
                el.setAttribute('data-veriview-flag', 'occluded');
            }

            // PASSED ALL CHECKS: Add to CleanDOM
            cleanNodes.push({
                tag: el.tagName,
                text: el.innerText ? el.innerText.substring(0, 100).replace(/\s+/g, ' ').trim() : "",
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                w: Math.round(rect.width),
                h: Math.round(rect.height),
                interactive: ['BUTTON', 'A', 'INPUT'].includes(el.tagName)
            });
        }
        return cleanNodes;
    });
}

app.post('/snap', async (req, res) => {
    const { url } = req.body;
    console.log(`Phase 1: Handshake accepted for ${url}`);

    try {
        const browser = await initBrowser();
        // Phase 2: Set Context with Desktop Viewport
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        // --- PHASE 6: TEMPORAL WATCHDOG ---
        await page.addInitScript(() => {
            const observer = new MutationObserver((mutations) => {
                let addedCount = 0;
                for (const m of mutations) {
                    addedCount += m.addedNodes.length;
                }
                if (addedCount > 0) {
                    console.log(`⚠️ WATCHDOG ALERT: ${addedCount} New DOM Nodes Injected after load!`);
                }
            });
            observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
        });

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Wait a moment for layout to stabilize
        await page.waitForTimeout(1000);

        // Execute Phase 2 (Sanitization)
        const cleanDOM = await injectSanitizer(page);

        // Capture Screenshot for Phase 3
        const screenshotBuffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 80 });

        await context.close();

        res.json({
            clean_dom: cleanDOM, // The Sanitized List
            screenshot_b64: screenshotBuffer.toString('base64')
        });

    } catch (e: any) {
        console.error("❌ Browser Error:", e.message);
        res.status(500).json({ error: "Pipeline Failed at Phase 2" });
    }
});

app.listen(3002, () => console.log('Service 1: Browser (Speed Trap) running on 3002'));