import { setMotionPreference, useMotionOff, useMotionSource } from "../lib/motion";

export function MotionToggle({ showHelp = false }: { showHelp?: boolean }) {
  const off = useMotionOff();
  const source = useMotionSource();
  const on = !off;

  return (
    <>
      <button
        type="button"
        className="toggle"
        aria-pressed={on}
        onClick={() => setMotionPreference(on ? "off" : "on")}
      >
        {on ? "Motion on" : "Motion off"}
      </button>
      {showHelp && off && source === "system" ? (
        <p className="text-14 text-fg-muted">
          Your system asks for reduced motion. Turn motion on to see the animations.
        </p>
      ) : null}
    </>
  );
}
