import crypto from "crypto";

/**
 * Generate a UUID v4-style idempotency key for Stripe API calls.
 * Ensures that retries of the same operation don't create duplicate charges.
 */
export function generateIdempotencyKey(prefix: string = "vc"): string {
  const uuid = crypto.randomUUID();
  return `${prefix}_${uuid}`;
}

/**
 * Simple in-memory store to track recently-used idempotency keys.
 * Prevents accidental duplicate submissions within a time window.
 */
class IdempotencyStore {
  private keys: Map<string, { timestamp: number; result?: any }> = new Map();
  private readonly ttlMs: number;

  constructor(ttlMinutes: number = 30) {
    this.ttlMs = ttlMinutes * 60 * 1000;
    // Periodic cleanup every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if a key has been used recently.
   * Returns the cached result if the key exists, or null if it's new.
   */
  check(key: string): { isDuplicate: boolean; cachedResult?: any } {
    const entry = this.keys.get(key);
    if (!entry) {
      return { isDuplicate: false };
    }
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.keys.delete(key);
      return { isDuplicate: false };
    }
    return { isDuplicate: true, cachedResult: entry.result };
  }

  /**
   * Record a key as used, optionally storing the result for dedup responses.
   */
  record(key: string, result?: any): void {
    this.keys.set(key, { timestamp: Date.now(), result });
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.keys.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.keys.delete(key);
      }
    }
  }
}

export const idempotencyStore = new IdempotencyStore();
