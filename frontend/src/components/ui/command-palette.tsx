/**
 * Command palette (Ctrl+K) per ui-design.md §4.5.
 *
 * Renders a `cmdk` `Command.Dialog` anchored in the centre of the viewport.
 * Three groups: **Anime** (from `useAnimeList`), **Tags** (from `useTags`),
 * and **Actions** (static list of shortcut commands).  Arrow keys navigate;
 * Enter selects; Esc closes.
 *
 * Open state is controlled by the `ui-store`, so any component can open the
 * palette via `useUIStore.setState({ commandPaletteOpen: true })`. Ctrl+K /
 * Cmd+K toggles globally via `@mantine/hooks`' `useHotkeys`.
 */
import { Command } from "cmdk";
import { Search } from "lucide-react";
import { useHotkeys } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useAnimeList } from "../../hooks/use-anime-list";
import { useTags } from "../../hooks/use-tags";
import { useUIStore } from "../../stores/ui-store";

export interface CommandPaletteAction {
  id: string;
  label: string;
  keywords?: string[];
  onSelect: () => void;
}

export interface CommandPaletteProps {
  /**
   * Action commands shown at the bottom. Defaults to a canonical "create /
   * import / settings" set; pages can override by passing their own list
   * (e.g. the anime detail page can add "Add entry").
   */
  actions?: CommandPaletteAction[];
}

function defaultActions(
  navigate: (to: string) => void,
  setTheme: (theme: "light" | "dark" | "system") => void,
  currentTheme: "light" | "dark" | "system",
): CommandPaletteAction[] {
  return [
    {
      id: "action:create-anime",
      label: "Create anime",
      keywords: ["new", "add"],
      onSelect: () => navigate("/?create=1"),
    },
    {
      id: "action:import-folders",
      label: "Import folders",
      keywords: ["upload", "scan"],
      onSelect: () => navigate("/?import=1"),
    },
    {
      id: "action:settings",
      label: "Open settings",
      keywords: ["preferences", "config"],
      onSelect: () => navigate("/settings"),
    },
    {
      id: "action:toggle-theme",
      label: currentTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      keywords: ["theme", "color", "mode"],
      onSelect: () => setTheme(currentTheme === "dark" ? "light" : "dark"),
    },
  ];
}

export function CommandPalette({
  actions,
}: CommandPaletteProps = {}): JSX.Element {
  const navigate = useNavigate();
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const toggle = useUIStore((s) => s.toggleCommandPalette);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const [search, setSearch] = useState("");

  const animeQuery = useAnimeList();
  const tagsQuery = useTags();

  // Bind Ctrl+K / Cmd+K at the document level. `useHotkeys` normalises both
  // platforms for us ("mod+k"). Esc is handled by cmdk internally via the
  // Dialog's onOpenChange.
  useHotkeys([["mod+K", () => toggle()]]);

  const resolvedActions = useMemo(() => {
    if (actions && actions.length > 0) return actions;
    return defaultActions(navigate, setTheme, theme);
  }, [actions, navigate, setTheme, theme]);

  const handleClose = () => {
    setOpen(false);
    setSearch("");
  };

  const handleSelect = (fn: () => void) => {
    fn();
    handleClose();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
        else setOpen(true);
      }}
      label="Command palette"
      contentClassName="command-palette-content"
      overlayClassName="command-palette-overlay"
    >
      <div
        className="command-palette"
        style={{
          width: "100%",
          maxWidth: 640,
          margin: "10vh auto 0",
          background: "var(--chakra-colors-bg-surface, #1e1e2e)",
          border: "1px solid var(--chakra-colors-border, #2d2d3f)",
          borderRadius: 12,
          boxShadow:
            "0 24px 60px rgba(0,0,0,0.45), 0 4px 12px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 16px",
            borderBottom:
              "1px solid var(--chakra-colors-border, #2d2d3f)",
          }}
        >
          <Search size={18} aria-hidden="true" />
          <Command.Input
            autoFocus
            value={search}
            onValueChange={setSearch}
            placeholder="Search anime, tags, or commands..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "inherit",
              fontSize: 16,
            }}
          />
        </div>
        <Command.List style={{ maxHeight: 360, overflow: "auto", padding: 8 }}>
          <Command.Empty
            style={{ padding: "12px 16px", opacity: 0.6 }}
          >
            No results found.
          </Command.Empty>

          {animeQuery.data && animeQuery.data.length > 0 && (
            <Command.Group heading="Anime">
              {animeQuery.data.map((anime) => (
                <Command.Item
                  key={`anime:${anime.id}`}
                  value={`anime:${anime.id}:${anime.name}`}
                  keywords={[anime.name]}
                  onSelect={() =>
                    handleSelect(() => navigate(`/anime/${anime.id}`))
                  }
                >
                  {anime.name}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {tagsQuery.data && tagsQuery.data.length > 0 && (
            <Command.Group heading="Tags">
              {tagsQuery.data.map((tag) => (
                <Command.Item
                  key={`tag:${tag.id}`}
                  value={`tag:${tag.id}:${tag.name}`}
                  keywords={[tag.name, tag.category]}
                  onSelect={() =>
                    handleSelect(() => navigate(`/tags?filter=${tag.id}`))
                  }
                >
                  {tag.name}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Actions">
            {resolvedActions.map((action) => (
              <Command.Item
                key={action.id}
                value={`action:${action.id}:${action.label}`}
                keywords={action.keywords}
                onSelect={() => handleSelect(action.onSelect)}
              >
                {action.label}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}

export default CommandPalette;
