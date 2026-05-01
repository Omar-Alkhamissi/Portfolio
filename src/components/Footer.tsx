import { Github, Linkedin, Mail } from "lucide-react";
import { site } from "../data/site";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-10">
      <div className="section flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="font-mono text-xs text-zinc-500">
          © {new Date().getFullYear()} {site.name}. Built with React, Tailwind,
          and Vite.
        </p>

        <div className="flex items-center gap-1">
          <a
            href={`mailto:${site.email}`}
            aria-label="Email"
            className="grid h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-500 transition-colors hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
          >
            <Mail size={15} />
          </a>
          <a
            href={site.links.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="grid h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-500 transition-colors hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
          >
            <Github size={15} />
          </a>
          <a
            href={site.links.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
            className="grid h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-500 transition-colors hover:border-white/10 hover:bg-white/[0.04] hover:text-white"
          >
            <Linkedin size={15} />
          </a>
        </div>
      </div>
    </footer>
  );
}
