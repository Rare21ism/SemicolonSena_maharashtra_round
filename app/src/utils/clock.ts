/**
 * Monotonic time provider in milliseconds.
 * Returns time tied to performance.now() where available, preventing wall-clock jumps.
 */
export function getMonotonicTimeMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}
