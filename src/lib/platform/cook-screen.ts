"use client";

import { Capacitor } from "@capacitor/core";

import { setCookScreenAwake } from "@/lib/platform/capacitor/cook-screen";

/** Keep the screen awake for one Cook Mode session; dispose on completion/exit. */
export function keepCookScreenAwake(): () => void {
  if (Capacitor.isNativePlatform()) {
    void setCookScreenAwake(true);
    return () => void setCookScreenAwake(false);
  }

  if (typeof navigator.wakeLock?.request !== "function") return () => {};

  let active = true;
  let pending = false;
  let lock: WakeLockSentinel | undefined;

  const release = (sentinel: WakeLockSentinel) => {
    void sentinel.release().catch(() => {
      // The browser may already have released it when the app became hidden.
    });
  };

  const acquire = async () => {
    if (
      !active ||
      pending ||
      document.visibilityState !== "visible" ||
      (lock && !lock.released)
    ) {
      return;
    }

    pending = true;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      // A request can finish after navigation or while the app is backgrounded.
      if (!active || document.visibilityState !== "visible") {
        release(sentinel);
        return;
      }
      lock = sentinel;
      sentinel.addEventListener("release", () => {
        if (lock === sentinel) lock = undefined;
      });
    } catch {
      // Low Power Mode or browser policy can deny a lock. Retry on the next
      // foreground event or interaction, without polling against that policy.
    } finally {
      pending = false;
    }
  };

  const resume = () => void acquire();
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("pageshow", resume);
  window.addEventListener("focus", resume);
  document.addEventListener("pointerdown", resume, { passive: true });
  document.addEventListener("keydown", resume);
  resume();

  return () => {
    active = false;
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("pageshow", resume);
    window.removeEventListener("focus", resume);
    document.removeEventListener("pointerdown", resume);
    document.removeEventListener("keydown", resume);
    if (lock) release(lock);
    lock = undefined;
  };
}
