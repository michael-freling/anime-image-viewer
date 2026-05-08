/* eslint-disable @typescript-eslint/no-var-requires */
jest.mock("@chakra-ui/react", () =>
  require("../../components/chakra-stub").chakraStubFactory(),
);

import { createElement } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  RenameDialog,
  type RenameDialogProps,
} from "../../../src/pages/anime-detail/rename-dialog";

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

function makeProps(overrides?: Partial<RenameDialogProps>): RenameDialogProps {
  return {
    open: true,
    onClose: jest.fn(),
    title: "Rename",
    name: "Test",
    onNameChange: jest.fn(),
    onSubmit: jest.fn(),
    submitting: false,
    error: null,
    submitLabel: "Save",
    ...overrides,
  };
}

describe("RenameDialog", () => {
  test("returns null when open is false", () => {
    const props = makeProps({ open: false });
    const r = render(createElement(RenameDialog, props));
    expect(r.container.querySelector("[data-testid='rename-dialog']")).toBeNull();
    r.unmount();
  });

  test("handleOpenChange does not call onClose when submitting", () => {
    const onClose = jest.fn();
    const props = makeProps({ submitting: true, onClose });
    const r = render(createElement(RenameDialog, props));
    // Simulate Escape key which triggers onOpenChange({open: false})
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(onClose).not.toHaveBeenCalled();
    r.unmount();
  });

  test("handleKeyDown does nothing for non-Enter keys", () => {
    const onSubmit = jest.fn();
    const props = makeProps({ onSubmit });
    const r = render(createElement(RenameDialog, props));
    const input = r.container.querySelector(
      "[data-testid='rename-dialog-input']",
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", bubbles: true }),
      );
    });
    expect(onSubmit).not.toHaveBeenCalled();
    r.unmount();
  });

  test("handleKeyDown calls onSubmit for Enter key", () => {
    const onSubmit = jest.fn();
    const props = makeProps({ onSubmit });
    const r = render(createElement(RenameDialog, props));
    const input = r.container.querySelector(
      "[data-testid='rename-dialog-input']",
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  test("handleOpenChange calls onClose when not submitting", () => {
    const onClose = jest.fn();
    const props = makeProps({ submitting: false, onClose });
    const r = render(createElement(RenameDialog, props));
    // Simulate Escape key which triggers onOpenChange({open: false})
    // which then calls handleOpenChange({open: false}) and since submitting=false, onClose is called
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(onClose).toHaveBeenCalled();
    r.unmount();
  });

  test("input onChange calls onNameChange", () => {
    const onNameChange = jest.fn();
    const props = makeProps({ onNameChange });
    const r = render(createElement(RenameDialog, props));
    const input = r.container.querySelector(
      "[data-testid='rename-dialog-input']",
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    // React listens for native input events to trigger onChange
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!;
      nativeInputValueSetter.call(input, "NewName");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onNameChange).toHaveBeenCalledWith("NewName");
    r.unmount();
  });

  test("shows error message when error prop is set", () => {
    const props = makeProps({ error: "Something went wrong" });
    const r = render(createElement(RenameDialog, props));
    expect(
      r.container.querySelector("[data-testid='rename-dialog-error']"),
    ).not.toBeNull();
    expect(r.container.textContent).toContain("Something went wrong");
    r.unmount();
  });

  test("does not show error box when error is null", () => {
    const props = makeProps({ error: null });
    const r = render(createElement(RenameDialog, props));
    expect(
      r.container.querySelector("[data-testid='rename-dialog-error']"),
    ).toBeNull();
    r.unmount();
  });
});
