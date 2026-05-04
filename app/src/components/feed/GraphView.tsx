/**
 * v1.24.0 — Obsidian-style force-directed graph (replaces v1.23 Depth Canvas).
 *
 * CEO direction after rejecting 7 visual designs: "用一个类似 obsidian 的图像,
 * 而不是简单的文本框". Stop trying to render the timeline as cards / pages /
 * planes. Render it as a constellation of nodes + edges, force-directed,
 * the visual everyone associates with Obsidian.
 *
 * This module owns:
 *   • Edge inference from a flat TimelineEvent[] (mention / concept / thread /
 *     actor co-occurrence). Pure helper, exported for tests.
 *   • Node + edge type construction with vendor-keyed colors and scored sizes.
 *   • The react-force-graph-2d render with hover-highlights neighbors,
 *     click → onOpenAtom, pan/zoom built into the library.
 *   • Auto-zoom-to-fit + center-the-top-scored-atom on first paint.
 *
 * Library: `react-force-graph-2d` (Canvas-rendered d3-force wrapper). Picked
 * over plain d3-force because the wrapper bakes in pan/zoom + click/hover +
 * auto-resize observer for ~150 KB gzipped. Canvas (not WebGL / not SVG)
 * keeps the dep light AND handles 1000+ nodes at 60fps. No three.js.
 *
 * Visual contract:
 *   • Background: stone-50 (light) / stone-950 (dark) full viewport
 *   • Atom nodes: solid disc, vendorFor(source).color, size 6-24 by score
 *   • Thread nodes: hollow ring, stone-400 stroke, size by atom-count
 *   • Person nodes: bigger ring, stone-500 stroke
 *   • Edges: 1px stone-300/40, width = weight (0.5-2)
 *   • Hover: hovered node 1.5x + label, neighbors full-opacity, others 0.15
 *   • Hovered-edge color: var(--ti-orange-500) at full opacity
 *   • Click atom → onOpenAtom(node.event); click thread/person → focus filter
 *
 * Hard constraints honored:
 *   • R6 honesty preserved — 0 events still routed to caller's EmptyState
 *     before we mount (caller in feed.tsx). When only 1 event sneaks in we
 *     still render the lone node — no fake clusters.
 *   • Single accent — the orange shows ONLY on hovered edges + today's
 *     atom node ring. Save button (CaptureInput) keeps its orange too;
 *     nothing else gets the accent.
 *   • Operability surfaces preserved — CatchupBanner sits above the graph,
 *     CaptureInput at the bottom (both rendered in feed.tsx, not here).
 *
 * Test handling:
 *   • react-force-graph-2d uses Canvas which jsdom doesn't fully back.
 *     The test file (tests/v1_24-graph-view.test.tsx) mocks it with a stub
 *     that surfaces graph data + click handlers as `data-testid` props so
 *     the data flow is verified without touching Canvas.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d";
import type { TimelineEvent } from "@/lib/views";
import { vendorFor } from "./vendor";

// ---------- types ----------

export type GraphNodeKind = "atom" | "thread" | "person";
export type GraphEdgeKind = "mention" | "concept" | "thread" | "actor";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  source?: string;
  size: number;
  color: string;
  /** Original timeline event for atom nodes — back-ref for click → bottom sheet. */
  event?: TimelineEvent;
  /** Scoring used to pin the highest-importance atom at the center on mount. */
  score?: number;
  /** True for atom nodes whose event ts is today (drives orange ring accent). */
  isToday?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: GraphEdgeKind;
  weight: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ---------- public component props ----------

interface GraphViewProps {
  events: TimelineEvent[];
  currentUser: string;
  onOpenAtom: (ev: TimelineEvent) => void;
}

// ---------- constants tuned for Obsidian feel ----------

