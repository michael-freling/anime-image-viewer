/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for `ConfirmDialog`.
 *
 * The stubbed Chakra Dialog returns null when `open=false` — which means the
 * "renders nothing" case is just the absence of the dialog. We verify the
 * danger variant via the data-variant attribute, and the loading-while-
 * confirming flow via a promise that resolves on a trigger we control.
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
import { ConfirmDialog } from "../../../src/components/ui/confirm-dialog";

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

describe("ConfirmDialog", () => {
  test("renders nothing when open=false", () => {
    const r = render(
      createElement(ConfirmDialog, {
        open: false,
        onClose: jest.fn(),
        onConfirm: jest.fn(),
        title: "Delete this?",
      }),
    );
    expect(
      r.container.querySelector("[data-testid='confirm-dialog']"),
    ).toBeNull();
    r.unmount();
  });

  test("renders the title and description when open=true", () => {
    const r = render(
      createElement(ConfirmDialog, {
        open: true,
        onClose: jest.fn(),
        onConfirm: jest.fn(),
        title: "Delete Naruto?",
        description: "This action cannot be undone.",
      }),
    );
    expect(r.container.textContent).toContain("Delete Naruto?");
    expect(r.container.textContent).toContain("This action cannot be undone.");
    r.unmount();
  });

  test("default variant sets data-variant='default'", () => {
    const r = render(
      createElement(ConfirmDialog, {
        open: true,
        onClose: jest.fn(),
        onConfirm: jest.fn(),
        title: "Proceed?",
      }),
    );
    const dialog = r.container.querySelector(
      "[data-testid='confirm-dialog']",
    ) as HTMLElement;
    expect(dialog.getAttribute("data-variant")).toBe("default");
    r.unmount();
  });

  test("danger variant sets data-variant='danger'", () => {
    const r = render(
      createElement(ConfirmDialog, {
        open: true,
        onClose: jest.fn(),
        onConfirm: jest.fn(),
        title: "Delete?",
        variant: "danger",
      }),
    );
    const dialog = r.container.querySelector(
      "[data-testid='confirm-dialog']",
    ) as HTMLElement;
    expect(dialog.getAttribute("data-variant")).toBe("danger");
    r.unmount();
  });

  test("Cancel button fires onClose", () => {
    const onClose = jest.fn();
    const r = render(
      createElement(ConfirmDialog, {
        open: true,
        onClose,
        onConfirm: jest.fn(),
        title: "t",
      }),
    );
    const cancel = r.container.querySelector(
      "[data-testid='confirm-dialog-cancel']",
    ) as HTMLButtonElement;
    act(() => {
      cancel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  test("Confirm button fires onConfirm", () => {
    const onConfirm = jest.fn();
    const r = render(
      createElement(ConfirmDialog, {
        open: true,
        onClose: jest.fn(),
        onConfirm,
        title: "t",
      }),
    );
    const confirm = r.container.querySelector(
      "[data-testid='confirm-dialog-confirm']",
    ) as HTMLButtonElement;
    act(() => {
      confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  test("custom confirmLabel/cancelLabel render", () => {
    const r = render(
      createElement(ConfirmDialog, {
        open: true,
        onClose: jest.fn(),
        onConfirm: jest.fn(),
        title: "t",
        confirmLabel: "Delete forever",
        cancelLabel: "Keep it",
      }),
    );
    expect(r.container.textContent).toContain("Delete forever");
    expect(r.container.textContent).toContain("Keep it");
    r.unmount();
  });

  test("async onConfirm shows loading state while pending", async () => {
    let resolveConfirm!: () => void;
    const confirmPromise = new Promise<void>((resolve) => {
      resolveConfirm = resolve;
    });
    const onConfirm = jest.fn().mockReturnValue(confirmPromise);

    const r = render(
      createElement(ConfirmDialog, {
        open: true,
        onClose: jest.fn(),
        onConfirm,
        title: "t",
      }),
    );
    const confirm = r.container.querySelector(
      "[data-testid='confirm-dialog-confirm']",
    ) as HTMLButtonElement;

    await act(async () => {
      confirm.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // Loading: button has data-loading=true.
    const confirmAfter = r.container.querySelector(
      "[data-testid='confirm-dialog-confirm']",
    ) as HTMLButtonElement;
    expect(confirmAfter.getAttribute("data-loading")).toBe("true");

    // Resolve the promise and flush microtasks.
    await act(async () => {
      resolveConfirm();
      await confirmPromise;
    });

    const confirmDone = r.container.querySelector(
      "[data-testid='confirm-dialog-confirm']",
    ) as HTMLButtonElement;
    expect(confirmDone.getAttribute("data-loading")).toBeNull();
    r.unmount();
  });
});
