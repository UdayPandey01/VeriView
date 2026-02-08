import { chromium, Browser, Page } from 'playwright';

let browserInstance: Browser | null = null;

export async function initBrowser() {
    if (!browserInstance) {
        console.log("Launching headless chromium...");
        browserInstance = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ]
        })
    }
    return browserInstance;
}

export async function extractDomMap(page: any) {

}

export async function capturePage(url: string) {
    const browser = await initBrowser();
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    try {
        console.log(`Navigating to ${url}...`);

        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

        await page.waitForTimeout(2000);

        const screenshotBuffer = await page.screenshot({ path: 'desktop_capture.jpg', fullPage: true, type: 'jpeg', quality: 80 });
        console.log("Saved debug image to browser-service/desktop_capture.jpg");
        const screenshotBase64 = screenshotBuffer.toString('base64');

        await page.evaluate(() => {
            console.log("VeriView: Running Smart Sanitization on DOM");

            const elements = document.querySelectorAll('*');
            let removed = 0;
            elements.forEach((el) => {
                const style = window.getComputedStyle(el);

                if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
                    el.remove();
                    removed++;
                }
            });

            console.log(`Sanitization complete - removed ${removed} hidden elements`);
        });

        await page.evaluate(() => {
            window.addEventListener('load', () => {
                const observer = new MutationObserver((mutations) => {
                    fetch('http://localhost:8082/api/v1/alert', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            url: document.location.href,
                            alert_type: 'DYNAMIC_INJECTION',
                            details: 'MutationObserver detected' + mutations.length + 'new node'
                        })
                    }).catch((error) => {
                        console.error('Error sending alert:', error);
                    })
                })
                observer.observe(document.body, { childList: true, subtree: true })
            })
        })

        const dom = await page.content();

        await context.close();

        return { dom, screenshot_b64: screenshotBase64 };
    } catch (error) {
        await context.close();
        throw error;
    }
}