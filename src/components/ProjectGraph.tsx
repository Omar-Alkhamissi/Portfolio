import { useMemo, useState } from "react";
import { projects } from "../data/projects";
import { buildProjectGraph, type ClusterKey } from "../lib/projectGraphData";
import { ConstellationMap } from "./graph/ConstellationMap";
import { ReadingColumn } from "./graph/ReadingColumn";

// Projects as a constellation map: stars are projects, lines join projects
// that share a stack or an idea, and the reading column shows the catalogue
// of constellations or the selected project's note.
export function ProjectGraph() {
  const graph = useMemo(() => buildProjectGraph(projects), []);
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  // Pointing at a constellation in the catalogue dims the others on the map.
  const [clusterFocus, setClusterFocus] = useState<ClusterKey | null>(null);

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10">
      <ConstellationMap
        graph={graph}
        selected={selected}
        hovered={hovered}
        clusterFocus={clusterFocus}
        onSelect={setSelected}
        onHover={setHovered}
      />
      <ReadingColumn
        graph={graph}
        selected={selected}
        onSelect={setSelected}
        onHover={setHovered}
        onClusterHover={setClusterFocus}
      />
    </div>
  );
}
