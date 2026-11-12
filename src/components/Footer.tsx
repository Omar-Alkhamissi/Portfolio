import { site } from "../data/site";

export function Footer() {
  return (
    <footer className="py-12">
      <div className="section flex flex-wrap items-center gap-x-6 gap-y-2 text-14 text-fg-faint">
        <p>
          © {new Date().getFullYear()} {site.name}. Built with React, Tailwind,
          and Vite.
        </p>
        <a
          href={`mailto:${site.email}`}
          className="transition-colors duration-150 ease-out hover:text-fg"
        >
          Email
        </a>
        <a
          href={site.links.github}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors duration-150 ease-out hover:text-fg"
        >
          GitHub
        </a>
        <a
          href={site.links.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors duration-150 ease-out hover:text-fg"
        >
          LinkedIn
        </a>
      </div>
    </footer>
  );
}
