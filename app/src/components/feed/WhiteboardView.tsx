/**
 * v1.25.0 — Heptabase-style whiteboard. Replaces v1.24's Obsidian
 * force-directed graph (which CEO rejected: "太差了"). The graph view
 * looked like programmer network topology; the spec for this rewrite is
 * a detective's evidence board — physical-feeling cards floating on an
 * infinite canvas, spatially organized by day × actor, with subtle
 * connection lines drawn between related cards.
 *
 * Design DNA pulled from Heptabase, NOT Obsidian:
 *   • White / cream background, NOT dark mode default.
 *   • Cards are uniform white (no source-tint). They read like Polaroids
 *     pinned to a corkboard, not like vendor-colored chips.
 *   • Two-layer shadow on every card (close + far) for depth realism.
 *   • Generous whitespace. Cards stagger within a day so they don't
 *     align in a perfect grid (the "physical pinned" feel).
 *   • Connection lines are decorative — 1px curved stone-300 SVG
 *     bezier paths between cards that share a mention / concept /
 *     conversation. Not interactive, not labeled.
 *   • Pan + zoom via react-zoom-pan-pinch (10kb gzipped wrapper around
 *     CSS transforms — no three.js, no WebGL, no force simulation).
 *
 * Algorithmic positioning (NOT force-directed):
 *   • Y axis = day (newest at top, scroll down = travel back in time).
 *   • X axis = actor lane (each unique actor gets a vertical column).
 *   • Within an actor lane within a day, cards stack newest-first.
 *   • Within a day, cards stagger horizontally by ±8px to break the
 *     rigid grid.
 *
 * R6 honesty preserved — empty events still routes to the caller's
 * EmptyState (caller in feed.tsx mounts EmptyState before us). When
 * mounted with 0 events the WhiteboardView renders an empty canvas +
 * status chip; the parent already handled the no-data case.
 *
 * The single accent rule (orange) shows ONLY on:
 *   • Today's day label (the floating sticky "Today" label).
 *   • Hovered edges (when a card is hovered, its connection lines
 *     dim from stone-300 to ti-orange-500/30).
 * NOT on cards. Cards stay uniform white per Heptabase aesthetic.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch";
import type { TimelineEvent } from "@/lib/views";

// ---------- public component props ----------

interface WhiteboardViewProps {
  events: TimelineEvent[];
  onOpenAtom: (ev: TimelineEvent) => void;
}

// ---------- positioning constants ----------

/** Width per actor lane on the canvas. Cards are 280-340px wide; we
 *  reserve 360px so adjacent cards don't kiss. */
const LANE_WIDTH = 360;

/** Vertical space between cards within the same actor lane on the same
 *  day. Tight stack so 3-4 atoms read as a unit. */
const CARD_GAP_Y = 16;

/** Vertical space between adjacent days. Generous so the day boundary
 *  visually breaks the canvas without needing a hard horizontal rule. */
const DAY_GAP_Y = 80;

/** Top padding above the first day's first card so the day label sits
 *  in clean whitespace. */
const CANVAS_TOP_PAD = 120;

/** Left margin reserved for the floating sticky day label. */
const DAY_LABEL_OFFSET_X = 120;

/** Default card height assumed for layout. Real cards size to content;
 *  the layout pass uses this as a conservative upper bound. */
const CARD_HEIGHT_DEFAULT = 130;

/** Hero card (top-scored atom of the day) is 30px taller. */
const HERO_BONUS_Y = 30;

/** Mention regex — extract @mentions from a card body so we can draw
 *  connection lines between mentioner and mentionee. */
const MENTION_RE = /@([a-z0-9][a-z0-9_.-]*)/gi;

const RECENT_24H_MS = 24 * 60 * 60 * 1000;

// ---------- internal layout types ----------

interface LaidOutCard {
  event: TimelineEvent;
  x: number;
  y: number;
  isHero: boolean;
  dayKey: string;
  actorKey: string;
}

