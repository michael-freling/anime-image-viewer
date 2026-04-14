/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for `SearchBar`.
 *
 * We stub `@chakra-ui/react` + `lucide-react` so Chakra's theme system and
 * Lucide's symbol table don't need to boot.
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
import { SearchBar } from "../../../src/components/shared/search-bar";

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

describe("SearchBar", () => {
  test("renders the value in the input", () => {
    const onChange = jest.fn();
    const r = render(
      createElement(SearchBar, { value: "naruto", onChange }),
    );
    const input = r.container.querySelector("input[role='searchbox']") as
      | HTMLInputElement
      | null;
    expect(input).not.toBeNull();
    expect(input!.value).toBe("naruto");
    r.unmount();
  });

  test("onChange is called when the user types", () => {
    const onChange = jest.fn();
    const r = render(
      createElement(SearchBar, { value: "", onChange }),
    );
    const input = r.container.querySelector("input[role='searchbox']") as
      | HTMLInputElement
      | null;
    // React 18 tracks the input value with a custom setter. We bypass that
    // by calling the original HTMLInputElement prototype setter so React's
    // change tracker picks up the mutation and fires the synthetic onChange.
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    act(() => {
      setter.call(input!, "hello");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("hello");
    r.unmount();
  });

  test("clear button is hidden when value is empty", () => {
    const r = render(
      createElement(SearchBar, { value: "", onChange: jest.fn() }),
    );
    const clear = r.container.querySelector(
      "[aria-label='Clear search']",
    );
    expect(clear).toBeNull();
    r.unmount();
  });

  test("clear button appears when value is non-empty and clears on click", () => {
    const onChange = jest.fn();
    const r = render(
      createElement(SearchBar, { value: "anime", onChange }),
    );
    const clear = r.container.querySelector(
      "[aria-label='Clear search']",
    ) as HTMLButtonElement | null;
    expect(clear).not.toBeNull();
    act(() => {
      clear!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("");
    r.unmount();
  });

  test("Enter key triggers onSubmit with current value", () => {
    const onSubmit = jest.fn();
    const r = render(
      createElement(SearchBar, {
        value: "outdoor",
        onChange: jest.fn(),
        onSubmit,
      }),
    );
    const input = r.container.querySelector("input[role='searchbox']") as
      | HTMLInputElement
      | null;
    act(() => {
      input!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onSubmit).toHaveBeenCalledWith("outdoor");
    r.unmount();
  });

  test("Enter key does nothing when onSubmit is omitted", () => {
    // Just assert no throw.
    const r = render(
      createElement(SearchBar, { value: "x", onChange: jest.fn() }),
    );
    const input = r.container.querySelector("input[role='searchbox']") as
      | HTMLInputElement
      | null;
    act(() => {
      input!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    r.unmount();
  });

  test("non-Enter keys do not trigger onSubmit", () => {
    const onSubmit = jest.fn();
    const r = render(
      createElement(SearchBar, {
        value: "abc",
        onChange: jest.fn(),
        onSubmit,
      }),
    );
    const input = r.container.querySelector("input[role='searchbox']") as
      | HTMLInputElement
      | null;
    act(() => {
      input!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", bubbles: true }),
      );
    });
    expect(onSubmit).not.toHaveBeenCalled();
    r.unmount();
  });

  test("defaults to lg size; md size renders different height", () => {
    const r = render(
      createElement(SearchBar, { value: "", onChange: jest.fn() }),
    );
    expect(
      r.container.querySelector("[data-size='lg']"),
    ).not.toBeNull();
    r.rerender(
      createElement(SearchBar, {
        value: "",
        onChange: jest.fn(),
        size: "md",
      }),
    );
    expect(
      r.container.querySelector("[data-size='md']"),
    ).not.toBeNull();
    r.unmount();
  });
});
