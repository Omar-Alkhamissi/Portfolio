import { Github, Linkedin } from "lucide-react";
import { site } from "../data/site";
import { SectionHeading } from "./SectionHeading";

const noFill = {
  "data-lpignore": "true",
  "data-1p-ignore": "",
  "data-bwignore": "true",
  "data-dashlane-ignore": "true",
  "data-form-type": "other",
  autoComplete: "off",
} as const;

export function Contact() {
  return (
    <section id="contact" className="scroll-mt-20" aria-label="Contact">
      <div className="section">
        <SectionHeading
          title="Let's build something"
          description="I'm open to internships, junior roles, and collaboration on interesting projects. Reach out via email or any of the links below, happy to chat."
        />

        <a
          href={`mailto:${site.email}`}
          {...noFill}
          className="link mt-10 inline-block break-all text-21 sm:text-28"
        >
          {site.email}
        </a>

        <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-3 text-14">
          <a
            href={site.links.github}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub profile"
            {...noFill}
            className="link inline-flex items-center gap-2"
          >
            <Github size={16} strokeWidth={1.5} aria-hidden="true" />
            GitHub
          </a>
          <a
            href={site.links.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn profile"
            {...noFill}
            className="link inline-flex items-center gap-2"
          >
            <Linkedin size={16} strokeWidth={1.5} aria-hidden="true" />
            LinkedIn
          </a>
          <a href={site.links.resume} download {...noFill} className="link">
            Resume
          </a>
        </div>
      </div>
    </section>
  );
}