const MENTION_RE = /@([a-z0-9][a-z0-9_.-]*)/gi;
const RECENT_24H_MS = 24 * 60 * 60 * 1000;
const ACTOR_EDGE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MIN_EDGE_WEIGHT = 0.5;
const MAX_EDGE_RATIO = 5; // max edges = nodes * MAX_EDGE_RATIO before pruning
const MIN_NODE_SIZE = 6;
const MAX_NODE_SIZE = 24;

// Force-simulation knobs — pulled from spec, tuned for tighter clusters.
const LINK_DISTANCE = 70;
const CHARGE_STRENGTH = -200;
const COOLDOWN_TICKS = 200;
const WARMUP_TICKS = 50;

// ---------- entry point ----------

export function GraphView({
  events,
  currentUser,
  onOpenAtom,
}: GraphViewProps) {
  const graphRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusFilter, setFocusFilter] = useState<string | null>(null);

  // Detect dark mode for canvas background. Falls back to light when the
  // matchMedia API is missing (jsdom).
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setIsDark(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Compute the full graph from events on every change. Pure derivation —
  // no side-effects. Edge inference can reach O(n^2) so we cap atoms at 500
  // upstream (readTimelineRecent passes limit=500).
  const fullGraph = useMemo(
    () => buildGraph(events, currentUser),
    [events, currentUser],
  );

  // Apply the focus filter (set when the user clicks a thread/person node).
  // When focusFilter is set, render only that node + its direct neighbors.
  const graph = useMemo(() => {
    if (!focusFilter) return fullGraph;
    return filterToNeighbors(fullGraph, focusFilter);
  }, [fullGraph, focusFilter]);

  // Build neighbor lookup once per graph render — used by hover dimming.
  const neighborsById = useMemo(
    () => buildNeighborMap(graph),
    [graph],
  );

  // Track size for the canvas. ResizeObserver via the container; the
  // library's onResize handler doesn't always fire on initial mount in the
  // Tauri webview, so we drive width/height ourselves.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => {
      // jsdom returns 0 for clientWidth/clientHeight even with the
      // ResizeObserver stub from tests/setup.ts. Fall back to a fixed
      // (but plausible) size so the canvas mounts during tests; in
      // production the Tauri webview always reports real dimensions.
      const w = el.clientWidth || 800;
      const h = el.clientHeight || 600;
      setSize({ w, h });
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // After the simulation cools, auto-zoom to fit the graph + center the
  // highest-scored atom. Two layers of timer because the library doesn't
  // expose a "settled" event in 2D mode.
  useEffect(() => {
    const ref = graphRef.current;
    if (!ref) return;
    const t = window.setTimeout(() => {
      try {
        ref.zoomToFit(400, 50);
      } catch {
        // Ignore — happens in jsdom path with mocked component.
      }
    }, 500);
    return () => window.clearTimeout(t);
  }, [graph]);

  // Pin highest-score atom at origin so the user's eye lands on it.
  useEffect(() => {
    const top = graph.nodes
      .filter((n) => n.kind === "atom")
      .reduce<GraphNode | null>(
        (best, n) =>
          best === null || (n.score ?? 0) > (best.score ?? 0) ? n : best,
        null,
      );
    if (!top) return;
    // Mutate the node — d3-force respects fx/fy for fixed positions.
    (top as NodeObject & { fx?: number; fy?: number }).fx = 0;
    (top as NodeObject & { fx?: number; fy?: number }).fy = 0;
  }, [graph]);

  const bgColor = isDark ? "rgb(12, 10, 9)" : "rgb(250, 250, 249)";

  return (
    <div
      ref={containerRef}
      data-testid="graph-view"
      data-node-count={graph.nodes.length}
      data-edge-count={graph.edges.length}
      data-atom-count={events.length}
      data-hovered={hoveredId ?? ""}
      data-focused={focusFilter ?? ""}
      className="relative h-full w-full"
      style={{ background: bgColor }}
    >
      {focusFilter && (
        <button
          type="button"
          data-testid="graph-clear-focus"
          onClick={() => setFocusFilter(null)}
          className="absolute right-4 top-3 z-10 rounded-md border border-stone-200 bg-white/90 px-2 py-1 font-mono text-[11px] text-stone-600 shadow-sm backdrop-blur transition-colors hover:bg-stone-100 dark:border-stone-800 dark:bg-stone-900/90 dark:text-stone-400 dark:hover:bg-stone-800"
          title="Clear focus"
        >
          clear focus ×
        </button>
      )}
      {size.w > 0 && size.h > 0 && (
        <ForceGraph2D
          ref={graphRef as React.MutableRefObject<ForceGraphMethods | undefined>}
          graphData={{
            nodes: graph.nodes as unknown as NodeObject[],
            links: graph.edges as unknown as LinkObject[],
          }}
          width={size.w}
          height={size.h}
          backgroundColor={bgColor}
          nodeId="id"
          // Visual tuning.
          nodeRelSize={1}
          nodeVal={(n: NodeObject) => {
            const node = n as unknown as GraphNode;
            return Math.max(MIN_NODE_SIZE, node.size);
          }}
          nodeColor={(n: NodeObject) => {
            const node = n as unknown as GraphNode;
            const dimmed =
              hoveredId !== null &&
              hoveredId !== node.id &&
              !neighborsById.get(hoveredId)?.has(node.id);
            const baseColor = node.kind === "atom" ? node.color : "transparent";
            return dimmed ? hexToRgba(baseColor, 0.15) : baseColor;
          }}
          nodeCanvasObjectMode={() => "replace"}
          nodeCanvasObject={(n, ctx, scale) => {
            drawNode(
              n as unknown as GraphNode,
              ctx,
              scale,
              hoveredId,
              neighborsById,
            );
          }}
          // Edges.
          linkColor={(l: LinkObject) => {
            const edge = l as unknown as GraphEdge;
            const srcId = idOf(edge.source);
            const tgtId = idOf(edge.target);
            if (
              hoveredId !== null &&
              (srcId === hoveredId || tgtId === hoveredId)
            ) {
              return "var(--ti-orange-500, #f97316)";
            }
            const dimmed =
              hoveredId !== null &&
              srcId !== hoveredId &&
              tgtId !== hoveredId;
            return dimmed
              ? "rgba(168, 162, 158, 0.08)"
              : "rgba(168, 162, 158, 0.40)";
          }}
          linkWidth={(l: LinkObject) => {
            const edge = l as unknown as GraphEdge;
            return edge.weight;
          }}
          linkDirectionalParticles={0}
          // Forces.
          d3AlphaDecay={0.03}
          d3VelocityDecay={0.3}
          cooldownTicks={COOLDOWN_TICKS}
          warmupTicks={WARMUP_TICKS}
          onEngineTick={() => {
            // No-op; reserved for future custom force injection.
          }}
          // Interaction.
          enableNodeDrag={true}
          enableZoomInteraction={true}
          enablePanInteraction={true}
          minZoom={0.2}
          maxZoom={8}
          onNodeHover={(n) => {
            setHoveredId(n ? (n as unknown as GraphNode).id : null);
          }}
          onNodeClick={(n) => {
            const node = n as unknown as GraphNode;
            if (node.kind === "atom" && node.event) {
              onOpenAtom(node.event);
              return;
            }
            // Thread / person → focus on this node + its neighbors.
            setFocusFilter(node.id);
          }}
          onBackgroundClick={() => {
            // Click empty canvas while focused = reset.
            if (focusFilter) setFocusFilter(null);
          }}
        />
      )}
      <FooterStatus
        nodeCount={graph.nodes.length}
        edgeCount={graph.edges.length}
        focused={focusFilter}
      />
    </div>
  );
}

