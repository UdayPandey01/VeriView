import { SecurityReport, VeriViewConfig } from './types';
export { SecurityReport, VeriViewElement, VeriViewConfig } from './types';
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
export declare class VeriView {
    private client;
    private config;
    /**
     * Initialize VeriView SDK
     * @param config - Configuration with gateway URL and optional settings
     */
    constructor(config: VeriViewConfig);
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
    inspect(url: string): Promise<SecurityReport>;
    /**
     * Map Gateway's raw response to SDK's SecurityReport interface
     * @private
     */
    private mapToSecurityReport;
    /**
     * Handle errors with fail-secure behavior
     * @private
     */
    private handleError;
    /**
     * Check if VeriView Gateway is reachable
     * @returns true if Gateway responds to health check
     */
    healthCheck(): Promise<boolean>;
    /**
     * Get the configured Gateway URL
     */
    getGatewayUrl(): string;
}
