/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Unit tests for the controlled `TagForm` used by the create / edit tag
 * dialogs (ui-design §3.6).
 *
 * The form is pure React state + native select / input elements wrapped in
 * Chakra style props, so we stub Chakra and lucide-react to keep the render
 * synchronous and focus on behaviour.
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

import { TagForm, type TagFormValues } from "../../../src/pages/tags/tag-form";
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

const BASE_VALUES: TagFormValues = {
  name: "",
  category: "uncategorized",
  parentId: null,
};

const PARENT_OPTIONS: Tag[] = [
  { id: 10, name: "Parent A", category: "scene" },
  { id: 11, name: "Parent B", category: "mood" },
];

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("TagForm", () => {
  test("renders all three fields (name, category, parent) and the submit button", () => {
    const r = render(
      createElement(TagForm, {
        values: BASE_VALUES,
        onChange: jest.fn(),
        onCancel: jest.fn(),
        submitLabel: "Create",
      }),
    );
    expect(
      r.container.querySelector("[data-testid='tag-form-name']"),
    ).not.toBeNull();
    expect(
      r.container.querySelector("[data-testid='tag-form-category']"),
    ).not.toBeNull();
    expect(
      r.container.querySelector("[data-testid='tag-form-parent']"),
    ).not.toBeNull();
    expect(
      r.container.querySelector("[data-testid='tag-form-submit']"),
    ).not.toBeNull();
    r.unmount();
  });

  test("typing in name input fires onChange with updated value", () => {
    const onChange = jest.fn();
    const r = render(
      createElement(TagForm, {
        values: BASE_VALUES,
        onChange,
        onCancel: jest.fn(),
        submitLabel: "Create",
      }),
    );
    const input = r.container.querySelector<HTMLInputElement>(
      "[data-testid='tag-form-name']",
    )!;
    setInputValue(input, "Sunset");
    expect(onChange).toHaveBeenLastCalledWith({
      ...BASE_VALUES,
      name: "Sunset",
    });
    r.unmount();
  });

  test("changing category fires onChange with new key", () => {
    const onChange = jest.fn();
    const r = render(
      createElement(TagForm, {
        values: BASE_VALUES,
        onChange,
        onCancel: jest.fn(),
        submitLabel: "Create",
      }),
    );
    const select = r.container.querySelector<HTMLSelectElement>(
      "[data-testid='tag-form-category']",
    )!;
    setSelectValue(select, "nature");
    expect(onChange).toHaveBeenLastCalledWith({
      ...BASE_VALUES,
      category: "nature",
    });
    r.unmount();
  });

  test("parent select lists each parentOption and emits numeric id on change", () => {
    const onChange = jest.fn();
    const r = render(
      createElement(TagForm, {
        values: BASE_VALUES,
        onChange,
        parentOptions: PARENT_OPTIONS,
        onCancel: jest.fn(),
        submitLabel: "Create",
      }),
    );
    const select = r.container.querySelector<HTMLSelectElement>(
      "[data-testid='tag-form-parent']",
    )!;
    // "(none)" + 2 options => 3 total.
    expect(select.querySelectorAll("option").length).toBe(3);
    setSelectValue(select, "11");
    expect(onChange).toHaveBeenLastCalledWith({ ...BASE_VALUES, parentId: 11 });
    r.unmount();
  });

  test("parent select is disabled when no options are provided", () => {
    const r = render(
      createElement(TagForm, {
        values: BASE_VALUES,
        onChange: jest.fn(),
        onCancel: jest.fn(),
        submitLabel: "Create",
      }),
    );
    const select = r.container.querySelector<HTMLSelectElement>(
      "[data-testid='tag-form-parent']",
    )!;
    expect(select.disabled).toBe(true);
    r.unmount();
  });

  test("submit button is disabled while the name is blank", () => {
    const r = render(
      createElement(TagForm, {
        values: BASE_VALUES,
        onChange: jest.fn(),
        onCancel: jest.fn(),
        submitLabel: "Create",
      }),
    );
    const submit = r.container.querySelector<HTMLButtonElement>(
      "[data-testid='tag-form-submit']",
    )!;
    expect(submit.disabled).toBe(true);
    r.unmount();
  });

  test("submit button enables once a non-empty name is provided", () => {
    const r = render(
      createElement(TagForm, {
        values: { ...BASE_VALUES, name: "Rain" },
        onChange: jest.fn(),
        onCancel: jest.fn(),
        submitLabel: "Create",
      }),
    );
    const submit = r.container.querySelector<HTMLButtonElement>(
      "[data-testid='tag-form-submit']",
    )!;
    expect(submit.disabled).toBe(false);
    r.unmount();
  });

  test("clicking submit invokes onSubmit", () => {
    const onSubmit = jest.fn();
    const r = render(
      createElement(TagForm, {
        values: { ...BASE_VALUES, name: "Rain" },
        onChange: jest.fn(),
        onSubmit,
        onCancel: jest.fn(),
        submitLabel: "Create",
      }),
    );
    const submit = r.container.querySelector<HTMLButtonElement>(
      "[data-testid='tag-form-submit']",
    )!;
    act(() => {
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  test("pressing Enter in the name input invokes onSubmit", () => {
    const onSubmit = jest.fn();
    const r = render(
      createElement(TagForm, {
        values: { ...BASE_VALUES, name: "Rain" },
        onChange: jest.fn(),
        onSubmit,
        onCancel: jest.fn(),
        submitLabel: "Create",
      }),
    );
    const input = r.container.querySelector<HTMLInputElement>(
      "[data-testid='tag-form-name']",
    )!;
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  test("clicking cancel invokes onCancel", () => {
    const onCancel = jest.fn();
    const r = render(
      createElement(TagForm, {
        values: BASE_VALUES,
        onChange: jest.fn(),
        onCancel,
        submitLabel: "Create",
      }),
    );
    const cancel = r.container.querySelector<HTMLButtonElement>(
      "[data-testid='tag-form-cancel']",
    )!;
    act(() => {
      cancel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  test("error message renders in a role=alert region when provided", () => {
    const r = render(
      createElement(TagForm, {
        values: BASE_VALUES,
        onChange: jest.fn(),
        onCancel: jest.fn(),
        submitLabel: "Create",
        error: "Oops something broke.",
      }),
    );
    const alert = r.container.querySelector("[role='alert']");
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain("Oops something broke.");
    r.unmount();
  });

  test("submitting=true disables every control", () => {
    const r = render(
      createElement(TagForm, {
        values: { ...BASE_VALUES, name: "Ready" },
        onChange: jest.fn(),
        onCancel: jest.fn(),
        submitLabel: "Create",
        submitting: true,
      }),
    );
    const input = r.container.querySelector<HTMLInputElement>(
      "[data-testid='tag-form-name']",
    )!;
    const category = r.container.querySelector<HTMLSelectElement>(
      "[data-testid='tag-form-category']",
    )!;
    const submit = r.container.querySelector<HTMLButtonElement>(
      "[data-testid='tag-form-submit']",
    )!;
    const cancel = r.container.querySelector<HTMLButtonElement>(
      "[data-testid='tag-form-cancel']",
    )!;
    expect(input.disabled).toBe(true);
    expect(category.disabled).toBe(true);
    expect(submit.disabled).toBe(true);
    expect(cancel.disabled).toBe(true);
    r.unmount();
  });
});