// ---------- canvas painter ----------

/**
 * Custom node painter — draws the disc/ring + the hover label. We override
 * the default painter because we want:
 *   • Hollow rings for thread/person nodes (defaults to filled disc).
 *   • An orange outer ring on today's atom nodes.
 *   • Labels visible only on hover (defaults paint them at all zooms).
 */
function drawNode(
  node: GraphNode,
  ctx: CanvasRenderingContext2D,
  scale: number,
  hoveredId: string | null,
  neighbors: Map<string, Set<string>>,
) {
  const x = (node as unknown as { x?: number }).x ?? 0;
  const y = (node as unknown as { y?: number }).y ?? 0;
  const isHovered = node.id === hoveredId;
  const isNeighbor =
    hoveredId !== null && neighbors.get(hoveredId)?.has(node.id);
  const dimmed = hoveredId !== null && !isHovered && !isNeighbor;
  const sizeBoost = isHovered ? 1.5 : 1;
  const r = Math.max(MIN_NODE_SIZE, node.size) * sizeBoost;

  ctx.save();
  ctx.globalAlpha = dimmed ? 0.18 : 1;

  if (node.kind === "atom") {
    // Filled disc.
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI, false);
    ctx.fillStyle = node.color;
    ctx.fill();
    // Today's atom gets an orange outer ring (single accent rule).
    if (node.isToday) {
      ctx.beginPath();
      ctx.arc(x, y, r + 1.5, 0, 2 * Math.PI, false);
      ctx.strokeStyle = "rgba(204, 85, 0, 0.85)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  } else {
    // Hollow ring for thread / person.
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI, false);
    ctx.strokeStyle =
      node.kind === "person"
        ? "rgba(120, 113, 108, 0.95)"
        : "rgba(168, 162, 158, 0.95)";
    ctx.lineWidth = node.kind === "person" ? 2 : 1.5;
    ctx.stroke();
  }

  // Label — only visible when hovered or zoomed in past 2x. Avoids the
  // hairball look of permanently-labeled nodes.
  const showLabel = isHovered || scale > 2.5;
  if (showLabel && node.label) {
    ctx.font = `${Math.max(11, 11 / scale)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = isHovered
      ? "rgba(28, 25, 23, 0.95)"
      : "rgba(87, 83, 78, 0.85)";
    const labelY = y - r - 6 / scale;
    // Draw a small backdrop so the label reads against any node color.
    const text = node.label;
    const metrics = ctx.measureText(text);
    const padX = 4 / scale;
    const padY = 2 / scale;
    const w = metrics.width + padX * 2;
    const h = 11 / scale + padY * 2;
    ctx.fillStyle = "rgba(250, 250, 249, 0.85)";
    ctx.fillRect(x - w / 2, labelY - h / 2, w, h);
    ctx.fillStyle = "rgba(28, 25, 23, 0.95)";
    ctx.fillText(text, x, labelY);
  }

  ctx.restore();
}

// ---------- footer status (count chip) ----------

function FooterStatus({
  nodeCount,
  edgeCount,
  focused,
}: {
  nodeCount: number;
  edgeCount: number;
  focused: string | null;
}) {
  return (
    <div
      data-testid="graph-status"
      className="pointer-events-none absolute bottom-3 left-4 z-10 select-none font-mono text-[10px] text-stone-500 dark:text-stone-500"
    >
      {focused ? `focused on ${focused.slice(0, 24)} · ` : ""}
      {nodeCount} node{nodeCount === 1 ? "" : "s"} · {edgeCount} edge
      {edgeCount === 1 ? "" : "s"}
    </div>
  );
}

// ---------- pure helpers (exported for tests) ----------

/**
 * Build the full graph from a flat events array. Pure helper — no side
 * effects. Order of operations:
 *   1. Collect actors + thread keys + concepts so we know which person /
 *      thread / concept nodes exist.
 *   2. Build atom nodes (one per event) with vendor color + size by score.
 *   3. Build thread nodes (one per non-empty thread key) with size by
 *      atom-count.
 *   4. Build person nodes (one per actor) with size by atom-count.
 *   5. Build edges:
 *        - mention (weight 2) — A's body @ B's actor or vice versa
 *        - concept (weight 1, capped at 2) — shared concept overlap
 *        - thread (weight 1) — same conversation_id / thread key
 *        - actor (weight 0.5) — same actor + atoms within 24h
 *      Plus structural edges atom→thread + atom→person so the graph
 *      doesn't fragment when atoms have no pairwise edges.
 *   6. Prune: drop edges below MIN_EDGE_WEIGHT, then if total edges
 *      exceeds nodes * MAX_EDGE_RATIO trim the lowest-weight ones.
 */
export function buildGraph(
  events: TimelineEvent[],
  currentUser: string,
): GraphData {
  if (events.length === 0) return { nodes: [], edges: [] };

  const me = (currentUser || "").toLowerCase();
  const todayKey = localDayKey(new Date());

  // ---- node construction ----
  const atomNodes: GraphNode[] = [];
  const atomIdSet = new Set<string>();
  const scoreById = new Map<string, number>();

  // Track threads / actors so we can size their nodes.
  const threadAtomCount = new Map<string, number>();
  const personAtomCount = new Map<string, number>();
  const conceptCountBySource = countConceptsBySource(events);

  let maxScore = 1;

  for (const ev of events) {
    const score = scoreEvent(ev, me, conceptCountBySource);
    scoreById.set(ev.id, score);
    if (score > maxScore) maxScore = score;
  }

  for (const ev of events) {
    const score = scoreById.get(ev.id) ?? 0;
    const size = scoreToSize(score, maxScore);
    const dayKey = ev.ts ? localDayKey(new Date(ev.ts)) : null;
    const isToday = dayKey === todayKey;
    const node: GraphNode = {
      id: ev.id,
      kind: "atom",
      label: trimLabel(firstNonEmptyLine(ev), 60),
      source: ev.source ?? undefined,
      size,
      color: vendorFor(ev.source).color,
      event: ev,
      score,
      isToday,
    };
    atomNodes.push(node);
    atomIdSet.add(ev.id);

    // Tally for thread/person nodes.
    const threadKey = threadKeyOf(ev);
    if (threadKey) {
      threadAtomCount.set(
        threadKey,
        (threadAtomCount.get(threadKey) ?? 0) + 1,
      );
    }
    const actorKey = actorKeyOf(ev);
    if (actorKey) {
      personAtomCount.set(
        actorKey,
        (personAtomCount.get(actorKey) ?? 0) + 1,
      );
    }
  }

  const threadNodes: GraphNode[] = [...threadAtomCount.entries()]
    .filter(([, count]) => count >= 2) // skip 1-atom threads, they add noise
    .map(([key, count]) => ({
      id: `thread:${key}`,
      kind: "thread",
      label: trimLabel(key, 40),
      size: Math.min(MAX_NODE_SIZE, MIN_NODE_SIZE + count * 1.5),
      color: "#a8a29e",
    }));

  const personNodes: GraphNode[] = [...personAtomCount.entries()]
    .filter(([, count]) => count >= 2) // single-atom actors stay implicit
    .map(([key, count]) => ({
      id: `person:${key}`,
      kind: "person",
      label: `@${key}`,
      size: Math.min(MAX_NODE_SIZE, MIN_NODE_SIZE + count * 1.2),
      color: "#78716c",
    }));

  const nodes: GraphNode[] = [...atomNodes, ...threadNodes, ...personNodes];

  // ---- edge construction ----
  const edgeMap = new Map<string, GraphEdge>();
  const upsertEdge = (
    a: string,
    b: string,
    kind: GraphEdgeKind,
    weight: number,
  ) => {
    if (a === b) return;
    const [src, tgt] = a < b ? [a, b] : [b, a];
    const key = `${kind}|${src}|${tgt}`;
    const existing = edgeMap.get(key);
    if (existing) {
      existing.weight = Math.min(2, existing.weight + weight);
    } else {
      edgeMap.set(key, { source: src, target: tgt, kind, weight });
    }
  };

  // Pairwise atom edges. O(n^2) but bounded by readTimelineRecent's 500.
  for (let i = 0; i < events.length; i++) {
    const a = events[i];
    const aMentions = extractMentions(a.body ?? "");
    const aConcepts = new Set(a.concepts ?? []);
    const aThread = threadKeyOf(a);
    const aActor = actorKeyOf(a);
    const aTs = Date.parse(a.ts ?? "");

    // Atom → thread structural edge so the cluster has gravity.
    if (aThread && threadAtomCount.get(aThread)! >= 2) {
      upsertEdge(a.id, `thread:${aThread}`, "thread", 1);
    }
    // Atom → person structural edge (only if person node exists).
    if (aActor && personAtomCount.get(aActor)! >= 2) {
      upsertEdge(a.id, `person:${aActor}`, "actor", 0.5);
    }

    for (let j = i + 1; j < events.length; j++) {
      const b = events[j];
      const bActor = actorKeyOf(b);
      const bMentions = extractMentions(b.body ?? "");

      // Mention edge — A mentions B's actor or vice versa.
      const aMentionsB = bActor && aMentions.includes(bActor);
      const bMentionsA = aActor && bMentions.includes(aActor);
      if (aMentionsB || bMentionsA) {
        upsertEdge(a.id, b.id, "mention", 2);
      }

      // Concept overlap edge.
      const overlap = (b.concepts ?? []).filter((c) => aConcepts.has(c));
      if (overlap.length > 0) {
        upsertEdge(
          a.id,
          b.id,
          "concept",
          Math.min(2, overlap.length),
        );
      }

      // Same-thread edge.
      const bThread = threadKeyOf(b);
      if (aThread && aThread === bThread) {
        upsertEdge(a.id, b.id, "thread", 1);
      }

      // Same-actor + within 24h edge.
      const bTs = Date.parse(b.ts ?? "");
      if (
        aActor &&
        aActor === bActor &&
        !Number.isNaN(aTs) &&
        !Number.isNaN(bTs) &&
        Math.abs(aTs - bTs) <= ACTOR_EDGE_WINDOW_MS
      ) {
        upsertEdge(a.id, b.id, "actor", 0.5);
      }
    }
  }

  // Prune below threshold + cap edge density.
  let edges = [...edgeMap.values()].filter(
    (e) => e.weight >= MIN_EDGE_WEIGHT,
  );
  const maxEdges = nodes.length * MAX_EDGE_RATIO;
  if (edges.length > maxEdges) {
    edges = edges
      .sort((a, b) => b.weight - a.weight)
      .slice(0, maxEdges);
  }

  return { nodes, edges };
}

/**
 * Restrict the graph to a given node + its direct neighbors. Used when the
 * user clicks a thread or person node to drill in.
 */
export function filterToNeighbors(
  graph: GraphData,
  focusId: string,
): GraphData {
  const keep = new Set<string>([focusId]);
  for (const e of graph.edges) {
    const src = idOf(e.source);
    const tgt = idOf(e.target);
    if (src === focusId) keep.add(tgt);
    else if (tgt === focusId) keep.add(src);
  }
  return {
    nodes: graph.nodes.filter((n) => keep.has(n.id)),
    edges: graph.edges.filter(
      (e) => keep.has(idOf(e.source)) && keep.has(idOf(e.target)),
    ),
  };
}

/**
 * Build an `id → Set<neighborId>` lookup from a graph. Used by the hover
 * dimming pass so the canvas painter can skip the O(n) scan per node.
 */
function buildNeighborMap(graph: GraphData): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    const src = idOf(e.source);
    const tgt = idOf(e.target);
    if (!out.has(src)) out.set(src, new Set());
    if (!out.has(tgt)) out.set(tgt, new Set());
    out.get(src)!.add(tgt);
    out.get(tgt)!.add(src);
  }
  return out;
}

// ---------- scoring helpers (mirror DailyMemoryPages.rankAtomsForDay) ----------

function scoreEvent(
  ev: TimelineEvent,
  me: string,
  conceptCountBySource: Map<string, Set<string>>,
): number {
  let score = 0;
  const mentions = extractMentions(ev.body ?? "");
  if (mentions.includes(me)) score += 10;
  if (mentions.length > 0 && !mentions.includes(me)) {
    score += Math.min(mentions.length, 3) * 5;
  }
  const ts = Date.parse(ev.ts || "");
  if (!Number.isNaN(ts) && Date.now() - ts < RECENT_24H_MS) score += 1;
  if (ev.kind === "decision") score += 2;
  for (const c of ev.concepts ?? []) {
    const sourcesForConcept = conceptCountBySource.get(c);
    if (!sourcesForConcept) continue;
    const otherSources = [...sourcesForConcept].filter(
      (s) => s !== ev.source,
    );
    if (otherSources.length > 0) {
      score += 3;
      break;
    }
  }
  return score;
}

function countConceptsBySource(
  events: TimelineEvent[],
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const ev of events) {
    for (const c of ev.concepts ?? []) {
      const set = out.get(c) ?? new Set<string>();
      set.add(ev.source || "");
      out.set(c, set);
    }
  }
  return out;
}

function scoreToSize(score: number, maxScore: number): number {
  // Linear scale from MIN to MAX; clamp at the bounds.
  if (maxScore <= 0) return MIN_NODE_SIZE;
  const t = Math.min(1, Math.max(0, score / maxScore));
  return MIN_NODE_SIZE + t * (MAX_NODE_SIZE - MIN_NODE_SIZE);
}

// ---------- value extraction helpers ----------

function actorKeyOf(ev: TimelineEvent): string | null {
  const a = (ev.actor ?? "").trim().toLowerCase();
  return a.length > 0 ? a : null;
}

function threadKeyOf(ev: TimelineEvent): string | null {
  const refs = ev.refs as Record<string, unknown> | undefined;
  if (!refs) return null;
  // Prefer an explicit thread reference. Fall back to the first thread
  // key from refs.threads.
  const direct = refs["conversation_id"] ?? refs["thread"];
  if (typeof direct === "string" && direct.length > 0) {
    return direct.toLowerCase();
  }
  const arr = refs["threads"];
  if (Array.isArray(arr) && typeof arr[0] === "string" && arr[0].length > 0) {
    return arr[0].toLowerCase();
  }
  return null;
}

function extractMentions(body: string): string[] {
  if (!body) return [];
  const out = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) {
    out.add(m[1].toLowerCase());
  }
  return [...out];
}

function firstNonEmptyLine(ev: TimelineEvent): string {
  const body = ev.body ?? ev.kind ?? "";
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (t.length > 0) return t;
  }
  return "(no body)";
}

function trimLabel(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/**
 * Normalize an edge endpoint — d3-force replaces `source`/`target` strings
 * with the node objects after the first tick, so we accept either.
 */
function idOf(end: string | NodeObject | { id?: string }): string {
  if (typeof end === "string") return end;
  if (end && typeof end === "object" && "id" in end && typeof end.id === "string") {
    return end.id;
  }
  return String(end);
}

function localDayKey(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Convert a hex color to `rgba(...)` with the requested alpha. Used to
 * dim atom nodes when the user is hovering a different node.
 */
function hexToRgba(hex: string, alpha: number): string {
  if (hex === "transparent") return hex;
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return `rgba(120, 113, 108, ${alpha})`;
  const r = Number.parseInt(m[1], 16);
  const g = Number.parseInt(m[2], 16);
  const b = Number.parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
