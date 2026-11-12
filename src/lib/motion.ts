import { useSyncExternalStore } from "react";

export type MotionPreference = "on" | "off";
export type MotionSource = "user" | "system" | "default";

const STORAGE_KEY = "portfolio:motion";
const OLD_STORAGE_KEY = "portfolio:motionPaused";
const CHANGE_EVENT = "portfolio:motion-change";
const QUERY = "(prefers-reduced-motion: reduce)";

function systemWantsReduced(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(QUERY).matches
  );
}

function readPreference(): MotionPreference | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "on" || value === "off" ? value : null;
  } catch {
    return null;
  }
}

/** One-time move from the old "pause" key: "1" meant off. */
function migrateOldKey(): void {
  try {
    const old = window.localStorage.getItem(OLD_STORAGE_KEY);
    if (old === null) return;
    if (old === "1" && window.localStorage.getItem(STORAGE_KEY) === null) {
      window.localStorage.setItem(STORAGE_KEY, "off");
    }
    window.localStorage.removeItem(OLD_STORAGE_KEY);
  } catch {
    // Storage can be blocked; nothing to migrate then.
  }
}

/** True when animations should stay still. An explicit "on" beats the system setting. */
export function getMotionOff(): boolean {
  const preference = readPreference();
  if (preference) return preference === "off";
  return systemWantsReduced();
}

/** Why motion is in its current state. */
export function getMotionSource(): MotionSource {
  if (readPreference()) return "user";
  return systemWantsReduced() ? "system" : "default";
}

export function setMotionPreference(pref: MotionPreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Storage can be blocked; the event below still updates this page.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const media =
    typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  media?.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
    media?.removeEventListener("change", onChange);
  };
}

/** The one motion switch. Every animation reads this and nothing else. */
export function useMotionOff(): boolean {
  return useSyncExternalStore(subscribe, getMotionOff, () => false);
}

export function useMotionSource(): MotionSource {
  return useSyncExternalStore(subscribe, getMotionSource, () => "default");
}

/** Mirrors the switch onto <html data-motion> so CSS can follow it. Call before React renders. */
export function initMotion(): void {
  if (typeof window === "undefined") return;
  migrateOldKey();
  const apply = () => {
    document.documentElement.dataset.motion = getMotionOff() ? "off" : "on";
  };
  apply();
  subscribe(apply);
}
