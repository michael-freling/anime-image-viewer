/**
 * Tests for the command palette.
 *
 * cmdk's `Command.Dialog` conditionally renders via a Radix Portal — inspecting
 * `document.body` gives us the visible markup regardless of where Chakra mounts
 * the overlay. We drive open/close through the ui-store (the palette is
 * controlled) and assert the three groups + item selection behavior.
 */

// --- Mocks ---------------------------------------------------------------

const navigateMock = jest.fn();
jest.mock("react-router", () => {
  const actual = jest.requireActual("react-router");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

const listAnimeMock = jest.fn();
const getAllTagsMock = jest.fn();
jest.mock("../../../src/lib/api", () => ({
  __esModule: true,
  AnimeService: {
    ListAnime: (...args: unknown[]) => listAnimeMock(...args),
  },
  TagService: {
    GetAll: (...args: unknown[]) => getAllTagsMock(...args),
  },
}));

// --- Imports -------------------------------------------------------------

import { act } from "react-dom/test-utils";
import { CommandPalette } from "../../../src/components/ui/command-palette";
import { useUIStore } from "../../../src/stores/ui-store";
import { flushPromises, renderWithClient, waitFor } from "../../test-utils";

function resetUIStore(): void {
  useUIStore.setState({
    commandPaletteOpen: false,
    sidebarExpanded: false,
    theme: "dark",
  });
}

function typeIntoInput(input: HTMLInputElement, value: string): void {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("CommandPalette", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    listAnimeMock.mockReset();
    getAllTagsMock.mockReset();
    resetUIStore();
    window.localStorage.clear();
  });

  test("renders nothing when closed", async () => {
    listAnimeMock.mockResolvedValue([]);
    getAllTagsMock.mockResolvedValue([]);
    const r = renderWithClient(<CommandPalette />);
    await flushPromises();
    // Dialog is closed → no command menu in the DOM.
    expect(document.querySelector("[cmdk-root]")).toBeNull();
    r.unmount();
  });

  test("opens when ui-store.commandPaletteOpen flips to true", async () => {
    listAnimeMock.mockResolvedValue([
      { id: 1, name: "Bebop", imageCount: 1 },
    ]);
    getAllTagsMock.mockResolvedValue([]);
    const r = renderWithClient(<CommandPalette />);
    act(() => {
      useUIStore.setState({ commandPaletteOpen: true });
    });
    await waitFor(() => document.querySelector("[cmdk-root]") !== null);
    expect(document.querySelector("[cmdk-input]")).not.toBeNull();
    r.unmount();
  });

  test("Ctrl+K toggles the palette via useHotkeys", async () => {
    listAnimeMock.mockResolvedValue([]);
    getAllTagsMock.mockResolvedValue([]);
    const r = renderWithClient(<CommandPalette />);
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    // `useHotkeys` attaches its listener to document.documentElement (not
    // document), and ignores events whose target is INPUT/TEXTAREA/SELECT.
    // We dispatch on documentElement so the listener receives the event.
    act(() => {
      document.documentElement.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "k",
          code: "KeyK",
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });
    expect(useUIStore.getState().commandPaletteOpen).toBe(true);
    r.unmount();
  });

  test("renders Anime, Tags, and Actions groups", async () => {
    listAnimeMock.mockResolvedValue([
      { id: 1, name: "Naruto", imageCount: 12 },
      { id: 2, name: "Bleach", imageCount: 9 },
    ]);
    getAllTagsMock.mockResolvedValue([
      { id: 10, name: "Sunset", category: "scene" },
    ]);
    const r = renderWithClient(<CommandPalette />);
    act(() => {
      useUIStore.setState({ commandPaletteOpen: true });
    });
    await waitFor(() => document.querySelector("[cmdk-root]") !== null);
    await waitFor(
      () => document.querySelectorAll("[cmdk-item]").length >= 3,
    );
    const headings = Array.from(
      document.querySelectorAll("[cmdk-group-heading]"),
    ).map((el) => el.textContent);
    expect(headings).toEqual(expect.arrayContaining(["Anime", "Tags", "Actions"]));
    r.unmount();
  });

  test("selecting an anime navigates to /anime/:id and closes", async () => {
    listAnimeMock.mockResolvedValue([
      { id: 42, name: "Trigun", imageCount: 0 },
    ]);
    getAllTagsMock.mockResolvedValue([]);
    const r = renderWithClient(<CommandPalette />);
    act(() => {
      useUIStore.setState({ commandPaletteOpen: true });
    });
    await waitFor(() => document.querySelector("[cmdk-root]") !== null);
    await waitFor(
      () =>
        Array.from(document.querySelectorAll("[cmdk-item]")).some((el) =>
          el.textContent?.includes("Trigun"),
        ),
    );

    const animeItem = Array.from(
      document.querySelectorAll("[cmdk-item]"),
    ).find((el) => el.textContent?.includes("Trigun")) as HTMLElement;
    act(() => {
      animeItem.click();
    });
    expect(navigateMock).toHaveBeenCalledWith("/anime/42");
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    r.unmount();
  });

  test("selecting a tag navigates to /tags?filter=:id", async () => {
    listAnimeMock.mockResolvedValue([]);
    getAllTagsMock.mockResolvedValue([
      { id: 99, name: "Forest", category: "nature" },
    ]);
    const r = renderWithClient(<CommandPalette />);
    act(() => {
      useUIStore.setState({ commandPaletteOpen: true });
    });
    await waitFor(() => document.querySelector("[cmdk-root]") !== null);
    await waitFor(
      () =>
        Array.from(document.querySelectorAll("[cmdk-item]")).some((el) =>
          el.textContent?.includes("Forest"),
        ),
    );
    const tagItem = Array.from(
      document.querySelectorAll("[cmdk-item]"),
    ).find((el) => el.textContent?.includes("Forest")) as HTMLElement;
    act(() => {
      tagItem.click();
    });
    expect(navigateMock).toHaveBeenCalledWith("/tags?filter=99");
    r.unmount();
  });

  test("filtering narrows results", async () => {
    listAnimeMock.mockResolvedValue([
      { id: 1, name: "Naruto", imageCount: 0 },
      { id: 2, name: "Bleach", imageCount: 0 },
    ]);
    getAllTagsMock.mockResolvedValue([]);
    const r = renderWithClient(<CommandPalette />);
    act(() => {
      useUIStore.setState({ commandPaletteOpen: true });
    });
    await waitFor(() => document.querySelector("[cmdk-input]") !== null);
    await waitFor(
      () => document.querySelectorAll("[cmdk-item]").length >= 2,
    );
    const input = document.querySelector("[cmdk-input]") as HTMLInputElement;
    typeIntoInput(input, "nar");
    // cmdk schedules its filter pass via a setState effect; wait for the
    // non-matching item to drop out of the DOM rather than a single flush.
    await waitFor(
      () =>
        !Array.from(document.querySelectorAll("[cmdk-item]")).some((el) =>
          el.textContent?.includes("Bleach"),
        ),
    );
    const itemsAfter = Array.from(document.querySelectorAll("[cmdk-item]"));
    expect(
      itemsAfter.some((el) => el.textContent?.includes("Naruto")),
    ).toBe(true);
    expect(
      itemsAfter.some((el) => el.textContent?.includes("Bleach")),
    ).toBe(false);
    r.unmount();
  });

  test("renders default actions when the actions prop is omitted", async () => {
    listAnimeMock.mockResolvedValue([]);
    getAllTagsMock.mockResolvedValue([]);
    const r = renderWithClient(<CommandPalette />);
    act(() => {
      useUIStore.setState({ commandPaletteOpen: true });
    });
    await waitFor(() => document.querySelector("[cmdk-root]") !== null);
    await waitFor(
      () => document.querySelectorAll("[cmdk-item]").length >= 4,
    );
    const labels = Array.from(
      document.querySelectorAll("[cmdk-item]"),
    ).map((el) => el.textContent?.trim());
    // The four default actions all surface their labels.
    expect(labels).toEqual(
      expect.arrayContaining([
        "Create anime",
        "Import folders",
        "Open settings",
      ]),
    );
    // Theme toggle label flips per current theme; default ui-store theme is "dark".
    expect(labels.some((l) => l?.includes("Switch to light theme"))).toBe(true);
    r.unmount();
  });

  test("default theme toggle label flips when current theme is light", async () => {
    listAnimeMock.mockResolvedValue([]);
    getAllTagsMock.mockResolvedValue([]);
    act(() => {
      useUIStore.setState({ theme: "light" });
    });
    const r = renderWithClient(<CommandPalette />);
    act(() => {
      useUIStore.setState({ commandPaletteOpen: true });
    });
    await waitFor(() => document.querySelector("[cmdk-root]") !== null);
    await waitFor(
      () => document.querySelectorAll("[cmdk-item]").length >= 4,
    );
    const labels = Array.from(
      document.querySelectorAll("[cmdk-item]"),
    ).map((el) => el.textContent?.trim());
    expect(labels.some((l) => l?.includes("Switch to dark theme"))).toBe(true);
    r.unmount();
  });

  test("selecting a default Action invokes its onSelect and closes the palette", async () => {
    listAnimeMock.mockResolvedValue([]);
    getAllTagsMock.mockResolvedValue([]);
    const r = renderWithClient(<CommandPalette />);
    act(() => {
      useUIStore.setState({ commandPaletteOpen: true });
    });
    await waitFor(() => document.querySelector("[cmdk-root]") !== null);
    await waitFor(
      () => document.querySelectorAll("[cmdk-item]").length >= 4,
    );
    // Click "Open settings" → navigate("/settings") + palette closes.
    const settingsItem = Array.from(
      document.querySelectorAll("[cmdk-item]"),
    ).find((el) => el.textContent?.includes("Open settings")) as HTMLElement;
    act(() => {
      settingsItem.click();
    });
    expect(navigateMock).toHaveBeenCalledWith("/settings");
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    r.unmount();
  });

  test("custom actions prop overrides the defaults", async () => {
    listAnimeMock.mockResolvedValue([]);
    getAllTagsMock.mockResolvedValue([]);
    const customSelect = jest.fn();
    const r = renderWithClient(
      <CommandPalette
        actions={[
          {
            id: "custom-action",
            label: "Do something custom",
            onSelect: customSelect,
          },
        ]}
      />,
    );
    act(() => {
      useUIStore.setState({ commandPaletteOpen: true });
    });
    await waitFor(() => document.querySelector("[cmdk-root]") !== null);
    await waitFor(
      () =>
        Array.from(document.querySelectorAll("[cmdk-item]")).some((el) =>
          el.textContent?.includes("Do something custom"),
        ),
    );
    // Default actions are NOT rendered.
    const labels = Array.from(
      document.querySelectorAll("[cmdk-item]"),
    ).map((el) => el.textContent?.trim());
    expect(labels.some((l) => l?.includes("Open settings"))).toBe(false);
    // Click the custom action.
    const item = Array.from(
      document.querySelectorAll("[cmdk-item]"),
    ).find((el) => el.textContent?.includes("Do something custom")) as HTMLElement;
    act(() => {
      item.click();
    });
    expect(customSelect).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    r.unmount();
  });

  test("selecting 'Create anime' navigates to /?create=1 and closes the palette", async () => {
    // Drives the `navigate("/?create=1")` onSelect callback inside
    // defaultActions (otherwise uncovered branch).
    listAnimeMock.mockResolvedValue([]);
    getAllTagsMock.mockResolvedValue([]);
    const r = renderWithClient(<CommandPalette />);
    act(() => {
      useUIStore.setState({ commandPaletteOpen: true });
    });
    await waitFor(() => document.querySelector("[cmdk-root]") !== null);
    await waitFor(
      () => document.querySelectorAll("[cmdk-item]").length >= 4,
    );
    const item = Array.from(
      document.querySelectorAll("[cmdk-item]"),
    ).find((el) => el.textContent?.includes("Create anime")) as HTMLElement;
    act(() => {
      item.click();
    });
    expect(navigateMock).toHaveBeenCalledWith("/?create=1");
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    r.unmount();
  });

  test("selecting 'Import folders' navigates to /?import=1 and closes the palette", async () => {
    // Drives the `navigate("/?import=1")` onSelect callback inside
    // defaultActions (otherwise uncovered branch).
    listAnimeMock.mockResolvedValue([]);
    getAllTagsMock.mockResolvedValue([]);
    const r = renderWithClient(<CommandPalette />);
    act(() => {
      useUIStore.setState({ commandPaletteOpen: true });
    });
    await waitFor(() => document.querySelector("[cmdk-root]") !== null);
    await waitFor(
      () => document.querySelectorAll("[cmdk-item]").length >= 4,
    );
    const item = Array.from(
      document.querySelectorAll("[cmdk-item]"),
    ).find((el) => el.textContent?.includes("Import folders")) as HTMLElement;
    act(() => {
      item.click();
    });
    expect(navigateMock).toHaveBeenCalledWith("/?import=1");
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    r.unmount();
  });

  test("selecting the theme toggle action flips the ui-store theme to light", async () => {
    // Drives the `setTheme(currentTheme === 'dark' ? 'light' : 'dark')`
    // onSelect callback. Default theme is "dark" → expect "light" after click.
    listAnimeMock.mockResolvedValue([]);
    getAllTagsMock.mockResolvedValue([]);
    const r = renderWithClient(<CommandPalette />);
    act(() => {
      useUIStore.setState({ commandPaletteOpen: true });
    });
    await waitFor(() => document.querySelector("[cmdk-root]") !== null);
    await waitFor(
      () => document.querySelectorAll("[cmdk-item]").length >= 4,
    );
    const item = Array.from(
      document.querySelectorAll("[cmdk-item]"),
    ).find((el) =>
      el.textContent?.includes("Switch to light theme"),
    ) as HTMLElement;
    act(() => {
      item.click();
    });
    expect(useUIStore.getState().theme).toBe("light");
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    r.unmount();
  });

  test("selecting the theme toggle action flips the ui-store theme to dark when current is light", async () => {
    // Drives the inverse branch of the theme toggle (light → dark).
    listAnimeMock.mockResolvedValue([]);
    getAllTagsMock.mockResolvedValue([]);
    act(() => {
      useUIStore.setState({ theme: "light" });
    });
    const r = renderWithClient(<CommandPalette />);
    act(() => {
      useUIStore.setState({ commandPaletteOpen: true });
    });
    await waitFor(() => document.querySelector("[cmdk-root]") !== null);
    await waitFor(
      () => document.querySelectorAll("[cmdk-item]").length >= 4,
    );
    const item = Array.from(
      document.querySelectorAll("[cmdk-item]"),
    ).find((el) =>
      el.textContent?.includes("Switch to dark theme"),
    ) as HTMLElement;
    act(() => {
      item.click();
    });
    expect(useUIStore.getState().theme).toBe("dark");
    r.unmount();
  });

  test("Esc / overlay close (open=false branch) clears the search input", async () => {
    listAnimeMock.mockResolvedValue([]);
    getAllTagsMock.mockResolvedValue([]);
    const r = renderWithClient(<CommandPalette />);
    act(() => {
      useUIStore.setState({ commandPaletteOpen: true });
    });
    await waitFor(() => document.querySelector("[cmdk-input]") !== null);
    const input = document.querySelector("[cmdk-input]") as HTMLInputElement;
    typeIntoInput(input, "naru");
    // Drive Esc on the input — cmdk maps it to onOpenChange(false).
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    // Wait for the dialog to unmount.
    await waitFor(() => document.querySelector("[cmdk-input]") === null);
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    r.unmount();
  });
});
