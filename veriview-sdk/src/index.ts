import axios, { AxiosInstance, AxiosError } from 'axios';
import * as http from 'http';
import * as https from 'https';

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
     * Defaults to "http://localhost:8082" for local development.
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
export class VeriViewError extends Error {
    /** Optional HTTP status code associated with the error (if any). */
    public readonly status?: number;
    /** Optional machine-readable error code. */
    public readonly code?: string;
    /** Underlying error / cause (Axios error, etc.). */
    public readonly cause?: unknown;

    constructor(message: string, opts?: { status?: number; code?: string; cause?: unknown }) {
        super(message);
        this.name = 'VeriViewError';
        this.status = opts?.status;
        this.code = opts?.code;
        this.cause = opts?.cause;
    }
}

/**
 * Error thrown when the VeriView Gateway enforces a 429 rate limit
 * and all SDK retries are exhausted.
 */
export class RateLimitError extends VeriViewError {
    /** Optional server-suggested delay in milliseconds before retrying. */
    public readonly retryAfterMs?: number;

    constructor(
        message: string = 'VeriView rate limit exceeded',
        opts?: { retryAfterMs?: number; cause?: unknown },
    ) {
        super(message, { status: 429, code: 'RATE_LIMITED', cause: opts?.cause });
        this.name = 'RateLimitError';
        this.retryAfterMs = opts?.retryAfterMs;
    }
}

// Re-export primary types for easy import from the package root.
export { SecurityReport as VeriViewSecurityReport, InteractiveElement as VeriViewInteractiveElement };

interface ResolvedConfig {
    apiKey: string;
    gatewayUrl: string;
    timeout: number;
    failSecure: boolean;
    maxRetries: number;
}

const DEFAULT_GATEWAY_URL = 'http://localhost:8082';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoffDelayMs(attempt: number): number {
    // attempt: 0 -> 500, 1 -> 1000, 2 -> 2000, ...
    const base = 500;
    return base * Math.pow(2, attempt);
}

function parseRetryAfter(headerValue: unknown): number | undefined {
    if (!headerValue) return undefined;
    const value = Array.isArray(headerValue) ? headerValue[0] : String(headerValue);
    const seconds = Number(value);
    if (!Number.isNaN(seconds) && seconds >= 0) {
        return seconds * 1000;
    }
    const date = Date.parse(value);
    if (!Number.isNaN(date)) {
        const diff = date - Date.now();
        return diff > 0 ? diff : undefined;
    }
    return undefined;
}

