/**
 * Represents an interactive element on the page (button, input, link)
 * Extracted from the Gateway's NavigateResponse.interactive_elements
 */
export interface VeriViewElement {
    /** Unique VeriView identifier (e.g., "vv-1", "vv-2") */
    vv_id: string;
    /** HTML tag name (e.g., "BUTTON", "INPUT", "A") */
    tag: string;
    /** Visible text content of the element */
    text: string;
}
/**
 * Security analysis report from VeriView Gateway
 * Maps to the Rust Gateway's NavigateResponse structure
 */
export interface SecurityReport {
    /** Whether the page was blocked due to security threats */
    blocked: boolean;
    /** Risk score (0-100). Values >50 trigger blocking */
    riskScore: number;
    /** Human-readable explanation of why the page was blocked or allowed */
    riskReason: string;
    /**
     * Safe text snapshot - visible text content verified by visual consensus
     * Empty array if blocked
     */
    safeSnapshot: string[];
    /**
     * Interactive elements the agent can safely interact with
     * Empty array if blocked
     */
    safeElements: VeriViewElement[];
    /** Pipeline execution logs from all phases (Handshake, DOM, Vision, Verdict) */
    logs: string[];
}
/**
 * Raw response from the Gateway's /api/v1/navigate endpoint
 * Direct mapping to Rust's NavigateResponse struct
 */
export interface GatewayResponse {
    safe_snapshot: string[];
    interactive_elements: Array<{
        vv_id: string;
        tag: string;
        text: string;
    }>;
    risk_score: number;
    blocked: boolean;
    logs: string[];
}
/**
 * Request payload for the Gateway's /api/v1/navigate endpoint
 */
export interface NavigateRequest {
    url: string;
}
/**
 * Configuration options for VeriView SDK
 */
export interface VeriViewConfig {
    /** Base URL of the VeriView Gateway (e.g., "http://localhost:8082") */
    gatewayUrl: string;
    /** Request timeout in milliseconds (default: 60000) */
    timeout?: number;
    /** Whether to fail-secure (block) on Gateway errors (default: true) */
    failSecure?: boolean;
}
