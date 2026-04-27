/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for `ImportProgressBar`.
 *
 * The component reads directly from `useImportProgressStore` (Zustand).
 * Each test resets the store first so state doesn't leak between tests.
 */
jest.mock("@chakra-ui/react", () =>
  require("../chakra-stub").chakraStubFactory(),
);
jest.mock("lucide-react", () =>
  require("../chakra-stub").lucideStubFactory(),
);

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ImportProgressBar } from "../../../src/components/shared/import-progress-bar";
import { useImportProgressStore } from "../../../src/stores/import-progress-store";

interface Rendered {
  container: HTMLDivElement;
  root: Root;
  unmount: () => void;
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
    unmount() {
      act(() => {
        root.unmount();
      });
      container.parentNode?.removeChild(container);
    },
  };
}

function resetStore() {
  act(() => {
    useImportProgressStore.setState({ imports: new Map() });
  });
}

describe("ImportProgressBar", () => {
  beforeEach(resetStore);

  test("renders nothing when no imports are active", () => {
    const r = render(createElement(ImportProgressBar));
    expect(
      r.container.querySelector("[data-testid='import-progress-bar']"),
    ).toBeNull();
    r.unmount();
  });

  test("renders one row per active import", () => {
    act(() => {
      useImportProgressStore.getState().start("a", "Naruto · S1", 10);
      useImportProgressStore.getState().start("b", "Naruto · S2", 5);
    });
    const r = render(createElement(ImportProgressBar));
    expect(
      r.container.querySelector("[data-testid='import-progress-bar']"),
    ).not.toBeNull();
    const rows = r.container.querySelectorAll(
      "[data-testid='import-progress-row']",
    );
    expect(rows.length).toBe(2);
    expect(r.container.textContent).toContain("Naruto · S1");
    expect(r.container.textContent).toContain("Naruto · S2");
    r.unmount();
  });

  test("shows the progress numerator/denominator while running", () => {
    act(() => {
      useImportProgressStore.getState().start("a", "Foo", 20);
      useImportProgressStore.getState().update("a", { completed: 7 });
    });
    const r = render(createElement(ImportProgressBar));
    expect(r.container.textContent).toContain("7 / 20");
    r.unmount();
  });

  test("finished imports show a dismiss button that removes the row", () => {
    act(() => {
      useImportProgressStore.getState().start("a", "Foo", 3);
      useImportProgressStore.getState().finish("a");
    });
    const r = render(createElement(ImportProgressBar));
    const dismiss = r.container.querySelector(
      "[aria-label='Dismiss import Foo']",
    ) as HTMLButtonElement | null;
    expect(dismiss).not.toBeNull();
    act(() => {
      dismiss!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      useImportProgressStore.getState().imports.has("a"),
    ).toBe(false);
    r.unmount();
  });

  test("dismiss is hidden while an import is still running", () => {
    act(() => {
      useImportProgressStore.getState().start("a", "Foo", 3);
    });
    const r = render(createElement(ImportProgressBar));
    expect(
      r.container.querySelector("[aria-label='Dismiss import Foo']"),
    ).toBeNull();
    r.unmount();
  });

  test("finished rows display 'Complete · N imported'", () => {
    act(() => {
      useImportProgressStore.getState().start("a", "Foo", 4);
      useImportProgressStore.getState().finish("a");
    });
    const r = render(createElement(ImportProgressBar));
    expect(r.container.textContent).toContain("Complete");
    expect(r.container.textContent).toContain("4");
    r.unmount();
  });
});
