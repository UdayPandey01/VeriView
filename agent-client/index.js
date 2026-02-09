import { VeriView } from "../veriview-sdk/dist/index.js";
import { readFileSync, existsSync } from "fs";

// Detect WSL environment for cross-platform compatibility
const IS_WSL =
  process.platform === "linux" &&
  existsSync("/proc/version") &&
  readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");

const HOST = IS_WSL ? process.env.WINDOWS_HOST || "172.24.48.1" : "localhost";

// Initialize VeriView SDK
const veriview = new VeriView({
  gatewayUrl: `http://${HOST}:8082`,
  timeout: 60000,
  failSecure: true, // Block on any Gateway errors
});

const TRAP_SAFE = "http://localhost:8000/trap.html";
const TRAP_ATTACK = "http://localhost:8000/trap.html?attack=true";

/**
 * Agent's decision logic based on VeriView security report
 */
async function agentDecision(report, url) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`AGENT: Processing VeriView report for: ${url}`);
  console.log("=".repeat(60));

  // Display pipeline logs
  console.log(`\n📋 Pipeline Logs:`);
  for (const log of report.logs) {
    const prefix =
      log.includes("BLOCKED") || log.includes("GHOST") ? "  ⚠️ " : "  ℹ️ ";
    console.log(`${prefix}${log}`);
  }

  console.log(`\n📊 Risk Score: ${report.riskScore}`);
  console.log(`🛡️  Blocked: ${report.blocked}`);
  console.log(`💬 Reason: ${report.riskReason}`);

  // Check if page is blocked
  if (report.blocked) {
    console.log(`\n${"⛔".repeat(30)}`);
    console.log("🚨 BLOCKED BY VERIVIEW");
    console.log(`${"⛔".repeat(30)}`);
    console.log(`\n🔴 Risk Score: ${report.riskScore}/100`);
    console.log(`🔴 Threat: ${report.riskReason}`);
    console.log("🔴 Agent Decision: HALT. Will NOT interact with this page.");
    console.log("🔴 Security Event: Logged for human review.");
    console.log(`${"⛔".repeat(30)}\n`);
    return false;
  }

  // Page is safe - proceed with interaction
  console.log(`\n${"✅".repeat(30)}`);
  console.log("✅ SAFE - VeriView Verification Passed");
  console.log(`${"✅".repeat(30)}`);

  // Display safe snapshot
  if (report.safeSnapshot.length > 0) {
    console.log(
      `\n📄 Safe Text Snapshot (${report.safeSnapshot.length} items):`,
    );
    const preview = report.safeSnapshot.slice(0, 5);
    for (const text of preview) {
      console.log(`   "${text}"`);
    }
    if (report.safeSnapshot.length > 5) {
      console.log(`   ... and ${report.safeSnapshot.length - 5} more items`);
    }
  }

  // Display and analyze interactive elements
  if (report.safeElements.length > 0) {
    console.log(
      `\n🎯 Interactive Elements (${report.safeElements.length} found):`,
    );
    for (const el of report.safeElements) {
      const textPreview = el.text ? `"${el.text}"` : "(no text)";
      console.log(`   [${el.vv_id}] <${el.tag}> ${textPreview}`);
    }

    // AI Agent Logic: Find login button
    const loginBtn = report.safeElements.find(
      (el) =>
        el.text.toLowerCase().includes("sign in") ||
        el.text.toLowerCase().includes("login") ||
        el.tag === "BUTTON",
    );

    if (loginBtn) {
      console.log(`\n🤖 Agent Decision: Found login element`);
      console.log(`   Target: [${loginBtn.vv_id}] <${loginBtn.tag}>`);
      console.log(`   Text: "${loginBtn.text}"`);
      console.log(`   Action: Would click this element (simulated)`);
    } else {
      console.log(`\n🤖 Agent Decision: No suitable login button found`);
      console.log(`   Action: Would explore other elements`);
    }
  } else {
    console.log(`\n🤖 No interactive elements found on this page`);
  }

  console.log(`${"✅".repeat(30)}\n`);
  return true;
}

/**
 * Run the demo - test both safe and attack scenarios
 */
async function runDemo() {
  console.log("\n" + "🔷".repeat(60));
  console.log("🔷  VERIVIEW AI AGENT DEMO");
  console.log("🔷".repeat(60));
  console.log(`📡 Gateway: ${veriview.getGatewayUrl()}`);
  if (IS_WSL) {
    console.log("💻 Environment: WSL (using Windows host IP)");
  }

  // Health check
  console.log("\n🏥 Performing health check...");
  const isHealthy = await veriview.healthCheck();
  if (!isHealthy) {
    console.error("❌ VeriView Gateway is not responding!");
    console.error("Make sure all services are running:");
    console.error("  - Core Gateway on port 8082");
    console.error("  - Browser Service on port 3002");
    console.error("  - Vision Service on port 5000");
    console.error("  - Test Suite on port 8000");
    process.exit(1);
  }
  console.log("✅ VeriView Gateway is healthy\n");

  // Test 1: Safe page
  console.log("\n" + "─".repeat(60));
  console.log("📋 TEST 1: SAFE MODE");
  console.log("─".repeat(60));

  const safeReport = await veriview.inspect(TRAP_SAFE);
  const safeAllowed = await agentDecision(safeReport, TRAP_SAFE);

  // Test 2: Attack page
  console.log("\n" + "─".repeat(60));
  console.log("📋 TEST 2: ATTACK MODE");
  console.log("─".repeat(60));

  const attackReport = await veriview.inspect(TRAP_ATTACK);
  const attackAllowed = await agentDecision(attackReport, TRAP_ATTACK);

  // Summary
  console.log("\n" + "🔷".repeat(60));
  console.log("🔷  DEMO COMPLETE - SUMMARY");
  console.log("🔷".repeat(60));
  console.log(`\n📊 Results:`);
  console.log(
    `   Safe page risk:    ${safeReport.riskScore}/100  ${safeAllowed ? "✅ Allowed" : "❌ Blocked"}`,
  );
  console.log(
    `   Attack page risk:  ${attackReport.riskScore}/100  ${attackAllowed ? "⚠️ Allowed" : "✅ Blocked"}`,
  );
  console.log(
    `   Attack blocked:    ${attackReport.blocked ? "✅ YES" : "❌ NO"}`,
  );

  console.log(`\n💡 Key Insight:`);
  if (attackReport.blocked && !safeReport.blocked) {
    console.log(
      `   ✅ VeriView successfully protected the agent from hidden injection!`,
    );
    console.log(`   ✅ Safe pages allowed, malicious pages blocked.`);
  } else if (attackReport.blocked === safeReport.blocked) {
    console.log(`   ⚠️  Both pages have the same blocking status.`);
  } else {
    console.log(`   ⚠️  Unexpected result - review logs above.`);
  }

  console.log("🔷".repeat(60) + "\n");
}

// Run demo with error handling
runDemo().catch((error) => {
  console.error("\n❌ Demo failed with error:");
  console.error(error.message);
  console.error("\n📋 Troubleshooting:");
  console.error(
    "  1. Ensure all services are running (use START-ALL-SERVICES.ps1)",
  );
  console.error("  2. Check that ports 3002, 5000, 8000, 8082 are available");
  console.error("  3. Verify GEMINI_API_KEY is set in vision-service/.env");
  console.error("  4. Check service logs for errors\n");
  process.exit(1);
});
