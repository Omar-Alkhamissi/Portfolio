import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { site } from "../data/site";
import { cn } from "../lib/cn";
import { glideToHash } from "../lib/glide";
import { MotionToggle } from "./MotionToggle";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const noFill = {
  "data-lpignore": "true",
  "data-1p-ignore": "",
  "data-bwignore": "true",
  "data-dashlane-ignore": "true",
  "data-form-type": "other",
  autoComplete: "off",
} as const;

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
        "fixed inset-x-0 top-0 z-50 border-b transition-colors duration-150 ease-out",
        scrolled ? "border-line bg-space/90" : "border-transparent"
      )}
    >
      <nav
        className="section flex h-16 items-center justify-between"
        aria-label="Primary"
      >
        <a
          href="#top"
          onClick={(event) => {
            event.preventDefault();
            glideToHash("#top");
          }}
          className="text-16 font-medium text-fg"
          aria-label={`${site.name}, home`}
        >
          {site.name}
        </a>

        <ul className="hidden items-center gap-7 md:flex">
          {site.nav.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                onClick={(event) => {
                  event.preventDefault();
                  glideToHash(item.href);
                }}
                className="text-14 text-fg-muted transition-colors duration-150 ease-out hover:text-fg"
              >
                {item.label}
              </a>
            </li>
          ))}
          <li>
            <a
              href={site.links.resume}
              download
              {...noFill}
              className="link text-14"
            >
              Resume
            </a>
          </li>
          <li>
            <MotionToggle />
          </li>
        </ul>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 grid h-10 w-10 place-items-center rounded-[6px] text-fg md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          {open ? (
            <X size={16} strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Menu size={16} strokeWidth={1.5} aria-hidden="true" />
          )}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE_OUT } }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.12, ease: EASE_OUT } }}
            className="border-y border-line bg-surface md:hidden"
          >
            <ul className="section flex flex-col py-3">
              {site.nav.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={(event) => {
                      event.preventDefault();
                      setOpen(false);
                      glideToHash(item.href);
                    }}
                    className="block py-2.5 text-16 text-fg-muted transition-colors duration-150 ease-out hover:text-fg"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
              <li className="py-2.5">
                <a
                  href={site.links.resume}
                  download
                  {...noFill}
                  onClick={() => setOpen(false)}
                  className="link text-16"
                >
                  Download resume
                </a>
              </li>
              <li className="py-2.5">
                <MotionToggle />
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
