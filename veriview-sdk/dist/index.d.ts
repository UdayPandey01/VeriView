/**
 * Configuration options for the VeriView SDK client.
 *
 * The API key is **required** and will be sent as `Authorization: Bearer <apiKey>`
 * on every request to the VeriView Gateway.
 */
export interface VeriViewConfig {
    /** API key provisioned for your VeriView Gateway. */
    apiKey: string;
    /**
     * Base URL of the VeriView Gateway (e.g., "https://veriview.mycorp.com").
      * Defaults to "http://13.51.169.6:8082".
     */
    gatewayUrl?: string;
    /** Request timeout in milliseconds. Defaults to 60_000. */
    timeout?: number;
    /**
     * Whether to fail-secure (block) when the Gateway is unavailable
     * or all retries are exhausted. Defaults to true.
     */
    failSecure?: boolean;
    /**
     * Maximum number of retry attempts for transient errors and 429s.
     * This is the number of retries *after* the initial attempt.
     * Defaults to 3.
     */
    maxRetries?: number;
}
/**
 * Represents an interactive element on the page (button, input, link).
 * Maps directly from `interactive_elements` in the Rust Gateway response.
 */
export interface InteractiveElement {
    /** Unique VeriView identifier (e.g., "vv-1", "vv-2"). */
    vv_id: string;
    /** HTML tag name (e.g., "BUTTON", "INPUT", "A"). */
    tag: string;
    /** Visible text content of the element. */
    text: string;
}
/** Backwards-compatible alias for InteractiveElement. */
export type VeriViewElement = InteractiveElement;
/**
 * Security analysis report from the VeriView Gateway.
 * This is the primary, high-level object your application consumes.
 */
export interface SecurityReport {
    /** Whether the page was blocked due to security threats. */
    blocked: boolean;
    /** Risk score (0–100). Values >50 indicate blocking. */
    riskScore: number;
    /** Human-readable explanation of why the page was blocked or allowed. */
    riskReason: string;
    /**
     * Safe text snapshot – visible text content verified by visual consensus.
     * Empty array if blocked.
     */
    safeSnapshot: string[];
    /**
     * Interactive elements the agent can safely interact with.
     * Empty array if blocked.
     */
    safeElements: InteractiveElement[];
    /** Pipeline execution logs from all phases (Handshake, DOM, Vision, Verdict). */
    logs: string[];
}
/**
 * Raw response from the Gateway's `/api/v1/navigate` endpoint.
 * Mirrors Rust's `NavigateResponse` struct exactly (snake_case).
 */
export interface GatewayResponse {
    safe_snapshot: string[];
    interactive_elements: InteractiveElement[];
    risk_score: number;
    blocked: boolean;
    logs: string[];
}
/**
 * Request payload for the Gateway's `/api/v1/navigate` endpoint.
 */
export interface NavigateRequest {
    url: string;
}
/**
 * Base error type thrown by the VeriView SDK.
 * All operational errors (including rate limiting) extend from this class.
 */
export declare class VeriViewError extends Error {
    /** Optional HTTP status code associated with the error (if any). */
    readonly status?: number;
    /** Optional machine-readable error code. */
    readonly code?: string;
    /** Underlying error / cause (Axios error, etc.). */
    readonly cause?: unknown;
    constructor(message: string, opts?: {
        status?: number;
        code?: string;
        cause?: unknown;
    });
}
/**
 * Error thrown when the VeriView Gateway enforces a 429 rate limit
 * and all SDK retries are exhausted.
 */
export declare class RateLimitError extends VeriViewError {
    /** Optional server-suggested delay in milliseconds before retrying. */
    readonly retryAfterMs?: number;
    constructor(message?: string, opts?: {
        retryAfterMs?: number;
        cause?: unknown;
    });
}
export { SecurityReport as VeriViewSecurityReport, InteractiveElement as VeriViewInteractiveElement };
/**
 * Enterprise-grade VeriView SDK client.
 *
 * This class wraps the VeriView Gateway with:
 * - Strong TypeScript types and rich JSDoc.
 * - Automatic API key authentication.
 * - Connection pooling via keep-alive HTTP/HTTPS agents.
 * - Resilient retries with exponential backoff for transient failures and 429s.
 * - Configurable fail-secure behavior for production-grade safety.
 */
export declare class VeriView {
    private readonly client;
    private readonly config;
    /**
     * Create a new VeriView client.
     *
     * @param config - SDK configuration including the required `apiKey`.
     *
     * @example
     * ```ts
     * const veriview = new VeriView({
     *   apiKey: process.env.VERIVIEW_API_KEY!,
     *   gatewayUrl: 'https://veriview.mycorp.com',
     *   timeout: 30_000,
     *   maxRetries: 3,
     *   failSecure: true,
     * });
     *
     * const report = await veriview.inspect('https://example.com');
     * if (report.blocked) {
     *   console.error('Blocked by VeriView:', report.riskReason);
     * }
     * ```
     */
    constructor(config: VeriViewConfig);
    /**
     * Inspect a URL for security threats using VeriView's multi-phase pipeline.
     *
     * This method is resilient under load:
     * - Automatically retries on 429 and common transient failures.
     * - Applies exponential backoff between retries.
     * - Honors the `failSecure` configuration when all retries are exhausted.
     *
     * @param url - The URL to analyze.
     * @returns A `SecurityReport` representing the Gateway verdict.
     * @throws
     *  - `VeriViewError` for authentication failures (401) or non-retryable errors when
     *    `failSecure` is false.
     *  - `RateLimitError` when rate limits persist after all retries and `failSecure` is false.
     */
    inspect(url: string): Promise<SecurityReport>;
    /**
     * Lightweight health check against the VeriView Gateway.
     *
     * @returns `true` if the `/api/v1/health` endpoint responds, otherwise `false`.
     */
    healthCheck(): Promise<boolean>;
    /**
     * Get the currently configured Gateway base URL.
     */
    getGatewayUrl(): string;
    private toVeriViewError;
    private buildFailSecureReport;
}
