/**
 * Circuit Breaker Middleware — Prevents repeated failures to Graph API endpoints
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Blocking requests, too many recent failures (5 in 30s)
 * - HALF_OPEN: Testing with a single request after cooldown (60s)
 *
 * Keyed per endpoint path to isolate failures.
 */

import type { Context, Middleware } from "@microsoft/microsoft-graph-client";
import { ServiceError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("circuit-breaker");

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  /** Number of failures to trip the circuit (default: 5) */
  readonly failureThreshold: number;
  /** Time window in ms for counting failures (default: 30_000) */
  readonly failureWindowMs: number;
  /** Cooldown in ms before transitioning from OPEN to HALF_OPEN (default: 60_000) */
  readonly cooldownMs: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  failureWindowMs: 30_000,
  cooldownMs: 60_000,
};

/**
 * Per-endpoint circuit state
 */
interface EndpointCircuit {
  state: CircuitState;
  failures: number[];
  openedAt: number;
}

/**
 * Extract the endpoint path (without query params) from a Graph context.
 */
function extractEndpointKey(context: Context): string {
  try {
    const url = typeof context.request === "string" ? context.request : context.request.url;
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return "unknown";
  }
}

/**
 * Circuit Breaker middleware for Graph API requests.
 *
 * Tracks failures per endpoint and opens the circuit when the failure
 * threshold is exceeded within the configured time window.
 */
export class CircuitBreakerMiddleware implements Middleware {
  private nextMiddleware?: Middleware;
  private readonly circuits = new Map<string, EndpointCircuit>();
  private readonly config: CircuitBreakerConfig;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async execute(context: Context): Promise<void> {
    const endpoint = extractEndpointKey(context);
    const circuit = this.getOrCreateCircuit(endpoint);

    this.checkCircuitState(circuit, endpoint);

    try {
      if (this.nextMiddleware) {
        await this.nextMiddleware.execute(context);
      }

      // Check for error responses (5xx only trigger circuit breaker)
      const status = context.response?.status;
      if (status !== undefined && status >= 500) {
        this.recordFailure(circuit, endpoint);
        return;
      }

      // Success: reset if half-open
      if (circuit.state === "HALF_OPEN") {
        this.resetCircuit(circuit, endpoint);
      }
    } catch (error) {
      this.recordFailure(circuit, endpoint);
      throw error;
    }
  }

  setNext(next: Middleware): void {
    this.nextMiddleware = next;
  }

  /**
   * Get the current state of an endpoint's circuit (for testing/observability).
   */
  getCircuitState(endpoint: string): CircuitState {
    return this.circuits.get(endpoint)?.state ?? "CLOSED";
  }

  /**
   * Reset all circuits (for testing).
   */
  resetAll(): void {
    this.circuits.clear();
  }

  private getOrCreateCircuit(endpoint: string): EndpointCircuit {
    let circuit = this.circuits.get(endpoint);
    if (!circuit) {
      circuit = { state: "CLOSED", failures: [], openedAt: 0 };
      this.circuits.set(endpoint, circuit);
    }
    return circuit;
  }

  private checkCircuitState(circuit: EndpointCircuit, endpoint: string): void {
    if (circuit.state !== "OPEN") {
      return;
    }

    const elapsed = Date.now() - circuit.openedAt;
    if (elapsed >= this.config.cooldownMs) {
      circuit.state = "HALF_OPEN";
      logger.info({ endpoint }, "Circuit breaker transitioned to HALF_OPEN");
      return;
    }

    throw new ServiceError(
      `Circuit breaker is OPEN for endpoint ${endpoint} - too many recent failures. Retry after ${Math.ceil((this.config.cooldownMs - elapsed) / 1000)}s.`,
      503,
    );
  }

  private recordFailure(circuit: EndpointCircuit, endpoint: string): void {
    const now = Date.now();
    circuit.failures.push(now);

    // Remove failures outside the window
    const windowStart = now - this.config.failureWindowMs;
    circuit.failures = circuit.failures.filter((t) => t >= windowStart);

    if (circuit.failures.length >= this.config.failureThreshold) {
      circuit.state = "OPEN";
      circuit.openedAt = now;
      logger.warn(
        { endpoint, failures: circuit.failures.length },
        "Circuit breaker OPENED - too many failures",
      );
    }
  }

  private resetCircuit(circuit: EndpointCircuit, endpoint: string): void {
    circuit.state = "CLOSED";
    circuit.failures = [];
    circuit.openedAt = 0;
    logger.info({ endpoint }, "Circuit breaker reset to CLOSED");
  }
}
