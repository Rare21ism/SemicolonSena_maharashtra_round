import type { ExtendedCaptionMessage } from "../components/CaptionLine";

/**
 * Updates caption list keyed by line_id only.
 * - Replaced whenever the incoming rev > stored rev, regardless of state
 *   (a final may be superseded by a higher-rev final).
 * - Empty-text finals must only remove a line if rev is higher than the stored one.
 */
export function updateCaptions(
  prev: ExtendedCaptionMessage[],
  caption: ExtendedCaptionMessage
): ExtendedCaptionMessage[] {
  const index = prev.findIndex((c) => c.line_id === caption.line_id);
  if (index !== -1) {
    const current = prev[index];
    // Replaced whenever incoming rev > stored rev, regardless of state
    if (caption.rev <= current.rev) {
      return prev;
    }

    // Empty-text finals must only remove a line if rev is higher than the stored one.
    if (caption.state === "final" && !caption.text.trim()) {
      return prev.filter((c) => c.line_id !== caption.line_id);
    }

    const next = [...prev];
    next[index] = { ...current, ...caption };
    return next;
  }

  // If not previously stored:
  // An empty-text final for a line that isn't stored does nothing.
  if (caption.state === "final" && !caption.text.trim()) {
    return prev;
  }

  return [...prev, caption];
}
