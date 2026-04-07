"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VeriView = exports.RateLimitError = exports.VeriViewError = void 0;
const axios_1 = __importDefault(require("axios"));
const http = __importStar(require("http"));
const https = __importStar(require("https"));
/**
 * Base error type thrown by the VeriView SDK.
 * All operational errors (including rate limiting) extend from this class.
 */
class VeriViewError extends Error {
    constructor(message, opts) {
        super(message);
        this.name = 'VeriViewError';
        this.status = opts?.status;
        this.code = opts?.code;
        this.cause = opts?.cause;
    }
}
exports.VeriViewError = VeriViewError;
/**
 * Error thrown when the VeriView Gateway enforces a 429 rate limit
 * and all SDK retries are exhausted.
 */
class RateLimitError extends VeriViewError {
    constructor(message = 'VeriView rate limit exceeded', opts) {
        super(message, { status: 429, code: 'RATE_LIMITED', cause: opts?.cause });
        this.name = 'RateLimitError';
        this.retryAfterMs = opts?.retryAfterMs;
    }
}
exports.RateLimitError = RateLimitError;
const DEFAULT_GATEWAY_URL = 'http://13.51.169.6:8082';
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_RETRIES = 3;
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function computeBackoffDelayMs(attempt) {
    // attempt: 0 -> 500, 1 -> 1000, 2 -> 2000, ...
    const base = 500;
    return base * Math.pow(2, attempt);
}
function parseRetryAfter(headerValue) {
    if (!headerValue)
        return undefined;
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
function mapToSecurityReport(data) {
    const elements = data.interactive_elements.map((el) => ({
        vv_id: el.vv_id,
        tag: el.tag,
        text: el.text,
    }));
    let riskReason;
    if (data.blocked) {
        const ghostLog = data.logs.find((log) => log.includes('GHOST TEXT DETECTED'));
        const suspiciousLog = data.logs.find((log) => log.toLowerCase().includes('suspicious'));
        if (ghostLog) {
            riskReason =
                'Hidden prompt injection detected in DOM (ghost text with dangerous keywords).';
        }
        else if (suspiciousLog) {
            riskReason =
                'Suspicious hidden elements found (opacity, size, or position anomalies).';
        }
        else {
            riskReason = `Security threat detected (Risk score: ${data.risk_score}).`;
        }
    }
    else {
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
class VeriView {
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
    constructor(config) {
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
        this.client = axios_1.default.create({
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
    async inspect(url) {
        if (!url || typeof url !== 'string') {
            throw new VeriViewError('`url` must be a non-empty string');
        }
        const maxAttempts = this.config.maxRetries + 1; // initial attempt + retries
        let attempt = 0;
        let lastError;
        while (attempt < maxAttempts) {
            try {
                const response = await this.client.post('/api/v1/navigate', { url });
                return mapToSecurityReport(response.data);
            }
            catch (err) {
                lastError = err;
                const axiosError = axios_1.default.isAxiosError(err) ? err : undefined;
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
                const isRetryable = isRateLimited ||
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
        const axiosError = axios_1.default.isAxiosError(lastError) ? lastError : undefined;
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
     * Get the currently configured Gateway base URL.
     */
    getGatewayUrl() {
        return this.config.gatewayUrl;
    }
    toVeriViewError(err) {
        if (err instanceof VeriViewError) {
            return err;
        }
        if (axios_1.default.isAxiosError(err)) {
            const axiosError = err;
            const status = axiosError.response?.status;
            const message = status != null
                ? `Gateway request failed with status ${status}`
                : axiosError.message || 'Gateway request failed';
            return new VeriViewError(message, {
                status,
                code: axiosError.code,
                cause: err,
            });
        }
        const message = err instanceof Error ? err.message : `Unknown VeriView error: ${String(err)}`;
        return new VeriViewError(message, { cause: err });
    }
    buildFailSecureReport(error) {
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
exports.VeriView = VeriView;
