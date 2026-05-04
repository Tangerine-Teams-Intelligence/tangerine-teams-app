import "@testing-library/jest-dom";
import React from "react";
import { vi } from "vitest";
// === wave 4-D i18n ===
// Bootstrap i18next at test setup so route smoke tests + component tests that
// query for English copy via getByText/findByRole(name:/.../i) get real
// translated strings instead of raw keys like "coThinker.initialize".
import { setupI18n } from "../src/i18n";
setupI18n();

// v1.24.0 — `react-force-graph-2d` uses `force-graph` which calls
// `canvas.getContext('2d').scale(...)` on init. jsdom returns null for
// `getContext('2d')` so the real component crashes any test that renders
// `<FeedRoute/>` (now mounting `<GraphView/>`). The targeted unit test
// file `tests/v1_24-graph-view.test.tsx` shadows this with its own
// data-surfacing mock for assertion-level coverage; this global stub
// just keeps the renders alive without a crash.
vi.mock("react-force-graph-2d", () => {
  const Stub = (_props: Record<string, unknown>) =>
    React.createElement("div", { "data-testid": "graph-canvas-stub" });
  return { default: Stub };
});

// v2.0-alpha.2 — reactflow on the home dashboard pulls in DOM measurement
// APIs that jsdom doesn't implement. Stub them globally so any test that
// renders a component containing <WorkflowGraph /> (notably the /today
// route smoke test) doesn't throw on mount.
const __g = globalThis as unknown as {
  ResizeObserver?: unknown;
  DOMMatrixReadOnly?: unknown;
  DOMMatrix?: unknown;
};
if (typeof __g.ResizeObserver === "undefined") {
  class StubResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  __g.ResizeObserver = StubResizeObserver;
}
if (typeof __g.DOMMatrixReadOnly === "undefined") {
  class StubDOMMatrix {
    m22 = 1;
    constructor(_t?: unknown) {}
  }
  __g.DOMMatrixReadOnly = StubDOMMatrix;
  __g.DOMMatrix = StubDOMMatrix;
}
