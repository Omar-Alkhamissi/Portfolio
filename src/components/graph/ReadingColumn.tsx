import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Github } from "lucide-react";
import { CLUSTERS, type ProjectGraphData } from "../../lib/projectGraphData";

type ReadingColumnProps = {
  graph: ProjectGraphData;
  selected: number | null;
  onSelect: (index: number | null) => void;
  onHover: (index: number | null) => void;
};

const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];
const BULLET_LIMIT = 4;

const textButton =
  "text-left text-[14px] text-fg-muted transition-colors duration-150 ease-out hover:text-fg";

export function ReadingColumn({ graph, selected, onSelect, onHover }: ReadingColumnProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0;
  }, [selected]);

  const hoverProps = (index: number) => ({
    onMouseEnter: () => onHover(index),
    onMouseLeave: () => onHover(null),
    onFocus: () => onHover(index),
    onBlur: () => onHover(null),
  });

  return (
    <div
      ref={panelRef}
      className="max-h-[460px] min-w-0 overflow-y-auto rounded-[8px] border border-line bg-surface p-6 lg:max-h-[clamp(420px,70vh,680px)]"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={selected === null ? "index" : graph.nodes[selected].id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.15, ease: EASE } }}
          exit={{ opacity: 0, transition: { duration: 0.1, ease: EASE } }}
        >
          {selected === null ? (
            <div className="space-y-6">
              {CLUSTERS.map((cluster) => {
                const members = graph.nodes.filter((node) => node.cluster === cluster.key);
                if (members.length === 0) return null;
                return (
                  <div key={cluster.key}>
                    <h3 className="text-[14px] font-semibold text-fg">{cluster.name}</h3>
                    <ul className="mt-2 space-y-1.5">
                      {members.map((node) => (
                        <li key={node.id}>
                          <button
                            type="button"
                            className={textButton}
                            onClick={() => onSelect(node.index)}
                            {...hoverProps(node.index)}
                          >
                            {node.id}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <ProjectNote
              graph={graph}
              index={selected}
              onSelect={onSelect}
              hoverProps={hoverProps}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ProjectNote({
  graph,
  index,
  onSelect,
  hoverProps,
}: {
  graph: ProjectGraphData;
  index: number;
  onSelect: (index: number | null) => void;
  hoverProps: (index: number) => Record<string, () => void>;
}) {
  const project = graph.nodes[index].project;
  const links = graph.neighbours[index];
  const [showAll, setShowAll] = useState(false);
  const bullets = showAll ? project.bullets : project.bullets.slice(0, BULLET_LIMIT);

  return (
    <article>
      <button type="button" className={textButton} onClick={() => onSelect(null)}>
        Back to index
      </button>

      <h3 className="mt-5 text-[21px] font-medium leading-snug text-fg">{project.title}</h3>
      <p className="mt-2 text-[16px] leading-[1.6] text-fg">{project.blurb}</p>
      <p className="mt-4 text-[14px] leading-[1.6] text-fg-muted">{project.description}</p>

      {project.stats.length > 0 && (
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4">
          {project.stats.map((stat) => (
            <div key={`${stat.label}-${stat.value}`} className="min-w-0">
              <dt className="text-[12px] text-fg-faint">{stat.label}</dt>
              <dd className="mt-0.5 text-[14px] tabular-nums text-fg">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {project.bullets.length > 0 && (
        <>
          <ul className="mt-6 list-disc space-y-2 pl-4 text-[14px] leading-[1.6] text-fg-muted marker:text-fg-faint">
            {bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
          {project.bullets.length > BULLET_LIMIT && (
            <button
              type="button"
              className="toggle mt-2"
              aria-expanded={showAll}
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? "Show fewer" : "Show all"}
            </button>
          )}
        </>
      )}

      <p className="mt-6 text-[14px] leading-[1.6] text-fg-muted">{project.tech.join(" · ")}</p>

      {links.length > 0 && (
        <>
          <h4 className="mt-8 text-[14px] font-semibold text-fg">Linked projects</h4>
          <ul className="mt-2 space-y-2">
            {links.map((link) => (
              <li key={link.index}>
                <button
                  type="button"
                  className="text-left text-[14px] text-fg underline decoration-line underline-offset-4 transition-colors duration-150 ease-out hover:decoration-star"
                  onClick={() => onSelect(link.index)}
                  {...hoverProps(link.index)}
                >
                  {graph.nodes[link.index].id}
                </button>
                <span className="block text-[12px] text-fg-faint">{link.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
        <a
          href={project.github}
          target="_blank"
          rel="noopener noreferrer"
          className="link inline-flex items-center gap-1.5"
        >
          <Github size={16} strokeWidth={1.5} aria-hidden="true" />
          View on GitHub
        </a>
        {project.liveDemo && (
          <a
            href={project.liveDemo}
            target="_blank"
            rel="noopener noreferrer"
            className="link inline-flex items-center gap-1.5"
          >
            <ExternalLink size={16} strokeWidth={1.5} aria-hidden="true" />
            Live demo
          </a>
        )}
      </div>
    </article>
  );
}