function mapToSecurityReport(data: GatewayResponse): SecurityReport {
    const elements: InteractiveElement[] = data.interactive_elements.map((el) => ({
        vv_id: el.vv_id,
        tag: el.tag,
        text: el.text,
    }));

    let riskReason: string;
    if (data.blocked) {
        const ghostLog = data.logs.find((log) => log.includes('GHOST TEXT DETECTED'));
        const suspiciousLog = data.logs.find((log) => log.toLowerCase().includes('suspicious'));

        if (ghostLog) {
            riskReason =
                'Hidden prompt injection detected in DOM (ghost text with dangerous keywords).';
        } else if (suspiciousLog) {
            riskReason =
                'Suspicious hidden elements found (opacity, size, or position anomalies).';
        } else {
            riskReason = `Security threat detected (Risk score: ${data.risk_score}).`;
        }
    } else {
        riskReason = 'Page passed visual-DOM consensus verification.';
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
 * Enterprise-grade VeriView SDK client.
 *
 * This class wraps the VeriView Gateway with:
 * - Strong TypeScript types and rich JSDoc.
 * - Automatic API key authentication.
 * - Connection pooling via keep-alive HTTP/HTTPS agents.
 * - Resilient retries with exponential backoff for transient failures and 429s.
 * - Configurable fail-secure behavior for production-grade safety.
 */
export class VeriView {
    private readonly client: AxiosInstance;
    private readonly config: ResolvedConfig;

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
    constructor(config: VeriViewConfig) {
        if (!config || !config.apiKey) {
            throw new VeriViewError('`apiKey` is required when constructing VeriView client');
        }

        this.config = {
            apiKey: config.apiKey,
            gatewayUrl: config.gatewayUrl ?? DEFAULT_GATEWAY_URL,
            timeout: config.timeout ?? DEFAULT_TIMEOUT_MS,
            failSecure: config.failSecure ?? true,
            maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
        };

        const httpAgent = new http.Agent({
            keepAlive: true,
            maxSockets: 100,
        });

        const httpsAgent = new https.Agent({
            keepAlive: true,
            maxSockets: 100,
        });

        this.client = axios.create({
            baseURL: this.config.gatewayUrl,
            timeout: this.config.timeout,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.config.apiKey}`,
            },
            httpAgent,
            httpsAgent,
        });
    }

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
    async inspect(url: string): Promise<SecurityReport> {
        if (!url || typeof url !== 'string') {
            throw new VeriViewError('`url` must be a non-empty string');
        }

        const maxAttempts = this.config.maxRetries + 1; // initial attempt + retries
        let attempt = 0;
        let lastError: unknown;

        while (attempt < maxAttempts) {
            try {
                const response = await this.client.post<GatewayResponse>(
                    '/api/v1/navigate',
                    { url } as NavigateRequest,
                );
                return mapToSecurityReport(response.data);
            } catch (err) {
                lastError = err;
                const axiosError = axios.isAxiosError(err) ? (err as AxiosError) : undefined;
                const status = axiosError?.response?.status;

                // Never retry bad API keys.
                if (status === 401) {
                    throw new VeriViewError('Unauthorized: invalid VeriView API key', {
                        status: 401,
                        code: 'UNAUTHORIZED',
                        cause: err,
                    });
                }

                const isRateLimited = status === 429;
                const isRetryable =
                    isRateLimited ||
                    !axiosError ||
                    status === 500 ||
                    status === 502 ||
                    status === 503 ||
                    status === 504 ||
                    axiosError.code === 'ECONNRESET' ||
                    axiosError.code === 'ECONNABORTED' ||
                    axiosError.code === 'ETIMEDOUT';

                const isLastAttempt = attempt === maxAttempts - 1;

                if (!isRetryable || isLastAttempt) {
                    break;
                }

                // Exponential backoff (and seamless retry for 429).
                const delayMs = computeBackoffDelayMs(attempt);
                await sleep(delayMs);
                attempt += 1;
                continue;
            }
        }

        // All attempts exhausted.
        const axiosError = axios.isAxiosError(lastError) ? (lastError as AxiosError) : undefined;
        const status = axiosError?.response?.status;

        if (status === 429) {
            const retryAfterMs = parseRetryAfter(axiosError?.response?.headers?.['retry-after']);
            const rateError = new RateLimitError('VeriView Gateway rate limit exceeded', {
                retryAfterMs,
                cause: lastError,
            });

            if (this.config.failSecure) {
                return this.buildFailSecureReport(rateError);
            }
            throw rateError;
        }

        const genericError = this.toVeriViewError(lastError);

        if (this.config.failSecure) {
            return this.buildFailSecureReport(genericError);
        }

        throw genericError;
    }

    /**
     * Lightweight health check against the VeriView Gateway.
     *
     * @returns `true` if the `/api/v1/health` endpoint responds, otherwise `false`.
     */
    async healthCheck(): Promise<boolean> {
        try {
            await this.client.get('/api/v1/health', { timeout: 5_000 });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get the currently configured Gateway base URL.
     */
    getGatewayUrl(): string {
        return this.config.gatewayUrl;
    }

    private toVeriViewError(err: unknown): VeriViewError {
        if (err instanceof VeriViewError) {
            return err;
        }

        if (axios.isAxiosError(err)) {
            const axiosError = err as AxiosError;
            const status = axiosError.response?.status;
            const message =
                status != null
                    ? `Gateway request failed with status ${status}`
                    : axiosError.message || 'Gateway request failed';

            return new VeriViewError(message, {
                status,
                code: axiosError.code,
                cause: err,
            });
        }

        const message =
            err instanceof Error ? err.message : `Unknown VeriView error: ${String(err)}`;
        return new VeriViewError(message, { cause: err });
    }

    private buildFailSecureReport(error: VeriViewError): SecurityReport {
        const reason = `FAIL-SECURE: ${error.message}`;

        return {
            blocked: true,
            riskScore: 100,
            riskReason: reason,
            safeSnapshot: [],
            safeElements: [],
            logs: [
                'Phase 1: Gateway request failed',
                `Error: ${error.message}`,
                reason,
            ],
        };
    }
}
