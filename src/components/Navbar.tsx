import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { site } from "../data/site";
import { cn } from "../lib/cn";

const noFill = {
  "data-lpignore": "true",
  "data-1p-ignore": "",
  "data-bwignore": "true",
  "data-dashlane-ignore": "true",
  "data-form-type": "other",
  autoComplete: "off",
} as const;

function LogoMark() {
  return (
    <svg
      viewBox="14 18 38 28"
      className="h-5 w-5"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M 18 22 L 30 32 L 18 42"
        stroke="currentColor"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="34" y="40" width="14" height="3" rx="1" fill="currentColor" />
    </svg>
  );
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled
          ? "border-b border-white/[0.06] bg-ink-950/95"
          : "border-b border-transparent"
      )}
    >
      <nav
        className="section flex h-16 items-center justify-between"
        aria-label="Primary"
      >
        <a
          href="#top"
          className="group flex items-center gap-2.5"
          aria-label={`${site.name} — home`}
        >
          <span
            aria-hidden="true"
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-accent transition-colors group-hover:border-accent/40"
          >
            <LogoMark />
          </span>
          <span className="font-mono text-sm tracking-tight text-zinc-200">
            {site.name.split(" ")[0]}
            <span className="text-accent">.</span>
            {site.name.split(" ")[1]}
          </span>
        </a>

        <ul className="hidden items-center gap-1 md:flex">
          {site.nav.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="rounded-md px-3 py-2 font-mono text-[13px] text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                <span className="text-accent/70">/</span>
                {item.label.toLowerCase()}
              </a>
            </li>
          ))}
          <li className="ml-2">
            <a
              href={site.links.resume}
              download
              {...noFill}
              className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 font-mono text-[12px] font-medium text-accent transition-colors hover:border-accent/60 hover:bg-accent/15"
            >
              Resume
            </a>
          </li>
        </ul>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-200 md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="border-t border-white/[0.06] bg-ink-950/95 md:hidden"
          >
            <ul className="section flex flex-col gap-1 py-4">
              {site.nav.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-md px-3 py-2.5 font-mono text-sm text-zinc-300 hover:bg-white/[0.04] hover:text-white"
                  >
                    <span className="text-accent/70">/</span>
                    {item.label.toLowerCase()}
                  </a>
                </li>
              ))}
              <li className="mt-2">
                <a
                  href={site.links.resume}
                  download
                  {...noFill}
                  onClick={() => setOpen(false)}
                  className="block rounded-md border border-accent/30 bg-accent/10 px-3 py-2.5 text-center font-mono text-sm font-medium text-accent"
                >
                  Download Resume
                </a>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
