import { useSyncExternalStore } from "react";

const CHANGE_EVENT = "portfolio:skill-focus-change";

let current: string | null = null;

/** The skill picked in the orrery, as the exact item string from skills.ts, or null. */
export function getSkillFocus(): string | null {
  return current;
}

export function setSkillFocus(skill: string | null): void {
  if (skill === current) return;
  current = skill;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string | null>(CHANGE_EVENT, { detail: skill }));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useSkillFocus(): string | null {
  return useSyncExternalStore(subscribe, getSkillFocus, () => null);
}
