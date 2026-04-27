/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for `EmptyState`.
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
import { EmptyState } from "../../../src/components/shared/empty-state";

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

describe("EmptyState", () => {
  test("renders the title", () => {
    const r = render(createElement(EmptyState, { title: "No anime yet" }));
    expect(r.container.textContent).toContain("No anime yet");
    r.unmount();
  });

  test("renders the description when provided", () => {
    const r = render(
      createElement(EmptyState, {
        title: "No anime yet",
        description: "Create one or import folders.",
      }),
    );
    expect(r.container.textContent).toContain("Create one or import folders.");
    r.unmount();
  });

  test("description is absent when omitted", () => {
    const r = render(createElement(EmptyState, { title: "Oops" }));
    expect(r.container.textContent).toBe("Oops");
    r.unmount();
  });

  test("renders action element when provided", () => {
    const action = createElement(
      "button",
      { type: "button", "data-testid": "empty-action" },
      "Do the thing",
    );
    const r = render(
      createElement(EmptyState, {
        title: "Nothing here",
        action,
      }),
    );
    expect(
      r.container.querySelector("[data-testid='empty-action']"),
    ).not.toBeNull();
    r.unmount();
  });

  test("renders the icon when provided", () => {
    const FakeIcon = require("lucide-react").Image;
    const r = render(
      createElement(EmptyState, {
        title: "Nothing",
        icon: FakeIcon,
      }),
    );
    expect(r.container.querySelector("svg")).not.toBeNull();
    r.unmount();
  });

  test("role=status for announcement to screen readers", () => {
    const r = render(createElement(EmptyState, { title: "Empty" }));
    expect(r.container.querySelector("[role='status']")).not.toBeNull();
    r.unmount();
  });
});
