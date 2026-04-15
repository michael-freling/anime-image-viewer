/**
 * Tests for `CharactersTab`.
 *
 * Spec: ui-design.md §3.2.3 "Characters tab". The backend does not expose a
 * first-class characters endpoint yet, so the component accepts an optional
 * `characters` prop that tests use to verify grid + search behaviour.
 */
import { act } from "react-dom/test-utils";

import { CharactersTab } from "../../../src/pages/anime-detail/characters-tab";
import type { Character } from "../../../src/types";
import { renderWithClient } from "../../test-utils";

function makeCharacter(
  id: number,
  name: string,
  overrides: Partial<Character> = {},
): Character {
  return {
    id,
    name,
    nativeName: name,
    role: "MAIN",
    imageCount: 3,
    ...overrides,
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("CharactersTab", () => {
  test("renders an empty state with Add character action when no characters", () => {
    const { container, unmount } = renderWithClient(<CharactersTab />);
    try {
      expect(
        container.querySelector("[data-testid='characters-tab-add-action']"),
      ).not.toBeNull();
      expect(container.textContent).toContain("No characters linked yet");
    } finally {
      unmount();
    }
  });

  test("renders a grid card per character when characters are provided", () => {
    const { container, unmount } = renderWithClient(
      <CharactersTab
        characters={[
          makeCharacter(1, "Spike Spiegel"),
          makeCharacter(2, "Jet Black"),
          makeCharacter(3, "Faye Valentine"),
        ]}
      />,
    );
    try {
      const cards = container.querySelectorAll(
        "[data-testid='character-card']",
      );
      expect(cards.length).toBe(3);
      // Each card exposes its character id.
      const ids = Array.from(cards).map((c) =>
        c.getAttribute("data-character-id"),
      );
      expect(ids.sort()).toEqual(["1", "2", "3"]);
    } finally {
      unmount();
    }
  });

  test("filters characters client-side when typing into the search bar", () => {
    const { container, unmount } = renderWithClient(
      <CharactersTab
        characters={[
          makeCharacter(1, "Spike Spiegel"),
          makeCharacter(2, "Jet Black"),
          makeCharacter(3, "Faye Valentine"),
        ]}
      />,
    );
    try {
      const input = container.querySelector(
        "input[role='searchbox']",
      ) as HTMLInputElement;
      expect(input).not.toBeNull();
      setInputValue(input, "spike");
      const cards = container.querySelectorAll(
        "[data-testid='character-card']",
      );
      expect(cards.length).toBe(1);
      expect(cards[0].getAttribute("data-character-id")).toBe("1");
    } finally {
      unmount();
    }
  });

  test("shows 'X images' pluralisation on each card", () => {
    const { container, unmount } = renderWithClient(
      <CharactersTab
        characters={[
          makeCharacter(1, "Solo", { imageCount: 1 }),
          makeCharacter(2, "Many", { imageCount: 5 }),
        ]}
      />,
    );
    try {
      const cards = container.querySelectorAll(
        "[data-testid='character-card']",
      );
      expect(cards[0].textContent).toContain("1 image");
      expect(cards[0].textContent).not.toContain("1 images");
      expect(cards[1].textContent).toContain("5 images");
    } finally {
      unmount();
    }
  });
});
