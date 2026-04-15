/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for the `TagDialog` wrapper.
 *
 * The chakra stub's `Dialog.Root` renders children only when `open=true`, so
 * we can drive open/closed state via prop and assert the dialog mounts /
 * unmounts accordingly.
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

import { TagDialog } from "../../../src/pages/tags/tag-dialog";
import type { TagFormValues } from "../../../src/pages/tags/tag-form";

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

const VALUES: TagFormValues = {
  name: "Alpha",
  category: "nature",
  parentId: null,
};

describe("TagDialog", () => {
  test("renders nothing when open=false", () => {
    const r = render(
      createElement(TagDialog, {
        open: false,
        onClose: jest.fn(),
        title: "New tag",
        values: VALUES,
        onChange: jest.fn(),
        submitLabel: "Create",
        onSubmit: jest.fn(),
      }),
    );
    expect(r.container.querySelector("[data-testid='tag-dialog']")).toBeNull();
    r.unmount();
  });

  test("renders the form + title when open=true", () => {
    const r = render(
      createElement(TagDialog, {
        open: true,
        onClose: jest.fn(),
        title: "Edit tag — Alpha",
        values: VALUES,
        onChange: jest.fn(),
        submitLabel: "Save",
        onSubmit: jest.fn(),
      }),
    );
    expect(
      r.container.querySelector("[data-testid='tag-dialog']"),
    ).not.toBeNull();
    // The title renders inside a Dialog.Title (stubbed as <h2>).
    expect(r.container.textContent).toContain("Edit tag — Alpha");
    expect(
      r.container.querySelector("[data-testid='tag-form']"),
    ).not.toBeNull();
    expect(r.container.textContent).toContain("Save");
    r.unmount();
  });

  test("toggling open=false -> open=true mounts the dialog", () => {
    const r = render(
      createElement(TagDialog, {
        open: false,
        onClose: jest.fn(),
        title: "New tag",
        values: VALUES,
        onChange: jest.fn(),
        submitLabel: "Create",
        onSubmit: jest.fn(),
      }),
    );
    expect(r.container.querySelector("[data-testid='tag-dialog']")).toBeNull();

    r.rerender(
      createElement(TagDialog, {
        open: true,
        onClose: jest.fn(),
        title: "New tag",
        values: VALUES,
        onChange: jest.fn(),
        submitLabel: "Create",
        onSubmit: jest.fn(),
      }),
    );
    expect(
      r.container.querySelector("[data-testid='tag-dialog']"),
    ).not.toBeNull();
    r.unmount();
  });
});
