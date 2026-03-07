// Quick test script to verify attack injection is happening
import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto("http://localhost:8000/trap.html?attack=true", {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(1500);

  const result = await page.evaluate(() => {
    const el = document.getElementById("attack-payload");
    if (!el) return { error: "Element not found" };

    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    return {
      exists: true,
      className: el.className,
      textContent: el.textContent,
      textLength: el.textContent?.length || 0,
      innerText: el.innerText,
      innerTextLength: el.innerText?.length || 0,
      style: {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        position: style.position,
      },
      rect: {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top,
      },
    };
  });

  console.log("Attack Payload Analysis:");
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
})();
