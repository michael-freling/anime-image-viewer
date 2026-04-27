/**
 * `useWailsEvent` — thin wrapper around `Events.On` from `@wailsio/runtime`.
 *
 * Wails emits custom events with a `WailsEvent` envelope `{ name, data }`. The
 * callback we register receives that envelope; this hook unwraps `.data` and
 * forwards it to the user's `handler` so consumers can type the payload
 * directly (no `(event: any) => event.data` boilerplate in every page).
 *
 * The subscription is established on mount, torn down on unmount, and re-run
 * when `deps` change — mirroring `useEffect`. If `Events.On` returns an
 * unsubscribe function (which it does as of runtime v3) we invoke it on
 * cleanup; otherwise we fall back to `Events.Off(eventName)`.
 */
import { DependencyList, useEffect } from "react";
import { Events } from "@wailsio/runtime";

interface WailsEnvelope<T> {
  name: string;
  data: T;
}

type Unsubscribe = (() => void) | void;

export function useWailsEvent<T>(
  eventName: string,
  handler: (data: T) => void,
  deps: DependencyList = [],
): void {
  useEffect(() => {
    const wrapped = (event: WailsEnvelope<T> | T) => {
      // `Events.On` callbacks receive a `WailsEvent` envelope with `.data`.
      // Some runtimes deliver the raw payload directly, so we coerce.
      if (
        event != null &&
        typeof event === "object" &&
        "data" in (event as WailsEnvelope<T>)
      ) {
        handler((event as WailsEnvelope<T>).data);
      } else {
        handler(event as T);
      }
    };
    const off = Events.On(eventName, wrapped) as Unsubscribe;
    return () => {
      if (typeof off === "function") {
        off();
        return;
      }
      Events.Off(eventName);
    };
    // Dependency list is intentionally spread from the caller — handler is not
    // included by default because callers usually pass inline functions.
  }, [eventName, ...deps]);
}
