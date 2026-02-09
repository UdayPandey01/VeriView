"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VeriView = void 0;
const axios_1 = __importDefault(require("axios"));
/**
 * VeriView SDK - Client library for the VeriView security proxy
 *
 * Detects hidden prompt injection attacks by analyzing visual-DOM consensus.
 * Provides a fail-secure interface for AI agents to safely navigate web pages.
 *
 * @example
 * ```typescript
 * const veriview = new VeriView({ gatewayUrl: 'http://localhost:8082' });
 * const report = await veriview.inspect('http://example.com');
 *
 * if (report.blocked) {
 *   console.log('Threat detected:', report.riskReason);
 *   process.exit(1);
 * }
 *
 * // Safe to interact with safeElements
 * for (const element of report.safeElements) {
 *   console.log(`[${element.vv_id}] ${element.tag}: ${element.text}`);
 * }
 * ```
 */
class VeriView {
    /**
     * Initialize VeriView SDK
     * @param config - Configuration with gateway URL and optional settings
     */
    constructor(config) {
        this.config = {
            gatewayUrl: config.gatewayUrl,
            timeout: config.timeout ?? 60000,
            failSecure: config.failSecure ?? true,
        };
        this.client = axios_1.default.create({
            baseURL: this.config.gatewayUrl,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    /**
     * Inspect a URL for security threats using VeriView's multi-phase pipeline
     *
     * Pipeline phases:
     * 1. Browser sanitization (DOM analysis, hidden element detection)
     * 2. Vision extraction (OCR + AI visual analysis)
     * 3. Consensus verification (DOM vs Visual comparison)
     * 4. Verdict (Risk score calculation, blocking decision)
     *
     * @param url - The URL to analyze
     * @returns SecurityReport with blocking decision and safe elements
     * @throws Never throws - returns fail-secure report on errors if failSecure=true
     */
    async inspect(url) {
        try {
            // Call Gateway's /api/v1/navigate endpoint
            const response = await this.client.post('/api/v1/navigate', { url });
            return this.mapToSecurityReport(response.data);
        }
        catch (error) {
            return this.handleError(error, url);
        }
    }
    /**
     * Map Gateway's raw response to SDK's SecurityReport interface
     * @private
     */
    mapToSecurityReport(data) {
        const elements = data.interactive_elements.map((el) => ({
            vv_id: el.vv_id,
            tag: el.tag,
            text: el.text,
        }));
        let riskReason;
        if (data.blocked) {
            // Extract threat details from logs
            const ghostLog = data.logs.find((log) => log.includes('GHOST TEXT DETECTED'));
            const suspiciousLog = data.logs.find((log) => log.includes('suspicious'));
            if (ghostLog) {
                riskReason = 'Hidden prompt injection detected in DOM (ghost text with dangerous keywords)';
            }
            else if (suspiciousLog) {
                riskReason = 'Suspicious hidden elements found (opacity, size, or position anomalies)';
            }
            else {
                riskReason = `Security threat detected (Risk score: ${data.risk_score})`;
            }
        }
        else {
            riskReason = 'Page passed visual-DOM consensus verification';
        }
        return {
            blocked: data.blocked,
            riskScore: data.risk_score,
            riskReason,
            safeSnapshot: data.safe_snapshot,
            safeElements: elements,
            logs: data.logs,
        };
    }
    /**
     * Handle errors with fail-secure behavior
     * @private
     */
    handleError(error, url) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        let reason;
        if (axios_1.default.isAxiosError(error)) {
            const axiosError = error;
            if (axiosError.code === 'ECONNREFUSED') {
                reason = `VeriView Gateway offline (${this.config.gatewayUrl})`;
            }
            else if (axiosError.response?.status === 500) {
                reason = 'VeriView Gateway internal error';
            }
            else if (axiosError.code === 'ETIMEDOUT') {
                reason = `Request timeout (>${this.config.timeout}ms)`;
            }
            else {
                reason = `Gateway error: ${axiosError.message}`;
            }
        }
        else {
            reason = `Unknown error: ${errorMessage}`;
        }
        if (this.config.failSecure) {
            // Fail-secure: Block the page on any error
            return {
                blocked: true,
                riskScore: 100,
                riskReason: `FAIL-SECURE: ${reason}`,
                safeSnapshot: [],
                safeElements: [],
                logs: [
                    'Phase 1: Gateway connection failed',
                    `Error: ${reason}`,
                    'FAIL-SECURE: Blocking page due to security service unavailability',
                ],
            };
        }
        else {
            // Fail-open: Allow the page but log the error
            return {
                blocked: false,
                riskScore: 0,
                riskReason: `FAIL-OPEN: ${reason} (proceeding without verification)`,
                safeSnapshot: [`[ERROR] ${reason}`],
                safeElements: [],
                logs: [
                    'Phase 1: Gateway connection failed',
                    `Error: ${reason}`,
                    'FAIL-OPEN: Allowing page despite security service unavailability',
                ],
            };
        }
    }
    /**
     * Check if VeriView Gateway is reachable
     * @returns true if Gateway responds to health check
     */
    async healthCheck() {
        try {
            await this.client.get('/api/v1/health', { timeout: 5000 });
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get the configured Gateway URL
     */
    getGatewayUrl() {
        return this.config.gatewayUrl;
    }
}
exports.VeriView = VeriView;
