import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Github } from "lucide-react";
import { CLUSTERS, type ClusterKey, type ProjectGraphData } from "../../lib/projectGraphData";

type ReadingColumnProps = {
  graph: ProjectGraphData;
  selected: number | null;
  onSelect: (index: number | null) => void;
  onHover: (index: number | null) => void;
  onClusterHover: (key: ClusterKey | null) => void;
};

const ENTER: [number, number, number, number] = [0.05, 0.7, 0.1, 1];
const LEAVE: [number, number, number, number] = [0.3, 0, 0.8, 0.15];
const STAT_LIMIT = 6;
const LINK_LIMIT = 5;
// Descriptions longer than this are clamped to three lines until "Details".
const LONG_DESCRIPTION = 140;

const textButton =
  "text-left text-[14px] text-fg-muted transition-colors duration-150 ease-out hover:text-fg";

export function ReadingColumn({ graph, selected, onSelect, onHover, onClusterHover }: ReadingColumnProps) {
  const groups = CLUSTERS.map((cluster) => ({
    ...cluster,
    members: graph.nodes.filter((node) => node.cluster === cluster.key),
  })).filter((group) => group.members.length > 0);
  const [openKey, setOpenKey] = useState<ClusterKey | null>(groups[0]?.key ?? null);

  // Coming back to the index opens the constellation of the last selected star.
  useEffect(() => {
    if (selected !== null) setOpenKey(graph.nodes[selected].cluster);
  }, [graph, selected]);

  const hoverProps = (index: number) => ({
    onMouseEnter: () => onHover(index),
    onMouseLeave: () => onHover(null),
    onFocus: () => onHover(index),
    onBlur: () => onHover(null),
  });

  return (
    <div className="min-w-0 rounded-[8px] border border-line bg-surface p-6">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={selected === null ? "index" : graph.nodes[selected].id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.15, ease: ENTER } }}
          exit={{ opacity: 0, transition: { duration: 0.1, ease: LEAVE } }}
        >
          {selected === null ? (
            <Catalogue
              groups={groups}
              openKey={openKey}
              onToggle={(key) => setOpenKey((current) => (current === key ? null : key))}
              onSelect={onSelect}
              onClusterHover={onClusterHover}
              hoverProps={hoverProps}
            />
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

type Group = {
  key: ClusterKey;
  name: string;
  members: ProjectGraphData["nodes"];
};

function Catalogue({
  groups,
  openKey,
  onToggle,
  onSelect,
  onClusterHover,
  hoverProps,
}: {
  groups: Group[];
  openKey: ClusterKey | null;
  onToggle: (key: ClusterKey) => void;
  onSelect: (index: number | null) => void;
  onClusterHover: (key: ClusterKey | null) => void;
  hoverProps: (index: number) => Record<string, () => void>;
}) {
  const baseId = useId();

  return (
    <ul className="-my-2">
      {groups.map((group) => {
        const open = openKey === group.key;
        const listId = `${baseId}-${group.key}`;
        return (
          <li key={group.key}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={listId}
              className={
                open
                  ? "flex w-full items-baseline justify-between gap-4 py-2 text-left text-[14px] font-semibold text-fg"
                  : "flex w-full items-baseline justify-between gap-4 py-2 text-left text-[14px] font-semibold text-fg-muted transition-colors duration-150 ease-out hover:text-fg"
              }
              onClick={() => onToggle(group.key)}
              onMouseEnter={() => onClusterHover(group.key)}
              onMouseLeave={() => onClusterHover(null)}
              onFocus={() => onClusterHover(group.key)}
              onBlur={() => onClusterHover(null)}
            >
              <span>{group.name}</span>
              <span className="text-[14px] font-normal tabular-nums text-fg-faint">
                {group.members.length}
              </span>
            </button>
            {open && (
              <motion.ul
                id={listId}
                className="mb-3 mt-1 space-y-1.5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.15, ease: ENTER } }}
              >
                {group.members.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      className={textButton}
                      onClick={() => onSelect(node.index)}
                      {...hoverProps(node.index)}
                    >
                      {node.project.title}
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </li>
        );
      })}
    </ul>
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
  const [details, setDetails] = useState(false);
  const [allLinks, setAllLinks] = useState(false);
  const hasDetails = project.bullets.length > 0 || project.description.length > LONG_DESCRIPTION;
  const shownLinks = allLinks ? links : links.slice(0, LINK_LIMIT);
  const stats = project.stats.slice(0, STAT_LIMIT);

  return (
    <article>
      <button type="button" className={textButton} onClick={() => onSelect(null)}>
        Back to index
      </button>

      <h3 className="mt-4 text-[21px] font-medium leading-snug text-fg">{project.title}</h3>
      <p className="mt-2 text-[16px] leading-[1.6] text-fg">{project.blurb}</p>
      <p
        className={
          details
            ? "mt-3 text-[14px] leading-[1.6] text-fg-muted"
            : "mt-3 line-clamp-3 text-[14px] leading-[1.6] text-fg-muted"
        }
      >
        {project.description}
      </p>

      {details && project.bullets.length > 0 && (
        <ul className="mt-4 list-disc space-y-2 pl-4 text-[14px] leading-[1.6] text-fg-muted marker:text-fg-faint">
          {project.bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}

      {hasDetails && (
        <button
          type="button"
          className="toggle mt-1"
          aria-expanded={details}
          onClick={() => setDetails((value) => !value)}
        >
          {details ? "Fewer details" : "Details"}
        </button>
      )}

      {stats.length > 0 && (
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3">
          {stats.map((stat) => (
            <div key={`${stat.label}-${stat.value}`} className="min-w-0">
              <dt className="text-[12px] text-fg-faint">{stat.label}</dt>
              <dd className="mt-0.5 text-[14px] tabular-nums text-fg">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-5 text-[14px] leading-[1.6] text-fg-muted">{project.tech.join(", ")}</p>

      {links.length > 0 && (
        <>
          <h4 className="mt-5 text-[14px] font-semibold text-fg">Linked projects</h4>
          <ul className="mt-2 space-y-1.5">
            {shownLinks.map((link) => (
              <li key={link.index} className="flex min-w-0 items-baseline gap-3">
                <button
                  type="button"
                  className="shrink-0 text-left text-[14px] text-fg underline decoration-line underline-offset-4 transition-colors duration-150 ease-out hover:decoration-star"
                  onClick={() => onSelect(link.index)}
                  {...hoverProps(link.index)}
                >
                  {graph.nodes[link.index].id}
                </button>
                <span className="min-w-0 truncate text-[12px] text-fg-faint" title={link.reason}>
                  {link.reason}
                </span>
              </li>
            ))}
          </ul>
          {links.length > LINK_LIMIT && (
            <button
              type="button"
              className="toggle mt-1.5"
              aria-expanded={allLinks}
              onClick={() => setAllLinks((value) => !value)}
            >
              {allLinks ? "Show fewer" : `+${links.length - LINK_LIMIT} more`}
            </button>
          )}
        </>
      )}

      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
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
