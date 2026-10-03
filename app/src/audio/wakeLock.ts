/**
 * Screen Wake Lock manager.
 *
 * Prevents the screen from sleeping during a live Roundtable session.
 * Uses the Screen Wake Lock API (navigator.wakeLock) where supported.
 * Fails silently on unsupported browsers — wake lock is never a precondition
 * for microphone capture.
 *
 * Usage:
 *   const wl = new WakeLockManager();
 *   await wl.acquire();   // on session start
 *   wl.release();         // on session end
 */

type WakeLockSentinel = {
  released: boolean;
  release(): Promise<void>;
};

const DEV = process.env.NODE_ENV !== 'production';

function log (...args: unknown[]) {
  if (DEV) console.log('[WakeLock]', ...args);
}

export class WakeLockManager {
  private _sentinel: WakeLockSentinel | null = null;
  private _active   = false;
  private _onVisible: (() => void) | null = null;

  /** Acquire a screen wake lock. Resolves even if unsupported. */
  async acquire (): Promise<void> {
    this._active = true;
    await this._request();
    this._installVisibilityListener();
  }

  /** Release the wake lock and remove visibility listener. */
  release (): void {
    this._active = false;
    this._removeVisibilityListener();
    if (this._sentinel && !this._sentinel.released) {
      this._sentinel.release().catch(() => {/* ignore */});
      log('released');
    }
    this._sentinel = null;
  }

  private async _request (): Promise<void> {
    if (typeof navigator === 'undefined') return; // SSR guard
    const nav = navigator as any;
    if (!nav.wakeLock) {
      log('Screen Wake Lock API not supported');
      return;
    }
    try {
      this._sentinel = await nav.wakeLock.request('screen') as WakeLockSentinel;
      log('acquired');
      // The sentinel fires a 'release' event if the browser releases it (e.g. tab hidden)
      (this._sentinel as any).addEventListener?.('release', () => {
        log('sentinel released by browser');
      });
    } catch (err: any) {
      // NotAllowedError: document not visible or user denied
      log('could not acquire:', err.message ?? err);
    }
  }

  private _installVisibilityListener (): void {
    if (typeof document === 'undefined') return;
    this._onVisible = async () => {
      if (this._active && document.visibilityState === 'visible') {
        log('page became visible — re-acquiring');
        await this._request();
      }
    };
    document.addEventListener('visibilitychange', this._onVisible);
  }

  private _removeVisibilityListener (): void {
    if (typeof document === 'undefined') return;
    if (this._onVisible) {
      document.removeEventListener('visibilitychange', this._onVisible);
      this._onVisible = null;
    }
  }
}
