# VeriView SDK

TypeScript SDK for VeriView - a security proxy that detects hidden prompt injection attacks using visual-DOM consensus.

## Installation

```bash
npm install veriview-sdk
```

## Quick Start

```typescript
import { VeriView } from "veriview-sdk";

const veriview = new VeriView({
  gatewayUrl: "http://localhost:8082",
  timeout: 60000, // Optional: Request timeout (default: 60s)
  failSecure: true, // Optional: Block on errors (default: true)
});

// Inspect a URL
const report = await veriview.inspect("https://example.com");

if (report.blocked) {
  console.log("⛔ BLOCKED:", report.riskReason);
  console.log("Risk Score:", report.riskScore);
  process.exit(1);
}

// Safe to interact with the page
console.log("✅ SAFE:", report.riskReason);
for (const element of report.safeElements) {
  console.log(`[${element.vv_id}] ${element.tag}: ${element.text}`);
}
```

## API Reference

### `VeriView`

Main SDK class for interacting with VeriView Gateway.

#### Constructor

```typescript
new VeriView(config: VeriViewConfig)
```

**Config Options:**

- `gatewayUrl` (required): Base URL of VeriView Gateway (e.g., `http://localhost:8082`)
- `timeout` (optional): Request timeout in milliseconds (default: 60000)
- `failSecure` (optional): Block on errors (default: true)

#### Methods

##### `inspect(url: string): Promise<SecurityReport>`

Analyzes a URL through VeriView's 4-phase pipeline:

1. **Browser Sanitization**: DOM analysis, hidden element detection
2. **Vision Extraction**: OCR + AI visual analysis
3. **Consensus Verification**: DOM vs Visual comparison
4. **Verdict**: Risk score calculation, blocking decision

Returns a `SecurityReport` with:

- `blocked`: Whether the page was blocked
- `riskScore`: 0-100 (>50 triggers blocking)
- `riskReason`: Human-readable explanation
- `safeSnapshot`: Verified visible text
- `safeElements`: Interactive elements safe to use
- `logs`: Pipeline execution logs

##### `healthCheck(): Promise<boolean>`

Checks if VeriView Gateway is reachable.

##### `getGatewayUrl(): string`

Returns the configured Gateway URL.

## Security Report Structure

```typescript
interface SecurityReport {
  blocked: boolean; // true if threat detected
  riskScore: number; // 0-100 risk level
  riskReason: string; // Why blocked/allowed
  safeSnapshot: string[]; // Visible text content
  safeElements: VeriViewElement[]; // Interactive elements
  logs: string[]; // Pipeline logs
}

interface VeriViewElement {
  vv_id: string; // Unique identifier (e.g., "vv-1")
  tag: string; // HTML tag (e.g., "BUTTON")
  text: string; // Visible text
}
```

## Error Handling

The SDK uses **fail-secure** by default - any errors result in blocking the page:

```typescript
const report = await veriview.inspect(url);
// If Gateway is offline, report.blocked = true
```

To fail-open (allow on errors), set `failSecure: false`:

```typescript
const veriview = new VeriView({
  gatewayUrl: "http://localhost:8082",
  failSecure: false, // Allow pages even if Gateway is down
});
```

## License

MIT
