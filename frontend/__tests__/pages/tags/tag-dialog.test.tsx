/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for the `TagDialog` wrapper.
 *
 * The chakra stub's `Dialog.Root` renders children only when `open=true`, so
 * we can drive open/closed state via prop and assert the dialog mounts /
 * unmounts accordingly.
 *
 * We also capture `Dialog.Root`'s received props on each render via a
 * shared ref (`lastDialogRootProps`) so tests can exercise the
 * `onOpenChange` handler — that's the only way to cover the
 * `handleOpenChange` branch in tag-dialog.tsx under the chakra stub (the
 * stub never dispatches open-change events on its own).
 */
const lastDialogRootProps: {
  value: { open: boolean; onOpenChange?: (d: { open: boolean }) => void } | null;
} = { value: null };

jest.mock("@chakra-ui/react", () => {
  const stub = require("../../components/chakra-stub").chakraStubFactory();
  const originalRoot = stub.Dialog.Root;
  // Wrap Dialog.Root to also record the latest set of props the wrapper
  // received so tests can fire the open-change callback.
  const WrappedRoot = (props: Record<string, unknown>) => {
    lastDialogRootProps.value = props as typeof lastDialogRootProps.value;
    return originalRoot(props);
  };
  return {
    ...stub,
    Dialog: {
      ...stub.Dialog,
      Root: WrappedRoot,
    },
  };
});
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

  test("firing onOpenChange({open:false}) calls onClose when not submitting", () => {
    const onClose = jest.fn();
    const r = render(
      createElement(TagDialog, {
        open: true,
        onClose,
        title: "New tag",
        values: VALUES,
        onChange: jest.fn(),
        submitLabel: "Create",
        onSubmit: jest.fn(),
      }),
    );
    expect(lastDialogRootProps.value).not.toBeNull();
    const { onOpenChange } = lastDialogRootProps.value!;
    expect(typeof onOpenChange).toBe("function");
    act(() => {
      onOpenChange!({ open: false });
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  test("onOpenChange is a no-op while the form is submitting", () => {
    const onClose = jest.fn();
    const r = render(
      createElement(TagDialog, {
        open: true,
        onClose,
        title: "New tag",
        values: VALUES,
        onChange: jest.fn(),
        submitLabel: "Create",
        submitting: true,
        onSubmit: jest.fn(),
      }),
    );
    const { onOpenChange } = lastDialogRootProps.value!;
    act(() => {
      onOpenChange!({ open: false });
    });
    expect(onClose).not.toHaveBeenCalled();
    // And opening doesn't call onClose either (guard against bogus branch
    // that fires close when details.open=true).
    act(() => {
      onOpenChange!({ open: true });
    });
    expect(onClose).not.toHaveBeenCalled();
    r.unmount();
  });

  test("closeOnEscape + closeOnInteractOutside flip off while submitting", () => {
    const { rerender, unmount } = render(
      createElement(TagDialog, {
        open: true,
        onClose: jest.fn(),
        title: "New tag",
        values: VALUES,
        onChange: jest.fn(),
        submitLabel: "Create",
        submitting: false,
        onSubmit: jest.fn(),
      }),
    );
    // Defaults: both gated on !submitting, so both true when not submitting.
    expect(
      (lastDialogRootProps.value as unknown as Record<string, unknown>)
        .closeOnEscape,
    ).toBe(true);
    expect(
      (lastDialogRootProps.value as unknown as Record<string, unknown>)
        .closeOnInteractOutside,
    ).toBe(true);

    rerender(
      createElement(TagDialog, {
        open: true,
        onClose: jest.fn(),
        title: "New tag",
        values: VALUES,
        onChange: jest.fn(),
        submitLabel: "Create",
        submitting: true,
        onSubmit: jest.fn(),
      }),
    );
    expect(
      (lastDialogRootProps.value as unknown as Record<string, unknown>)
        .closeOnEscape,
    ).toBe(false);
    expect(
      (lastDialogRootProps.value as unknown as Record<string, unknown>)
        .closeOnInteractOutside,
    ).toBe(false);
    unmount();
  });
});