interface DayLabel {
  dayKey: string;
  label: string;
  isToday: boolean;
  /** Y of the topmost card in this day; the label sits 40px above. */
  y: number;
}

interface CanvasLayout {
  cards: LaidOutCard[];
  dayLabels: DayLabel[];
  edges: ConnectionEdge[];
  /** Total width of the canvas in unscaled pixels. */
  width: number;
  /** Total height of the canvas in unscaled pixels. */
  height: number;
}

interface ConnectionEdge {
  fromId: string;
  toId: string;
  /** "mention" = solid 1px line; "concept" = dashed; "thread" = solid bold. */
  kind: "mention" | "concept" | "thread";
  /** Both endpoints, midpoint computed by SVG bezier. */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

// ---------- main component ----------

export function WhiteboardView({ events, onOpenAtom }: WhiteboardViewProps) {
  const transformRef = useRef<ReactZoomPanPinchContentRef | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [hoveredEdgeIds, setHoveredEdgeIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Pure derivation: turn the flat events list into a 2D laid-out
  // canvas with cards, day labels, and connection edges.
  const layout = useMemo(() => buildLayout(events), [events]);

  // When the user hovers a card, build the set of edge keys touching it
  // so the painter can highlight them with the orange accent.
  useEffect(() => {
    if (!hoveredCardId) {
      setHoveredEdgeIds(new Set());
      return;
    }
    const next = new Set<string>();
    for (const e of layout.edges) {
      if (e.fromId === hoveredCardId || e.toId === hoveredCardId) {
        next.add(`${e.fromId}->${e.toId}`);
      }
    }
    setHoveredEdgeIds(next);
  }, [hoveredCardId, layout.edges]);

  // Auto-fit on mount: zoom to roughly show today + yesterday worth of
  // cards. The library exposes setTransform; we compute a sane initial
  // scale based on the canvas height vs the viewport height.
  useEffect(() => {
    const ref = transformRef.current;
    if (!ref) return;
    const t = window.setTimeout(() => {
      try {
        ref.resetTransform(0);
      } catch {
        // ignore — happens in jsdom path with mocked component
      }
    }, 50);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      data-testid="whiteboard-view"
      data-card-count={layout.cards.length}
      data-edge-count={layout.edges.length}
      data-day-count={layout.dayLabels.length}
      data-hovered={hoveredCardId ?? ""}
      data-canvas-width={layout.width}
      data-canvas-height={layout.height}
      className="relative h-full w-full overflow-hidden"
      style={{
        // Warm cream tone — Heptabase's signature canvas color, NOT
        // pure white. Falls back to stone-50 if the user prefers dark
        // mode (we still default to light per the spec).
        background:
          "radial-gradient(ellipse at center, #fcfaf3 0%, #f7f3e9 100%)",
      }}
    >
      <TransformWrapper
        ref={(ref) => {
          transformRef.current = ref;
        }}
        initialScale={1}
        minScale={0.3}
        maxScale={3}
        limitToBounds={false}
        centerOnInit={false}
        wheel={{
          step: 0.12,
          smoothStep: 0.005,
          // Mouse-pointer-anchored zoom; scroll without shift.
        }}
        panning={{
          velocityDisabled: false,
          allowLeftClickPan: true,
          // Don't pan when the user is dragging on a card — the card's
          // own click handler should fire instead.
          excluded: ["whiteboard-card-button"],
        }}
        pinch={{ step: 5 }}
        doubleClick={{ disabled: true }}
      >
        <TransformComponent
          wrapperClass="!h-full !w-full"
          contentClass=""
          wrapperStyle={{ height: "100%", width: "100%" }}
        >
          <Canvas
            layout={layout}
            hoveredCardId={hoveredCardId}
            hoveredEdgeIds={hoveredEdgeIds}
            onHoverCard={setHoveredCardId}
            onClickCard={(ev) => onOpenAtom(ev)}
          />
        </TransformComponent>
      </TransformWrapper>
      <FooterStatus
        cardCount={layout.cards.length}
        edgeCount={layout.edges.length}
      />
    </div>
  );
}

// ---------- canvas painter ----------

function Canvas({
  layout,
  hoveredCardId,
  hoveredEdgeIds,
  onHoverCard,
  onClickCard,
}: {
  layout: CanvasLayout;
  hoveredCardId: string | null;
  hoveredEdgeIds: Set<string>;
  onHoverCard: (id: string | null) => void;
  onClickCard: (ev: TimelineEvent) => void;
}) {
  return (
    <div
      data-testid="whiteboard-canvas"
      style={{
        position: "relative",
        width: layout.width,
        height: layout.height,
      }}
    >
      {/* SVG layer for connection lines — sits BELOW the cards so the
          card shadows don't get cut by the line strokes. The svg is
          `pointer-events: none` so cards still receive clicks. */}
      <svg
        data-testid="whiteboard-edges"
        width={layout.width}
        height={layout.height}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          pointerEvents: "none",
        }}
      >
        {layout.edges.map((e) => {
          const key = `${e.fromId}->${e.toId}`;
          const hovered = hoveredEdgeIds.has(key);
          return (
            <ConnectionLine
              key={key}
              edge={e}
              hovered={hovered}
              testId={`whiteboard-edge-${e.fromId}-${e.toId}`}
            />
          );
        })}
      </svg>

      {/* Day labels — floating sticky on the left margin. Today gets the
          orange accent + serif display font. */}
      {layout.dayLabels.map((d) => (
        <div
          key={d.dayKey}
          data-testid="whiteboard-day-label"
          data-is-today={d.isToday ? "true" : "false"}
          data-day-key={d.dayKey}
          style={{
            position: "absolute",
            left: 16,
            top: d.y - 40,
            width: DAY_LABEL_OFFSET_X - 32,
            pointerEvents: "none",
          }}
        >
          <div
            className={
              d.isToday
                ? "text-[20px] font-semibold tracking-tight text-[var(--ti-orange-500,#cc5500)]"
                : "text-[13px] font-medium text-stone-500"
            }
            style={{
              fontFamily: d.isToday
                ? "ui-serif, Georgia, 'Times New Roman', serif"
                : "ui-sans-serif, system-ui, sans-serif",
            }}
          >
            {d.label}
          </div>
        </div>
      ))}

      {/* Cards. Each is an absolutely-positioned button so click events
          fire predictably + the user can keyboard-tab through them. */}
      {layout.cards.map((c) => (
        <CardView
          key={c.event.id}
          card={c}
          hovered={hoveredCardId === c.event.id}
          onHover={onHoverCard}
          onClick={() => onClickCard(c.event)}
        />
      ))}
    </div>
  );
}

// ---------- card primitive ----------

function CardView({
  card,
  hovered,
  onHover,
  onClick,
}: {
  card: LaidOutCard;
  hovered: boolean;
  onHover: (id: string | null) => void;
  onClick: () => void;
}) {
  const ev = card.event;
  const concepts = ev.concepts ?? [];
  const body = firstNonEmptyLine(ev);
  const time = formatClock(ev.ts);

  // Two-layer shadow — close + far. Hover deepens the far shadow + lifts
  // the card 2px so it reads as physically rising off the corkboard.
  const baseShadow =
    "0 2px 8px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)";
  const hoverShadow =
    "0 4px 12px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.08)";

  // Hero gets `p-6`, regular gets `p-4`. Tailwind needs the literal
  // class strings to survive purging — using utility classes inline.
  const padding = card.isHero ? "p-6" : "p-4";
  const widthPx = card.isHero ? 320 : 290;

  return (
    <button
      type="button"
      data-testid="whiteboard-card"
      data-event-id={ev.id}
      data-is-hero={card.isHero ? "true" : "false"}
      data-actor={card.actorKey}
      data-day={card.dayKey}
      onMouseEnter={() => onHover(ev.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(ev.id)}
      onBlur={() => onHover(null)}
      onClick={onClick}
      className={
        // The class name `whiteboard-card-button` is referenced by the
        // panning excluded list above so a click on a card doesn't get
        // swallowed by the pan handler.
        "whiteboard-card-button group absolute cursor-pointer rounded-md border border-stone-200 bg-white text-left transition-all duration-150 hover:-translate-y-0.5 dark:border-stone-800 dark:bg-stone-900 " +
        padding
      }
      style={{
        left: card.x,
        top: card.y,
        width: widthPx,
        boxShadow: hovered ? hoverShadow : baseShadow,
      }}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="truncate text-[13px] font-semibold text-stone-900 dark:text-stone-100">
          {ev.actor || "?"}
        </span>
        <span className="text-stone-300">·</span>
        <span className="truncate font-mono text-[11px] text-stone-500">
          {ev.source || "?"}
        </span>
        <span className="text-stone-300">·</span>
        <span className="truncate font-mono text-[11px] text-stone-500">
          {time}
        </span>
      </div>
      <div
        className="text-[13px] leading-relaxed text-stone-700 dark:text-stone-300"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: card.isHero ? 5 : 3,
          WebkitBoxOrient: "vertical" as const,
          overflow: "hidden",
        }}
      >
        {body}
      </div>
      {concepts.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {concepts.slice(0, 4).map((c) => (
            <span
              key={c}
              data-testid="whiteboard-card-concept"
              className="font-mono text-[10px] text-stone-400"
            >
              #{c}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// ---------- connection line ----------

function ConnectionLine({
  edge,
  hovered,
  testId,
}: {
  edge: ConnectionEdge;
  hovered: boolean;
  testId: string;
}) {
  // Bezier control points pulled toward the midpoint with vertical bias —
  // so the line gracefully arcs between two cards instead of going
  // straight (which would look like a diagram, not a corkboard string).
  const midX = (edge.fromX + edge.toX) / 2;
  const midY = (edge.fromY + edge.toY) / 2;
  const dx = edge.toX - edge.fromX;
  const arc = Math.min(120, Math.abs(dx) * 0.25);
  const c1x = edge.fromX + dx * 0.25;
  const c1y = edge.fromY + arc;
  const c2x = edge.toX - dx * 0.25;
  const c2y = edge.toY + arc;

  // Avoid unused-var lint: midX/midY would be useful for label placement
  // in a future iteration, kept in scope here.
  void midX;
  void midY;

  const stroke = hovered
    ? "var(--ti-orange-500, #cc5500)"
    : "rgb(214, 211, 209)"; // stone-300

  const strokeOpacity = hovered ? 0.6 : 0.45;
  const strokeWidth = edge.kind === "thread" ? 1.5 : 1;
  const dasharray = edge.kind === "concept" ? "4 4" : undefined;

  return (
    <path
      data-testid={testId}
      data-kind={edge.kind}
      d={`M ${edge.fromX} ${edge.fromY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${edge.toX} ${edge.toY}`}
      fill="none"
      stroke={stroke}
      strokeOpacity={strokeOpacity}
      strokeWidth={strokeWidth}
      strokeDasharray={dasharray}
    />
  );
}

// ---------- footer status ----------

function FooterStatus({
  cardCount,
  edgeCount,
}: {
  cardCount: number;
  edgeCount: number;
}) {
  return (
    <div
      data-testid="whiteboard-status"
      className="pointer-events-none absolute bottom-3 left-4 z-10 select-none font-mono text-[10px] text-stone-500"
    >
      {cardCount} card{cardCount === 1 ? "" : "s"} · {edgeCount} connection
      {edgeCount === 1 ? "" : "s"}
    </div>
  );
}

// ---------- pure helpers (exported for tests) ----------

/**
 * The layout algorithm. Pure derivation from a flat events list.
 *
 *   1. Bucket events by local calendar day, newest day first.
 *   2. Within each day, bucket by actor.
 *   3. Score each event so we can mark the day's hero.
 *   4. Assign actor → lane index by global frequency (heaviest actor
 *      gets the leftmost lane after the day-label margin).
 *   5. Position cards: x = lane offset + small horizontal stagger;
 *      y = day cursor + within-lane stack offset.
 *   6. Build edges from mentions / concepts / thread sharing.
 */
export function buildLayout(events: TimelineEvent[]): CanvasLayout {
  if (events.length === 0) {
    return {
      cards: [],
      dayLabels: [],
      edges: [],
      width: 800,
      height: 600,
    };
  }

  // Sort newest first.
  const sorted = [...events].sort((a, b) =>
    (b.ts ?? "").localeCompare(a.ts ?? ""),
  );

  // 1) Bucket by day.
  const dayBuckets = bucketByDay(sorted);

  // 2/3) Score every event for hero detection.
  const scoreById = scoreAllEvents(sorted);

  // 4) Assign actor lane indices by global atom-count.
  const actorLaneIdx = assignActorLanes(sorted);
  const laneCount = Math.max(1, actorLaneIdx.size);

  const cards: LaidOutCard[] = [];
  const dayLabels: DayLabel[] = [];
  let yCursor = CANVAS_TOP_PAD;
  const todayKey = localDayKey(new Date());

  for (const day of dayBuckets) {
    const dayLabelY = yCursor;
    const isToday = day.dayKey === todayKey;
    dayLabels.push({
      dayKey: day.dayKey,
      label: dayLabelText(day.dayKey, todayKey),
      isToday,
      y: dayLabelY,
    });

    // Pick the hero (highest score in this day).
    let heroId: string | null = null;
    let heroScore = -Infinity;
    for (const ev of day.events) {
      const s = scoreById.get(ev.id) ?? 0;
      if (s > heroScore) {
        heroScore = s;
        heroId = ev.id;
      }
    }

    // Bucket day events by actor, keep newest-first within actor.
    const byActor = new Map<string, TimelineEvent[]>();
    for (const ev of day.events) {
      const key = (ev.actor ?? "").trim().toLowerCase() || "?";
      const list = byActor.get(key) ?? [];
      list.push(ev);
      byActor.set(key, list);
    }

    // Track per-lane y cursor so multi-card actors stack nicely
    // without colliding with another lane.
    const laneYCursor = new Map<number, number>();
    for (let i = 0; i < laneCount; i++) {
      laneYCursor.set(i, yCursor);
    }

    for (const [actorKey, list] of byActor.entries()) {
      const lane = actorLaneIdx.get(actorKey) ?? 0;
      const baseX =
        DAY_LABEL_OFFSET_X + lane * LANE_WIDTH + (lane % 2 === 0 ? 0 : 8);
      let cy = laneYCursor.get(lane) ?? yCursor;
      for (let idx = 0; idx < list.length; idx++) {
        const ev = list[idx];
        const isHero = ev.id === heroId;
        // Tiny horizontal stagger within a lane so a stack of 3 cards
        // doesn't stamp out an exact column.
        const jitterX = (idx % 2 === 0 ? -4 : 4) * 1.5;
        cards.push({
          event: ev,
          x: baseX + jitterX,
          y: cy,
          isHero,
          dayKey: day.dayKey,
          actorKey,
        });
        const heightStep =
          CARD_HEIGHT_DEFAULT + (isHero ? HERO_BONUS_Y : 0) + CARD_GAP_Y;
        cy += heightStep;
      }
      laneYCursor.set(lane, cy);
    }

    // Advance the global y cursor past the tallest lane in this day.
    let dayMaxY = yCursor + CARD_HEIGHT_DEFAULT;
    for (const v of laneYCursor.values()) {
      if (v > dayMaxY) dayMaxY = v;
    }
    yCursor = dayMaxY + DAY_GAP_Y;
  }

  // 6) Edge inference. For each pair of cards within a 7-day window,
  //    test mention / concept / thread sharing. Cap edges per card at 5.
  const cardById = new Map<string, LaidOutCard>();
  for (const c of cards) cardById.set(c.event.id, c);
  const edges = inferEdges(cards, cardById);

  const width =
    DAY_LABEL_OFFSET_X + Math.max(1, laneCount) * LANE_WIDTH + 80;
  const height = yCursor + 80;

  return { cards, dayLabels, edges, width, height };
}

interface DayBucket {
  dayKey: string;
  events: TimelineEvent[];
}

/** Group events by local calendar day (YYYY-MM-DD), newest day first. */
function bucketByDay(sorted: TimelineEvent[]): DayBucket[] {
  const map = new Map<string, TimelineEvent[]>();
  const order: string[] = [];
  for (const ev of sorted) {
    const d = ev.ts ? new Date(ev.ts) : null;
    const key = d && !Number.isNaN(d.getTime()) ? localDayKey(d) : "unknown";
    let arr = map.get(key);
    if (!arr) {
      arr = [];
      map.set(key, arr);
      order.push(key);
    }
    arr.push(ev);
  }
  return order.map((k) => ({ dayKey: k, events: map.get(k)! }));
}

/** Score every event so we can pick the day's hero card. Mirrors the
 *  HighlightsRow scoring with a tiny tweak: we don't need to know the
 *  current user here (no @me bonus since the hero is per-day, not per-
 *  user).
 */
function scoreAllEvents(events: TimelineEvent[]): Map<string, number> {
  const out = new Map<string, number>();
  // Build concept → sources index for cross-source bonus.
  const conceptSources = new Map<string, Set<string>>();
  for (const ev of events) {
    for (const c of ev.concepts ?? []) {
      const set = conceptSources.get(c) ?? new Set<string>();
      set.add(ev.source || "");
      conceptSources.set(c, set);
    }
  }
  const now = Date.now();
  for (const ev of events) {
    let score = 0;
    const mentions = extractMentions(ev.body ?? "");
    if (mentions.length > 0) score += Math.min(mentions.length, 3) * 4;
    const ts = Date.parse(ev.ts || "");
    if (!Number.isNaN(ts) && now - ts < RECENT_24H_MS) score += 1;
    if (ev.kind === "decision") score += 3;
    for (const c of ev.concepts ?? []) {
      const srcs = conceptSources.get(c);
      if (!srcs) continue;
      const others = [...srcs].filter((s) => s !== ev.source);
      if (others.length > 0) {
        score += 2;
        break;
      }
    }
    if (ev.body && ev.body.length > 200) score += 1;
    out.set(ev.id, score);
  }
  return out;
}

/** Walk events, count atoms per actor, sort actors by atom-count desc,
 *  return actor → lane index. The heaviest actor gets lane 0 (leftmost
 *  after the day-label margin).
 */
export function assignActorLanes(events: TimelineEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ev of events) {
    const k = (ev.actor ?? "").trim().toLowerCase() || "?";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]); // tie-break alphabetical for determinism
  });
  const out = new Map<string, number>();
  sorted.forEach(([key], idx) => out.set(key, idx));
  return out;
}

/** Build the connection edge list by scanning every pair of cards within
 *  a 7-day temporal window for shared mention / concept / thread ids. */
export function inferEdges(
  cards: LaidOutCard[],
  cardById: Map<string, LaidOutCard>,
): ConnectionEdge[] {
  const out: ConnectionEdge[] = [];
  // Cap the per-card connection count so the canvas doesn't hairball.
  const CONNECTIONS_PER_CARD = 5;
  const connectionCount = new Map<string, number>();
  // Pre-compute mention sets + concept sets + thread keys.
  type Annot = {
    id: string;
    actorKey: string;
    mentions: Set<string>;
    concepts: Set<string>;
    threadKey: string | null;
    ts: number;
  };
  const annots: Annot[] = cards.map((c) => ({
    id: c.event.id,
    actorKey: c.actorKey,
    mentions: new Set(extractMentions(c.event.body ?? "")),
    concepts: new Set(c.event.concepts ?? []),
    threadKey: threadKeyOf(c.event),
    ts: Date.parse(c.event.ts || "") || 0,
  }));
  // 7-day window for pairwise scan, lowers O(n^2) impact in practice.
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const seen = new Set<string>();

  for (let i = 0; i < annots.length; i++) {
    const a = annots[i];
    for (let j = i + 1; j < annots.length; j++) {
      const b = annots[j];
      // Stop early once we've walked off the temporal window — events
      // were sorted newest first earlier.
      if (a.ts && b.ts && Math.abs(a.ts - b.ts) > SEVEN_DAYS_MS) {
        // Don't `break` because non-strict order, but skip cheaply.
        continue;
      }
      let kind: ConnectionEdge["kind"] | null = null;
      // Thread match (highest precedence).
      if (a.threadKey && a.threadKey === b.threadKey) {
        kind = "thread";
      } else {
        // Mention match — A mentions B's actor or vice versa.
        const aMentionsB = b.actorKey && a.mentions.has(b.actorKey);
        const bMentionsA = a.actorKey && b.mentions.has(a.actorKey);
        if (aMentionsB || bMentionsA) {
          kind = "mention";
        } else {
          // Concept overlap.
          let overlap = false;
          for (const c of a.concepts) {
            if (b.concepts.has(c)) {
              overlap = true;
              break;
            }
          }
          if (overlap) kind = "concept";
        }
      }
      if (!kind) continue;
      // Cap per card.
      const aCount = connectionCount.get(a.id) ?? 0;
      const bCount = connectionCount.get(b.id) ?? 0;
      if (aCount >= CONNECTIONS_PER_CARD || bCount >= CONNECTIONS_PER_CARD) {
        continue;
      }
      const key = `${a.id}->${b.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cardA = cardById.get(a.id);
      const cardB = cardById.get(b.id);
      if (!cardA || !cardB) continue;
      out.push({
        fromId: a.id,
        toId: b.id,
        kind,
        // Anchor the line at the bottom-center of the source card and
        // top-center of the target card. The card's nominal width is
        // captured implicitly by the +145 horizontal offset (half of
        // 290 — the regular card width).
        fromX: cardA.x + 145,
        fromY: cardA.y + 100,
        toX: cardB.x + 145,
        toY: cardB.y,
      });
      connectionCount.set(a.id, aCount + 1);
      connectionCount.set(b.id, bCount + 1);
    }
  }
  return out;
}

// ---------- micro helpers ----------

function extractMentions(body: string): string[] {
  if (!body) return [];
  const out = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) {
    out.add(m[1].toLowerCase());
  }
  return [...out];
}

function threadKeyOf(ev: TimelineEvent): string | null {
  const refs = ev.refs as Record<string, unknown> | undefined;
  if (!refs) return null;
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

function firstNonEmptyLine(ev: TimelineEvent): string {
  const body = ev.body ?? ev.kind ?? "";
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (t.length > 0) return t;
  }
  return "(no body)";
}

function formatClock(iso: string | null | undefined): string {
  if (!iso) return "??:??";
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "??:??";
  return d.toISOString().slice(11, 16);
}

function localDayKey(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function dayLabelText(dayKey: string, todayKey: string): string {
  if (dayKey === "unknown") return "Older";
  if (dayKey === todayKey) return "Today";
  // "Yesterday" if exactly one day before today.
  const today = new Date(todayKey + "T00:00:00");
  const that = new Date(dayKey + "T00:00:00");
  if (!Number.isNaN(today.getTime()) && !Number.isNaN(that.getTime())) {
    const diffDays = Math.round(
      (today.getTime() - that.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (diffDays === 1) return "Yesterday";
    if (diffDays >= 2 && diffDays < 7) {
      // "Wednesday, May 1"
      const dow = DAY_NAMES[that.getDay()];
      const month = MONTH_NAMES[that.getMonth()];
      return `${dow}, ${month} ${that.getDate()}`;
    }
    if (diffDays >= 7 && diffDays < 30) {
      const month = MONTH_NAMES[that.getMonth()];
      return `${month} ${that.getDate()}`;
    }
  }
  return dayKey;
}
