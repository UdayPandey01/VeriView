import { VeriView } from "../veriview-sdk/dist/index.js";
import { readFileSync, existsSync } from "fs";

const IS_WSL =
  process.platform === "linux" &&
  existsSync("/proc/version") &&
  readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");

const HOST = IS_WSL ? process.env.WINDOWS_HOST || "172.24.48.1" : "localhost";

const veriview = new VeriView({
  apiKey: process.env.VERIVIEW_API_KEY || "test-api-key",
  gatewayUrl: `http://${HOST}:8082`,
  timeout: 60000,
  failSecure: true,
});

const TRAP_SAFE = "http://localhost:8000/trap.html";
const TRAP_ATTACK = "http://localhost:8000/trap.html?attack=true";

async function agentDecision(report, url) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`AGENT: Processing VeriView report for: ${url}`);
  console.log("=".repeat(60));

  console.log(`\nPipeline Logs:`);
  for (const log of report.logs) {
    const prefix =
      log.includes("BLOCKED") || log.includes("GHOST")
        ? "  [WARN] "
        : "  [INFO] ";
    console.log(`${prefix}${log}`);
  }

  console.log(`\nRisk Score: ${report.riskScore}`);
  console.log(`Blocked: ${report.blocked}`);
  console.log(`Reason: ${report.riskReason}`);

  if (report.blocked) {
    console.log(`\n${"X".repeat(30)}`);
    console.log("BLOCKED BY VERIVIEW");
    console.log(`${"X".repeat(30)}`);
    console.log(`\nRisk Score: ${report.riskScore}/100`);
    console.log(`Threat: ${report.riskReason}`);
    console.log("Agent Decision: HALT. Will NOT interact with this page.");
    console.log("Security Event: Logged for human review.");
    console.log(`${"X".repeat(30)}\n`);
    return false;
  }

  console.log(`\n${"=".repeat(30)}`);
  console.log("SAFE - VeriView Verification Passed");
  console.log(`${"=".repeat(30)}`);

  if (report.safeSnapshot.length > 0) {
    console.log(`\nSafe Text Snapshot (${report.safeSnapshot.length} items):`);
    const preview = report.safeSnapshot.slice(0, 5);
    for (const text of preview) {
      console.log(`   "${text}"`);
    }
    if (report.safeSnapshot.length > 5) {
      console.log(`   ... and ${report.safeSnapshot.length - 5} more items`);
    }
  }

  if (report.safeElements.length > 0) {
    console.log(
      `\nInteractive Elements (${report.safeElements.length} found):`,
    );
    for (const el of report.safeElements) {
      const textPreview = el.text ? `"${el.text}"` : "(no text)";
      console.log(`   [${el.vv_id}] <${el.tag}> ${textPreview}`);
    }

    const loginBtn = report.safeElements.find(
      (el) =>
        el.text.toLowerCase().includes("sign in") ||
        el.text.toLowerCase().includes("login") ||
        el.tag === "BUTTON",
    );

    if (loginBtn) {
      console.log(`\nAgent Decision: Found login element`);
      console.log(`   Target: [${loginBtn.vv_id}] <${loginBtn.tag}>`);
      console.log(`   Text: "${loginBtn.text}"`);
      console.log(`   Action: Would click this element (simulated)`);
    } else {
      console.log(`\nAgent Decision: No suitable login button found`);
      console.log(`   Action: Would explore other elements`);
    }
  } else {
    console.log(`\nNo interactive elements found on this page`);
  }

  console.log(`${"=".repeat(30)}\n`);
  return true;
}

async function runDemo() {
  console.log("\n" + "=".repeat(60));
  console.log("VERIVIEW AI AGENT DEMO");
  console.log("=".repeat(60));
  console.log(`Gateway: ${veriview.getGatewayUrl()}`);
  if (IS_WSL) {
    console.log("Environment: WSL (using Windows host IP)");
  }

  console.log("\nPerforming health check...");
  const isHealthy = await veriview.healthCheck();
  if (!isHealthy) {
    console.error("VeriView Gateway is not responding!");
    console.error("Make sure all services are running:");
    console.error("  - Core Gateway on port 8082");
    console.error("  - Browser Service on port 3002");
    console.error("  - Vision Service on port 5000");
    console.error("  - Test Suite on port 8000");
    process.exit(1);
  }
  console.log("VeriView Gateway is healthy\n");

  console.log("\n" + "─".repeat(60));
  console.log("TEST 1: SAFE MODE");
  console.log("─".repeat(60));

  const safeReport = await veriview.inspect(TRAP_SAFE);
  const safeAllowed = await agentDecision(safeReport, TRAP_SAFE);

  console.log("\n" + "─".repeat(60));
  console.log("TEST 2: ATTACK MODE");
  console.log("─".repeat(60));

  const attackReport = await veriview.inspect(TRAP_ATTACK);
  const attackAllowed = await agentDecision(attackReport, TRAP_ATTACK);

  console.log("\n" + "=".repeat(60));
  console.log("DEMO COMPLETE - SUMMARY");
  console.log("=".repeat(60));
  console.log(`\nResults:`);
  console.log(
    `   Safe page risk:    ${safeReport.riskScore}/100  ${safeAllowed ? "Allowed" : "Blocked"}`,
  );
  console.log(
    `   Attack page risk:  ${attackReport.riskScore}/100  ${attackAllowed ? "Allowed" : "Blocked"}`,
  );
  console.log(`   Attack blocked:    ${attackReport.blocked ? "YES" : "NO"}`);

  console.log(`\nKey Insight:`);
  if (attackReport.blocked && !safeReport.blocked) {
    console.log(
      `   VeriView successfully protected the agent from hidden injection!`,
    );
    console.log(`   Safe pages allowed, malicious pages blocked.`);
  } else if (attackReport.blocked === safeReport.blocked) {
    console.log(`   Both pages have the same blocking status.`);
  } else {
    console.log(`   Unexpected result - review logs above.`);
  }

  console.log("=".repeat(60) + "\n");
}

runDemo().catch((error) => {
  console.error("\nDemo failed with error:");
  console.error(error.message);
  console.error("\nTroubleshooting:");
  console.error(
    "  1. Ensure all services are running (use START-ALL-SERVICES.ps1)",
  );
  console.error("  2. Check that ports 3002, 5000, 8000, 8082 are available");
  console.error("  3. Verify GEMINI_API_KEY is set in vision-service/.env");
  console.error("  4. Check service logs for errors\n");
  process.exit(1);
});
