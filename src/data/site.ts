// Single source of truth for personal info.
// Edit here once and the entire site updates.

export const site = {
  name: "Omar Alkhamissi",
  shortName: "Omar",
  initials: "OA",
  title: "Software Developer",
  subtitle:
    "Full-stack, backend, and data-focused developer building clean, practical software.",
  intro:
    "I'm a software developer focused on building reliable applications, clean user interfaces, and data-driven systems. I enjoy working with C++, Java, C#, JavaScript, databases, and modern web tools.",
  location: "London, Ontario",
  email: "o.alkhamissi@gmail.com",

  links: {
    github: "https://github.com/Omar-Alkhamissi",
    linkedin: "https://www.linkedin.com/in/o-alkhamissi/",
    resume: "Omar_Alkhamissi_Resume.pdf",
  },

  // Anchors used by the navbar
  nav: [
    { label: "About", href: "#about" },
    { label: "Skills", href: "#skills" },
    { label: "Projects", href: "#projects" },
    { label: "Experience", href: "#experience" },
    { label: "Contact", href: "#contact" },
  ],
} as const;
