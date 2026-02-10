# VeriView SDK

Official TypeScript/JavaScript SDK for VeriView - A visual-DOM consensus security proxy that detects hidden prompt injection attacks targeting AI agents.

## Installation

```bash
npm install @veriview/veriview-core
```

## Quick Start

```typescript
import { VeriView } from "@veriview/veriview-core";

// Initialize the client with your VeriView Gateway endpoint
const veriview = new VeriView({
  gatewayUrl: "http://localhost:8082", // Backend server performing visual analysis
  timeout: 60000, // Optional: Request timeout in ms (default: 60000)
  failSecure: true, // Optional: Block pages on errors (default: true)
});

// Inspect a URL for security threats
const report = await veriview.inspect("https://example.com");

if (report.blocked) {
  console.error("BLOCKED:", report.riskReason);
  console.error("Risk Score:", report.riskScore);
  process.exit(1);
}

// Safe to interact - page passed visual verification
console.log("SAFE:", report.riskReason);
console.log("Safe Snapshot:", report.safeSnapshot);

// Access verified interactive elements
for (const element of report.safeElements) {
  console.log(`[${element.vv_id}] ${element.tag}: ${element.text}`);
}
```

## Configuration

### `VeriViewConfig`

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `gatewayUrl` | `string` | Yes | - | Base URL of the VeriView Gateway server. This is the backend service that orchestrates DOM sanitization, screenshot capture, OCR analysis, and threat detection. Use `http://localhost:8082` for local development. |
| `timeout` | `number` | No | `60000` | Maximum time (in milliseconds) to wait for the Gateway to complete analysis. Recommended: 60s+ for complex pages. |
| `failSecure` | `boolean` | No | `true` | Security policy for error handling. If `true`, any Gateway errors result in blocking the page. If `false`, errors allow the page (fail-open). **Production recommendation: `true`**. |

**Example - Production Configuration:**

```typescript
const veriview = new VeriView({
  gatewayUrl: process.env.VERIVIEW_GATEWAY_URL || "http://localhost:8082",
  timeout: 90000, // 90s for high-latency networks
  failSecure: true, // Block on errors
});
```

## API Reference

### Class: `VeriView`

Main SDK client for interacting with the VeriView Gateway.

#### Constructor

```typescript
new VeriView(config: VeriViewConfig)
```

**Parameters:**
- `config` - Configuration object (see Configuration section above)

**Throws:**
- No exceptions - validation errors are caught and handled via fail-secure policy

---

#### Method: `inspect(url: string): Promise<SecurityReport>`

Submits a URL to the VeriView Gateway for security analysis through a 4-phase pipeline:

1. **Phase 1: Browser Service** - Playwright captures DOM, applies physics-based sanitization
2. **Phase 2: Vision Service** - Screenshot + OCR + Gemini AI analysis
3. **Phase 3: Consensus Engine** - Compares DOM text vs visually rendered text
4. **Phase 4: Verdict** - Calculates risk score, applies blocking policy

**Parameters:**
- `url` - The target URL to analyze (must be a valid HTTP/HTTPS URL)

**Returns:** `Promise<SecurityReport>`

**Example:**

```typescript
try {
  const report = await veriview.inspect("https://suspicious-site.com");
  
  if (report.blocked) {
    console.log(`Threat detected: ${report.riskReason}`);
    console.log(`Risk Score: ${report.riskScore}/100`);
    console.log(`Pipeline Logs:`, report.logs);
  } else {
    console.log(`Verified safe: ${report.riskReason}`);
    console.log(`Interactive elements:`, report.safeElements.length);
  }
} catch (error) {
  // Network errors, timeouts, etc.
  console.error("SDK Error:", error);
}
```

---

#### Method: `healthCheck(): Promise<boolean>`

Checks connectivity to the VeriView Gateway.

**Returns:** `Promise<boolean>` - `true` if Gateway is reachable, `false` otherwise

**Example:**

```typescript
const isOnline = await veriview.healthCheck();
if (!isOnline) {
  console.error("VeriView Gateway is unreachable");
}
```

---

#### Method: `getGatewayUrl(): string`

Returns the currently configured Gateway URL.

**Returns:** `string` - The Gateway base URL

---

### Interface: `SecurityReport`

The result object returned by `inspect()`.

```typescript
interface SecurityReport {
  blocked: boolean;        // Whether the page was blocked
  riskScore: number;       // Risk level (0-100, >50 triggers block)
  riskReason: string;      // Human-readable explanation
  safeSnapshot: string[];  // Verified visible text content
  safeElements: VeriViewElement[]; // Interactive elements safe to use
  logs: string[];          // Pipeline execution logs
}
```

