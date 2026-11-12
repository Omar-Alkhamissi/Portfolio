import { useMemo, useState } from "react";
import { projects } from "../data/projects";
import { buildProjectGraph, CLUSTERS, type ClusterKey } from "../lib/projectGraphData";
import { ConstellationMap } from "./graph/ConstellationMap";
import { ReadingColumn } from "./graph/ReadingColumn";

// Projects as a constellation map: stars are projects, lines join projects
// that share a stack or an idea, and the reading column shows the index or
// the selected project's note.
export function ProjectGraph() {
  const graph = useMemo(() => buildProjectGraph(projects), []);
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [filter, setFilter] = useState<ClusterKey | null>(null);

  return (
    <div>
      <div
        role="group"
        aria-label="Filter by constellation"
        className="flex flex-wrap gap-x-5 gap-y-2"
      >
        <button
          type="button"
          className="toggle"
          aria-pressed={filter === null}
          onClick={() => setFilter(null)}
        >
          All
        </button>
        {CLUSTERS.map((cluster) => (
          <button
            key={cluster.key}
            type="button"
            className="toggle"
            aria-pressed={filter === cluster.key}
            onClick={() => setFilter((current) => (current === cluster.key ? null : cluster.key))}
          >
            {cluster.name}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
        <ConstellationMap
          graph={graph}
          selected={selected}
          hovered={hovered}
          filter={filter}
          onSelect={setSelected}
          onHover={setHovered}
        />
        <ReadingColumn
          graph={graph}
          selected={selected}
          onSelect={setSelected}
          onHover={setHovered}
        />
      </div>
    </div>
  );
}
