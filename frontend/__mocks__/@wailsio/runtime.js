/**
 * Auto-mock for @wailsio/runtime.
 *
 * The real module is ESM-only and cannot be parsed by Jest's CJS transform.
 * This manual mock provides stub implementations of the APIs used by the app
 * (Events.On / Events.Off / Events.Emit). Individual tests can override with
 * jest.mock("@wailsio/runtime", ...) when they need finer control.
 */
module.exports = {
  Events: {
    On: jest.fn(() => jest.fn()),
    Off: jest.fn(),
    Emit: jest.fn(),
  },
  Window: {
    SetTitle: jest.fn(),
  },
  Browser: {
    OpenURL: jest.fn(),
  },
};
