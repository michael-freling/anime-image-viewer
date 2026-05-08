/**
 * Tests for `useWailsEvent`.
 *
 * Mocks `@wailsio/runtime`'s Events module and asserts the subscribe/unsubscribe
 * lifecycle plus that the handler receives the event data (not the envelope).
 */
const onMock = jest.fn();
const offMock = jest.fn();
const unsubscribeMock = jest.fn();

jest.mock("@wailsio/runtime", () => ({
  Events: {
    On: (name: string, cb: (...args: unknown[]) => void) => onMock(name, cb),
    Off: (name: string) => offMock(name),
  },
}));

import { useWailsEvent } from "../../src/hooks/use-wails-event";
import { renderHookWithClient } from "../test-utils";

describe("useWailsEvent", () => {
  beforeEach(() => {
    onMock.mockReset();
    offMock.mockReset();
    unsubscribeMock.mockReset();
    // Default: Events.On returns a working unsubscribe closure.
    onMock.mockReturnValue(unsubscribeMock);
  });

  test("subscribes on mount and unsubscribes on unmount", () => {
    const handler = jest.fn();
    const { unmount } = renderHookWithClient(() =>
      useWailsEvent("import:progress", handler),
    );
    expect(onMock).toHaveBeenCalledTimes(1);
    expect(onMock.mock.calls[0][0]).toBe("import:progress");
    expect(unsubscribeMock).not.toHaveBeenCalled();

    unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  test("unwraps WailsEvent envelope and passes data to the handler", () => {
    const handler = jest.fn();
    const { unmount } = renderHookWithClient(() =>
      useWailsEvent<{ count: number }>("import:progress", handler),
    );
    // Grab the wrapped callback Events.On received.
    const wrapped = onMock.mock.calls[0][1] as (
      event: { name: string; data: { count: number } },
    ) => void;

    wrapped({ name: "import:progress", data: { count: 7 } });
    expect(handler).toHaveBeenCalledWith({ count: 7 });
    unmount();
  });

  test("passes raw payload through when it is not wrapped in an envelope", () => {
    const handler = jest.fn();
    const { unmount } = renderHookWithClient(() =>
      useWailsEvent<string>("raw", handler),
    );
    const wrapped = onMock.mock.calls[0][1] as (event: unknown) => void;
    wrapped("just a string");
    expect(handler).toHaveBeenCalledWith("just a string");
    unmount();
  });

  test("falls back to Events.Off when the returned unsubscribe is missing", () => {
    // Arrange: make On return undefined instead of a function.
    onMock.mockReturnValue(undefined);
    const handler = jest.fn();
    const { unmount } = renderHookWithClient(() =>
      useWailsEvent("no-unsub", handler),
    );
    unmount();
    expect(offMock).toHaveBeenCalledWith("no-unsub");
    // Sanity: we never called the mock unsubscribe (there was none).
    expect(unsubscribeMock).not.toHaveBeenCalled();
  });
});
