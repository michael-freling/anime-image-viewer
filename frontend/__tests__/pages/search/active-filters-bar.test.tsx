/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for the ActiveFiltersBar used by the Search page.
 */
jest.mock("@chakra-ui/react", () =>
  require("../../components/chakra-stub").chakraStubFactory(),
);
jest.mock("lucide-react", () =>
  require("../../components/chakra-stub").lucideStubFactory(),
);

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ActiveFiltersBar } from "../../../src/pages/search/active-filters-bar";
import { EMPTY_FILTER_STATE } from "../../../src/pages/search/filter-state";
import type { Tag } from "../../../src/types";

interface Rendered {
  container: HTMLDivElement;
  root: Root;
  unmount: () => void;
  rerender: (el: React.ReactElement) => void;
}

function render(el: React.ReactElement): Rendered {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  act(() => {
    root = createRoot(container);
    root.render(el);
  });
  return {
    container,
    root,
    rerender(next) {
      act(() => {
        root.render(next);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.parentNode?.removeChild(container);
    },
  };
}

const TAGS: Tag[] = [
  { id: 1, name: "Outdoor", category: "scene" },
  { id: 2, name: "Sunny", category: "nature" },
  { id: 3, name: "Indoor", category: "scene" },
];
const TAG_MAP = new Map(TAGS.map((t) => [t.id, t]));

describe("ActiveFiltersBar", () => {
  test("renders nothing when no filters and no totalLabel", () => {
    const r = render(
      createElement(ActiveFiltersBar, {
        state: EMPTY_FILTER_STATE,
        tagMap: TAG_MAP,
        onRemove: jest.fn(),
        onClearAll: jest.fn(),
      }),
    );
    expect(r.container.querySelector("[data-testid='active-filters-bar']")).toBeNull();
    r.unmount();
  });

  test("renders include chips + clear all when include ids are set", () => {
    const onRemove = jest.fn();
    const r = render(
      createElement(ActiveFiltersBar, {
        state: {
          ...EMPTY_FILTER_STATE,
          includeIds: [1],
        },
        tagMap: TAG_MAP,
        onRemove,
        onClearAll: jest.fn(),
      }),
    );
    expect(
      r.container.querySelector("[data-testid='active-filters-bar']"),
    ).not.toBeNull();
    expect(r.container.textContent).toContain("Outdoor");

    const clear = r.container.querySelector(
      "[data-testid='active-filters-clear-all']",
    );
    expect(clear).not.toBeNull();
    r.unmount();
  });

  test("renders exclude chips with the (−) prefix", () => {
    const r = render(
      createElement(ActiveFiltersBar, {
        state: {
          ...EMPTY_FILTER_STATE,
          excludeIds: [3],
        },
        tagMap: TAG_MAP,
        onRemove: jest.fn(),
        onClearAll: jest.fn(),
      }),
    );
    const chip = r.container.querySelector("[data-variant='exclude']");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("Indoor");
    r.unmount();
  });

  test("clicking a chip X fires onRemove with the tag id", () => {
    const onRemove = jest.fn();
    const r = render(
      createElement(ActiveFiltersBar, {
        state: {
          ...EMPTY_FILTER_STATE,
          includeIds: [1, 2],
        },
        tagMap: TAG_MAP,
        onRemove,
        onClearAll: jest.fn(),
      }),
    );
    const xs = r.container.querySelectorAll("[aria-label^='Remove filter']");
    expect(xs.length).toBe(2);
    act(() => {
      (xs[0] as HTMLElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    // The first chip is for id=1 (ordered as the state supplies).
    expect(onRemove).toHaveBeenCalledWith(1);
    r.unmount();
  });

  test("clear all button fires the onClearAll handler", () => {
    const onClearAll = jest.fn();
    const r = render(
      createElement(ActiveFiltersBar, {
        state: {
          ...EMPTY_FILTER_STATE,
          includeIds: [1],
        },
        tagMap: TAG_MAP,
        onRemove: jest.fn(),
        onClearAll,
      }),
    );
    const btn = r.container.querySelector(
      "[data-testid='active-filters-clear-all']",
    ) as HTMLElement | null;
    expect(btn).not.toBeNull();
    act(() => {
      btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClearAll).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  test("falls back to '#id' label when tagMap has no entry", () => {
    const r = render(
      createElement(ActiveFiltersBar, {
        state: {
          ...EMPTY_FILTER_STATE,
          includeIds: [999],
        },
        tagMap: new Map(),
        onRemove: jest.fn(),
        onClearAll: jest.fn(),
      }),
    );
    expect(r.container.textContent).toContain("#999");
    r.unmount();
  });

  test("totalLabel renders even without any chip", () => {
    const r = render(
      createElement(ActiveFiltersBar, {
        state: EMPTY_FILTER_STATE,
        tagMap: TAG_MAP,
        onRemove: jest.fn(),
        onClearAll: jest.fn(),
        totalLabel: "42 images match your filters",
      }),
    );
    expect(
      r.container.querySelector("[data-testid='active-filters-total']")
        ?.textContent,
    ).toContain("42 images");
    // No chips rendered -> no clear all either.
    expect(
      r.container.querySelector("[data-testid='active-filters-clear-all']"),
    ).toBeNull();
    r.unmount();
  });

  test("renders character include chips with name from characterMap", () => {
    const characterMap = new Map([
      [10, { id: 10, name: "Spike" }],
      [20, { id: 20, name: "Faye" }],
    ]);
    const r = render(
      createElement(ActiveFiltersBar, {
        state: {
          ...EMPTY_FILTER_STATE,
          includeCharacterIds: [10],
        },
        tagMap: TAG_MAP,
        characterMap,
        onRemove: jest.fn(),
        onRemoveCharacter: jest.fn(),
        onClearAll: jest.fn(),
      }),
    );
    expect(r.container.textContent).toContain("Spike");
    // Clear all should show since we have character filters.
    expect(
      r.container.querySelector("[data-testid='active-filters-clear-all']"),
    ).not.toBeNull();
    r.unmount();
  });

  test("renders character exclude chips with name from characterMap", () => {
    const characterMap = new Map([
      [10, { id: 10, name: "Spike" }],
    ]);
    const r = render(
      createElement(ActiveFiltersBar, {
        state: {
          ...EMPTY_FILTER_STATE,
          excludeCharacterIds: [10],
        },
        tagMap: TAG_MAP,
        characterMap,
        onRemove: jest.fn(),
        onRemoveCharacter: jest.fn(),
        onClearAll: jest.fn(),
      }),
    );
    const chip = r.container.querySelector("[data-variant='exclude']");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("Spike");
    r.unmount();
  });

  test("falls back to 'Character #id' when characterMap has no entry", () => {
    const r = render(
      createElement(ActiveFiltersBar, {
        state: {
          ...EMPTY_FILTER_STATE,
          includeCharacterIds: [999],
        },
        tagMap: TAG_MAP,
        onRemove: jest.fn(),
        onClearAll: jest.fn(),
      }),
    );
    expect(r.container.textContent).toContain("Character #999");
    r.unmount();
  });

  test("clicking character chip X fires onRemoveCharacter", () => {
    const onRemoveCharacter = jest.fn();
    const characterMap = new Map([
      [10, { id: 10, name: "Spike" }],
    ]);
    const r = render(
      createElement(ActiveFiltersBar, {
        state: {
          ...EMPTY_FILTER_STATE,
          includeCharacterIds: [10],
        },
        tagMap: TAG_MAP,
        characterMap,
        onRemove: jest.fn(),
        onRemoveCharacter,
        onClearAll: jest.fn(),
      }),
    );
    const xs = r.container.querySelectorAll("[aria-label^='Remove filter']");
    expect(xs.length).toBe(1);
    act(() => {
      (xs[0] as HTMLElement).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(onRemoveCharacter).toHaveBeenCalledWith(10);
    r.unmount();
  });
});
