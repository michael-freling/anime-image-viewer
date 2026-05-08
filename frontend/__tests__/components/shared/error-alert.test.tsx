/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for `ErrorAlert`.
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
import { ErrorAlert } from "../../../src/components/shared/error-alert";

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

describe("ErrorAlert", () => {
  test("renders the message", () => {
    const r = render(
      createElement(ErrorAlert, { message: "Backend on fire" }),
    );
    expect(r.container.textContent).toContain("Backend on fire");
    r.unmount();
  });

  test("default title is 'Something went wrong'", () => {
    const r = render(
      createElement(ErrorAlert, { message: "x" }),
    );
    expect(r.container.textContent).toContain("Something went wrong");
    r.unmount();
  });

  test("custom title overrides the default", () => {
    const r = render(
      createElement(ErrorAlert, {
        message: "x",
        title: "Import failed",
      }),
    );
    expect(r.container.textContent).toContain("Import failed");
    expect(r.container.textContent).not.toContain("Something went wrong");
    r.unmount();
  });

  test("retry button absent when onRetry omitted", () => {
    const r = render(
      createElement(ErrorAlert, { message: "x" }),
    );
    expect(r.container.textContent).not.toContain("Retry");
    r.unmount();
  });

  test("retry button present and fires onRetry when provided", () => {
    const onRetry = jest.fn();
    const r = render(
      createElement(ErrorAlert, { message: "x", onRetry }),
    );
    const btn = Array.from(r.container.querySelectorAll("button")).find(
      (b) => b.textContent?.includes("Retry"),
    ) as HTMLButtonElement | undefined;
    expect(btn).toBeDefined();
    act(() => {
      btn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  test("role=alert for accessibility", () => {
    const r = render(
      createElement(ErrorAlert, { message: "x" }),
    );
    expect(r.container.querySelector("[role='alert']")).not.toBeNull();
    r.unmount();
  });
});
