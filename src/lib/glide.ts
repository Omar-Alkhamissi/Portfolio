import { getMotionOff } from "./motion";

const HOLD_MS = 900;
const ARRIVED_MS = 1100;
const ARRIVE_TOLERANCE_PX = 1;
const DRIFT_TOLERANCE_PX = 0.5;
const STOP_EVENTS = ["wheel", "touchstart", "pointerdown"] as const;
const STOP_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
  " ",
  "Spacebar",
]);

type GlideOptions = {
  /** Add the hash to the address bar. Defaults to true. */
  pushState?: boolean;
};

let stopRunning: (() => void) | null = null;
let arrivedHeading: HTMLElement | null = null;
let arrivedTimer = 0;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Where the page should rest so the element sits at its scroll margin. Read fresh every frame. */
function targetScrollY(element: HTMLElement): number {
  const margin = parseFloat(window.getComputedStyle(element).scrollMarginTop) || 0;
  const top = element.getBoundingClientRect().top + window.scrollY - margin;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return Math.max(0, Math.min(top, max));
}

function jumpTo(y: number): void {
  window.scrollTo({ top: y, left: 0, behavior: "instant" });
}

function clearArrived(): void {
  window.clearTimeout(arrivedTimer);
  arrivedHeading?.removeAttribute("data-arrived");
  arrivedHeading = null;
}

/** Starts the heading's arrival animation (see the data-arrived rules in index.css). */
function markArrived(target: HTMLElement): void {
  const heading = target.querySelector("h2");
  if (!heading) return;

  clearArrived();
  // Remove, force a reflow, set again, so the animation restarts if it was running.
  heading.removeAttribute("data-arrived");
  void heading.offsetWidth;
  heading.setAttribute("data-arrived", "true");
  arrivedHeading = heading;
  arrivedTimer = window.setTimeout(clearArrived, ARRIVED_MS);
}

export function glideToHash(hash: string, options: GlideOptions = {}): void {
  const id = hash.replace(/^#/, "");
  const target = document.getElementById(id);
  if (!target) return;

  stopRunning?.();

  if (options.pushState !== false) {
    window.history.pushState(null, "", hash);
  }

  const motionOff = getMotionOff();
  const markArrival = !motionOff && id !== "top";
  const startY = window.scrollY;
  const distance = Math.abs(targetScrollY(target) - startY);
  const duration = Math.min(800, Math.max(350, 300 + distance * 0.12));

  let frame = 0;
  let startTime = 0;
  let arrived = false;

  const stop = () => {
    window.cancelAnimationFrame(frame);
    for (const type of STOP_EVENTS) {
      window.removeEventListener(type, onInput, true);
    }
    window.removeEventListener("keydown", onKey, true);
    if (stopRunning === stop) stopRunning = null;
  };

  function onInput() {
    stop();
  }

  function onKey(event: KeyboardEvent) {
    if (STOP_KEYS.has(event.key)) stop();
  }

  for (const type of STOP_EVENTS) {
    window.addEventListener(type, onInput, { capture: true, passive: true });
  }
  window.addEventListener("keydown", onKey, true);
  stopRunning = stop;

  const tick = (now: number) => {
    if (!startTime) startTime = now;
    const elapsed = now - startTime;
    const goal = targetScrollY(target);

    if (motionOff) {
      jumpTo(goal);
    } else if (elapsed < duration) {
      const eased = easeInOutCubic(elapsed / duration);
      jumpTo(startY + (goal - startY) * eased);
    } else if (Math.abs(window.scrollY - goal) > DRIFT_TOLERANCE_PX) {
      // Held position: the layout moved under us, so follow it at once.
      jumpTo(goal);
    }

    const gliding = !motionOff && elapsed < duration;
    if (
      markArrival &&
      !arrived &&
      !gliding &&
      Math.abs(window.scrollY - goal) <= ARRIVE_TOLERANCE_PX
    ) {
      arrived = true;
      markArrived(target);
    }

    const arrivalAt = motionOff ? 0 : duration;
    if (elapsed < arrivalAt + HOLD_MS) {
      frame = window.requestAnimationFrame(tick);
    } else {
      stop();
    }
  };

  frame = window.requestAnimationFrame(tick);
}