**Field Descriptions:**

- **`blocked`**: `true` if the page contains detected threats (risk score > 50) or if fail-secure triggered on errors
- **`riskScore`**: Integer from 0 (completely safe) to 100 (critical threat). Scores above 50 automatically trigger blocking.
- **`riskReason`**: Detailed explanation suitable for logging. Examples: "GHOST TEXT DETECTED", "Gemini API quota exceeded - fail-secure triggered"
- **`safeSnapshot`**: Array of strings representing the verified visible text. This is the sanitized content that passed visual-DOM consensus.
- **`safeElements`**: Interactive elements (buttons, inputs, links) that have been visually verified and are safe for AI agents to interact with.
- **`logs`**: Array of timestamped log entries from each pipeline phase. Useful for debugging and audit trails.

---

### Interface: `VeriViewElement`

Represents a verified interactive element on the page.

```typescript
interface VeriViewElement {
  vv_id: string;  // Unique identifier (e.g., "vv-1", "vv-2")
  tag: string;    // HTML tag name (e.g., "BUTTON", "INPUT", "A")
  text: string;   // Visible text content
}
```

**Usage Example:**

```typescript
const report = await veriview.inspect(url);

// Find a specific button
const loginButton = report.safeElements.find(
  el => el.tag === "BUTTON" && el.text.includes("Login")
);

if (loginButton) {
  console.log(`Safe to click: ${loginButton.vv_id}`);
}
```

## Error Handling

### Fail-Secure Mode (Default)

By default, the SDK operates in **fail-secure** mode. Any errors (network failures, Gateway downtime, API timeouts) result in the page being **blocked**:

```typescript
const veriview = new VeriView({
  gatewayUrl: "http://localhost:8082",
  failSecure: true, // Default
});

const report = await veriview.inspect(url);
// If Gateway is offline: report.blocked = true
// If timeout occurs: report.blocked = true
// If any error: report.blocked = true
```

**Use case:** Production AI agents where security is critical. It's safer to block a potentially safe page than to allow a malicious one.

---

### Fail-Open Mode

For development or non-critical use cases, you can disable fail-secure:

```typescript
const veriview = new VeriView({
  gatewayUrl: "http://localhost:8082",
  failSecure: false, // Allow pages even on errors
});

const report = await veriview.inspect(url);
// If Gateway is offline: report.blocked = false (logs contain error)
// If timeout: report.blocked = false
```

**Warning:** Only use `failSecure: false` in development or when you have a fallback security mechanism.

---

### Error Response Structure

When fail-secure triggers, the `SecurityReport` contains diagnostic information:

```typescript
{
  blocked: true,
  riskScore: 100,
  riskReason: "Gateway timeout - fail-secure policy applied",
  safeSnapshot: [],
  safeElements: [],
  logs: ["Error: ECONNREFUSED - Could not connect to Gateway"]
}
```

## Advanced Usage

### Environment-Based Configuration

```typescript
const veriview = new VeriView({
  gatewayUrl: process.env.VERIVIEW_GATEWAY_URL || "http://localhost:8082",
  timeout: parseInt(process.env.VERIVIEW_TIMEOUT || "60000"),
  failSecure: process.env.NODE_ENV === "production",
});
```

### Logging and Monitoring

```typescript
const report = await veriview.inspect(url);

// Log all pipeline events
report.logs.forEach(log => console.log(log));

// Monitor risk scores
if (report.riskScore > 30 && report.riskScore <= 50) {
  console.warn("Medium risk detected:", report.riskReason);
}

// Audit trail
if (report.blocked) {
  auditLog.write({
    timestamp: new Date().toISOString(),
    url,
    riskScore: report.riskScore,
    reason: report.riskReason,
  });
}
```

### Retry Logic

```typescript
async function inspectWithRetry(url: string, maxRetries = 3): Promise<SecurityReport> {
  for (let i = 0; i < maxRetries; i++) {
    const report = await veriview.inspect(url);
    
    // Retry if fail-secure was triggered due to network issues
    if (report.blocked && report.logs.some(log => log.includes("timeout"))) {
      console.log(`Retry ${i + 1}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      continue;
    }
    
    return report;
  }
  
  throw new Error("Max retries reached");
}
```

## Requirements

- **Node.js**: 16.x or higher
- **VeriView Gateway**: Running instance (see [VeriView repository](https://github.com/udaypandey01/veriview))
- **Network**: Access to the Gateway endpoint

## License

MIT

