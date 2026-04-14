/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Tests for the toaster helpers.
 *
 * The singleton `toaster` is mocked via `createToaster` in the Chakra stub,
 * so `toaster.create` is a `jest.fn()`. We verify each helper (`toast.success`,
 * `toast.error`, `toast.info`, `toast.warning`, `toast.dismiss`) delegates
 * correctly, including the default durations from ui-design.md §7.
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
import { DURATIONS, toast, toaster, Toaster } from "../../../src/components/ui/toaster";

describe("toaster helpers", () => {
  beforeEach(() => {
    (toaster.create as jest.Mock).mockClear();
    (toaster.dismiss as jest.Mock).mockClear();
  });

  test("toast.success uses type='success' and 4000ms default", () => {
    toast.success("Hello", "World");
    expect(toaster.create).toHaveBeenCalledTimes(1);
    const call = (toaster.create as jest.Mock).mock.calls[0][0];
    expect(call.type).toBe("success");
    expect(call.title).toBe("Hello");
    expect(call.description).toBe("World");
    expect(call.duration).toBe(DURATIONS.success);
    expect(DURATIONS.success).toBe(4000);
  });

  test("toast.error uses type='error' and 8000ms default", () => {
    toast.error("Oops");
    const call = (toaster.create as jest.Mock).mock.calls[0][0];
    expect(call.type).toBe("error");
    expect(call.duration).toBe(DURATIONS.error);
    expect(DURATIONS.error).toBe(8000);
  });

  test("toast.info uses type='info' and 4000ms default", () => {
    toast.info("Heads up");
    const call = (toaster.create as jest.Mock).mock.calls[0][0];
    expect(call.type).toBe("info");
    expect(call.duration).toBe(DURATIONS.info);
    expect(DURATIONS.info).toBe(4000);
  });

  test("toast.warning uses type='warning' and 6000ms default", () => {
    toast.warning("Careful");
    const call = (toaster.create as jest.Mock).mock.calls[0][0];
    expect(call.type).toBe("warning");
    expect(call.duration).toBe(DURATIONS.warning);
    expect(DURATIONS.warning).toBe(6000);
  });

  test("custom duration overrides the default", () => {
    toast.success("t", undefined, { duration: 123 });
    const call = (toaster.create as jest.Mock).mock.calls[0][0];
    expect(call.duration).toBe(123);
  });

  test("custom id is passed through", () => {
    toast.info("t", undefined, { id: "my-id" });
    const call = (toaster.create as jest.Mock).mock.calls[0][0];
    expect(call.id).toBe("my-id");
  });

  test("toast.dismiss delegates to toaster.dismiss", () => {
    toast.dismiss("abc");
    expect(toaster.dismiss).toHaveBeenCalledWith("abc");
  });

  test("toast.dismiss without id dismisses all", () => {
    toast.dismiss();
    expect(toaster.dismiss).toHaveBeenCalledTimes(1);
    expect((toaster.dismiss as jest.Mock).mock.calls[0][0]).toBeUndefined();
  });

  test("<Toaster /> renders without crashing", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root!: Root;
    act(() => {
      root = createRoot(container);
      root.render(createElement(Toaster));
    });
    // The stubbed Toaster is a <div>, so the component should at least be
    // present in the tree (or no-op if the portal children render nothing).
    expect(container).toBeDefined();
    act(() => {
      root.unmount();
    });
    container.parentNode?.removeChild(container);
  });
});
