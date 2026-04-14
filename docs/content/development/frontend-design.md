---
title: "Frontend Design"
weight: 2
---

# Frontend Implementation Design: UX Redesign v2

## 1. Design Overview

### New Tech Stack

| Layer | Current | New | Rationale |
|-------|---------|-----|-----------|
| UI primitives | MUI Joy UI + MUI Material | Radix UI primitives | Unstyled, composable, accessible by default. Eliminates the MUI Joy/Material dual-theme complexity visible in `main.tsx`. |
| Styling | Emotion CSS-in-JS (via MUI `sx` prop) | Tailwind CSS v4 | Utility-first, co-located styles, smaller bundle. Dark/light mode via CSS custom properties and `class` strategy. Eliminates runtime style injection. |
| Component patterns | shadcn/ui style | shadcn/ui (copy-paste primitives wrapping Radix) | Own the code. Each primitive lives in `src/components/ui/` and can be modified directly. No external component library dependency. |
| Icons | `@mui/icons-material` (400+ icon package) | `lucide-react` | Tree-shakeable, consistent stroke style, 1KB per icon vs MUI's larger bundle. |
| Masonry grid | `react-window` (FixedSizeGrid) | `@tanstack/react-virtual` + CSS columns masonry | True masonry layout with variable-height items. `@tanstack/react-virtual` handles virtualization for large image sets. |
| Image viewer | `react-zoom-pan-pinch` | `react-zoom-pan-pinch` (keep) | Already works well in `ImageWindow.tsx`. |
| State management | `useState` + 2 React Contexts | Zustand (lightweight stores) | Eliminates prop drilling visible in `AnimeDetailPage.tsx` (30+ `useState` calls). Small API, no boilerplate, supports selectors for re-render optimization. |
| Data fetching | Manual `useEffect` + `useState` | `@tanstack/react-query` v5 | Automatic cache, deduplication, background refetch, loading/error states. Replaces the repetitive `load` / `refresh` / `setLoading` / `setError` pattern used across every page. |
| Routing | `react-router` v7 (`createBrowserRouter`) | `react-router` v7 (keep) | Already using `createBrowserRouter`. Restructure route tree for new page hierarchy. |
| Runtime bridge | `@wailsio/runtime` | `@wailsio/runtime` (keep) | Required for Wails v3. Events.On/Off pattern preserved. |
| Font | `@fontsource/inter` | `@fontsource-variable/inter` | Variable font, single file, smaller than multiple weight files. |

### Migration Strategy: Big-Bang Rebuild

A big-bang rebuild is recommended over incremental migration for these reasons:

1. **Every component changes.** Replacing MUI Joy with Radix+Tailwind means every component's JSX and styling is rewritten. There is no stable seam where old and new can coexist.
2. **Layout fundamentally changes.** The current `TwoColumnLayout` / `ThreeColumnLayout` grid system is replaced by an icon-rail + full-width content pattern. The routing structure changes (anime detail tabs become nested routes).
3. **State management changes.** Moving from 30+ `useState` calls per page to Zustand stores is not something you can do incrementally per-component.
4. **Small codebase.** The existing frontend is ~35 files, ~4500 LOC. A rebuild is feasible in phases.

The rebuild reuses no existing component code but preserves these patterns:
- Wails binding import paths (`../../../bindings/github.com/michael-freling/...`)
- Wails event subscription pattern (`Events.On` / `Events.Off`)
- Debounced search with `setTimeout` / `clearTimeout`
- URL search params for filter persistence
- Shift+click range selection logic (extracted to a hook)


---

## 2. Directory Structure

```
frontend/src/
  app/
    routes.tsx                    # Route definitions (createBrowserRouter)
    providers.tsx                 # App-level providers (QueryClient, Zustand, Theme)
    layout.tsx                    # Root layout with AppShell

  components/
    ui/                           # shadcn/ui-style primitives (own the code)
      button.tsx
      dialog.tsx
      dropdown-menu.tsx
      input.tsx
      checkbox.tsx
      toggle-group.tsx
      tabs.tsx
      tooltip.tsx
      progress.tsx
      alert.tsx
      badge.tsx
      separator.tsx
      scroll-area.tsx
      select.tsx
      switch.tsx
      slider.tsx
      radio-group.tsx
      command.tsx                  # Ctrl+K command palette (cmdk)
      collapsible.tsx
      skeleton.tsx
      toast.tsx                   # Sonner toast wrapper

    layout/
      app-shell.tsx               # Grid wrapper: icon-rail + content area
      icon-rail.tsx               # 64px collapsed, 180px on hover
      bottom-tab-bar.tsx          # Mobile 4-tab bar
      page-header.tsx             # Sticky header per page (title + actions)

    shared/
      anime-card.tsx              # Netflix-style cover card
      image-thumbnail.tsx         # Single image with lazy load + selection state
      masonry-grid.tsx            # Virtualized masonry layout
      tag-chip.tsx                # Colored tag pill
      category-section.tsx        # Collapsible tag category group
      search-bar.tsx              # Large search input with suggestions
      filter-chip.tsx             # Inline filter pill (removable)
      entry-tab.tsx               # Horizontal entry filter tab
      empty-state.tsx             # Centered illustration + message
      loading-skeleton.tsx        # Skeleton placeholders per component shape
      confirm-dialog.tsx          # Reusable confirmation dialog
      error-alert.tsx             # Inline error display
      import-progress-bar.tsx     # Bottom progress for image imports

    selection/
      selection-provider.tsx      # Context for selection state
      rubber-band-overlay.tsx     # Canvas-based drag-select rectangle
      selection-action-bar.tsx    # Floating bar with count + bulk actions

    image-viewer/
      image-viewer-overlay.tsx    # Full-screen dark overlay
      image-viewer-controls.tsx   # Navigation arrows, close button

  pages/
    home/
      home-page.tsx               # Anime card grid + "New Anime" card
      create-anime-dialog.tsx     # Create dialog with AniList search

    anime-detail/
      anime-detail-page.tsx       # Shell with tabs
      tabs/
        images-tab.tsx            # Entry sub-tabs + tag filter + masonry grid
        entries-tab.tsx           # Entry table with inline edit
        characters-tab.tsx        # Character card grid
        tags-tab.tsx              # Chip toggles by category
        info-tab.tsx              # Centered edit form + danger zone

    search/
      search-page.tsx             # Search bar + filter chips + masonry results

    tags/
      tag-management-page.tsx     # Categories with tag rows

    image-tag-editor/
      image-tag-editor-page.tsx   # Selected images strip + tri-state checkboxes

    settings/
      settings-page.tsx           # Horizontal section tabs
      sections/
        general-section.tsx
        appearance-section.tsx
        backup-section.tsx
        about-section.tsx

  hooks/
    use-anime-list.ts             # React Query: list all anime
    use-anime-detail.ts           # React Query: anime details + entries
    use-anime-images.ts           # React Query: images for an anime/entry
    use-search-images.ts          # React Query: search with filters
    use-tags.ts                   # React Query: all tags, tag map
    use-tag-stats.ts              # React Query: tag stats for file IDs
    use-image-selection.ts        # Selection state (click, shift-click, ctrl-click)
    use-rubber-band.ts            # Rubber band drag-select geometry
    use-debounce.ts               # Debounced value
    use-anilist-search.ts         # Debounced AniList search
    use-keyboard-shortcut.ts      # Global keyboard shortcut registration
    use-wails-event.ts            # Subscribe/unsubscribe to Wails events
    use-image-prefetch.ts         # Prefetch next/prev images in viewer
    use-masonry-layout.ts         # Calculate column positions for masonry
    use-config.ts                 # React Query: app config

  stores/
    selection-store.ts            # Zustand: selected image IDs, select mode
    ui-store.ts                   # Zustand: sidebar state, theme, command palette open
    import-progress-store.ts      # Zustand: import progress (replaces ImportImageContext)

  lib/
    api.ts                        # Re-export Wails bindings with typed wrappers
    query-keys.ts                 # React Query key factory
    cn.ts                         # clsx + tailwind-merge utility
    format.ts                     # Date, season, count formatters
    constants.ts                  # Color maps, entry type configs

  types/
    index.ts                      # Shared TypeScript interfaces (app-level)

  styles/
    globals.css                   # Tailwind directives, CSS custom properties, font-face
```


---

## 3. Design System / Theme

### Tailwind Configuration

The Tailwind config extends the default theme with the design tokens from the UX design document. Dark mode uses the `class` strategy so the theme toggle can work without OS preference changes.

```
// tailwind.config.ts structure (not implementation code)

theme.extend.colors:
  background:     CSS var(--background)     // #0f0f14 dark, #fafafa light
  surface:        CSS var(--surface)        // #1e1e2e dark, #ffffff light
  surface-alt:    CSS var(--surface-alt)    // #16161e dark, #f8fafc light
  primary:        CSS var(--primary)        // #818cf8 dark, #6366f1 light
  primary-hover:  CSS var(--primary-hover)  // #6366f1 dark, #4f46e5 light
  primary-subtle: CSS var(--primary-subtle) // #312e81 dark, #eef2ff light
  border:         CSS var(--border)         // #2d2d3f dark, #e5e7eb light
  text-primary:   CSS var(--text)           // #f1f5f9 dark, #111827 light
  text-secondary: CSS var(--text-secondary) // #94a3b8 dark, #6b7280 light
  text-muted:     CSS var(--text-muted)     // #64748b dark, #9ca3af light
  danger:         CSS var(--danger)         // #fca5a5
  danger-bg:      CSS var(--danger-bg)      // #3b1a1a
  success:        CSS var(--success)        // #6ee7b7
  success-bg:     CSS var(--success-bg)     // #1a3a2e

theme.extend.fontFamily:
  sans: ['Inter Variable', ...defaultTheme.fontFamily.sans]

theme.extend.spacing:
  Uses default Tailwind 4px scale (already matches design: 1=4px, 2=8px, 3=12px, 4=16px, 6=24px, 8=32px, 12=48px, 16=64px)

theme.extend.borderRadius:
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px

theme.extend.transitionDuration:
  fast: 150ms    // hovers, chip toggles
  normal: 200ms  // panel transitions
  slow: 300ms    // page transitions

theme.extend.transitionTimingFunction:
  DEFAULT: cubic-bezier(0.4, 0, 0.2, 1)
  out: cubic-bezier(0, 0, 0.2, 1)

darkMode: 'class'
```

### CSS Custom Properties

`globals.css` defines CSS custom properties on `:root` (light) and `.dark` (dark). This lets Tailwind reference them via `var()` so the entire palette switches with a single class toggle on `<html>`.

### Dark/Light Mode Toggle

The `ui-store.ts` Zustand store holds the current theme (`'dark' | 'light' | 'system'`). On mount, the store reads from `localStorage`. The `AppShell` component applies the `dark` class to `<html>` based on the resolved theme. The Appearance settings section provides the toggle UI.

### Typography Scale

| Name | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| h1 | 24px | 700 | 1.2 | Page titles (Home, Search) |
| h2 | 20px | 600 | 1.3 | Section titles (Anime name on detail) |
| h3 | 16px | 600 | 1.4 | Card titles, tab labels |
| body | 14px | 400 | 1.5 | Default text |
| body-sm | 13px | 400 | 1.5 | Secondary text, counts |
| caption | 12px | 400 | 1.4 | Muted labels, timestamps |
| label | 12px | 500 | 1.0 | Form labels, badges |


---

## 4. Component Architecture

### 4.1 Layout Components

#### Component: AppShell
**Location:** `src/components/layout/app-shell.tsx`
**Purpose:** Root layout grid. Renders the icon rail (desktop) or bottom tab bar (mobile) plus the content area. Applied as the element for the root route.

**Props Interface:**
```typescript
interface AppShellProps {
  children: React.ReactNode;
}
```

**State:**
- None (reads rail collapsed state from `ui-store`)

**Children:** `IconRail` (desktop), `BottomTabBar` (mobile), `Outlet` (router), `ImportProgressBar` (conditional), `CommandPalette` (conditional)

**Data Source:** None (pure layout)

---

#### Component: IconRail
**Location:** `src/components/layout/icon-rail.tsx`
**Purpose:** 64px icon-only vertical navigation rail. Expands to 180px on hover to reveal labels. Contains 4 navigation items: Home, Search, Tags, Settings. Active item indicated by primary-colored background pill on the icon.

**Props Interface:**
```typescript
interface IconRailProps {
  // No props -- reads route from useLocation
}
```

**State:**
- `isExpanded: boolean` -- tracks hover state (local, CSS transition driven)

**Children:** `NavLink` elements with `lucide-react` icons (Home, Search, Tag, Settings)

**Data Source:** `useLocation()` from react-router to determine active item

---

#### Component: BottomTabBar
**Location:** `src/components/layout/bottom-tab-bar.tsx`
**Purpose:** Mobile 4-tab bottom navigation. Fixed position at viewport bottom, 56px height. Tabs: Home, Search, Tags, Settings.

**Props Interface:**
```typescript
interface BottomTabBarProps {
  // No props -- reads route from useLocation
}
```

**State:** None

**Children:** `NavLink` elements with icons and labels

**Data Source:** `useLocation()` from react-router

---

#### Component: PageHeader
**Location:** `src/components/layout/page-header.tsx`
**Purpose:** Sticky header within the content area. Renders page title on the left and action buttons on the right. Replaces the current `Layout.Main` `actionHeader` pattern.

**Props Interface:**
```typescript
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;         // Shows back arrow if set
  actions?: React.ReactNode; // Right-side action buttons
  children?: React.ReactNode; // Below-title content (filters, tabs)
}
```

**State:** None

**Children:** Back button (conditional), title, subtitle, action slot, children slot

---

### 4.2 Shared Components

#### Component: AnimeCard
**Location:** `src/components/shared/anime-card.tsx`
**Purpose:** Netflix-style cover card for the Home grid. Displays the anime's cover image (first image or AniList cover) with a bottom gradient overlay showing the anime name and image count. On hover, the card scales slightly and shows a subtle border glow.

**Props Interface:**
```typescript
interface AnimeCardProps {
  id: number;
  name: string;
  imageCount: number;
  coverImageUrl?: string;     // AniList cover or first image path
  onClick: (id: number) => void;
}
```

**State:** None

**Children:** `img` (cover), gradient overlay `div`, text overlay

**Data Source:** Props from parent (data fetched by `useAnimeList` in `HomePage`)

---

#### Component: NewAnimeCard
**Location:** `src/components/shared/anime-card.tsx` (exported alongside `AnimeCard`)
**Purpose:** "+ New Anime" placeholder card in the Home grid. Dashed border, plus icon, "New Anime" label. Same dimensions as `AnimeCard`.

**Props Interface:**
```typescript
interface NewAnimeCardProps {
  onClick: () => void;
}
```

**State:** None

---

#### Component: ImageThumbnail
**Location:** `src/components/shared/image-thumbnail.tsx`
**Purpose:** Single image tile for masonry grids. Handles lazy loading via intersection observer, selection state visualization (indigo border + check overlay), and click behavior (view in normal mode, toggle select in select mode).

**Props Interface:**
```typescript
interface ImageThumbnailProps {
  id: number;
  name: string;
  path: string;
  width: number;              // Computed by masonry layout
  height: number;             // Computed by masonry layout (variable for masonry)
  isSelected: boolean;
  isSelectMode: boolean;
  onView: (id: number) => void;
  onToggleSelect: (id: number) => void;
}
```

**State:**
- `isLoaded: boolean` -- image load state for skeleton placeholder

**Children:** `img` with `loading="lazy"`, selection overlay, skeleton placeholder

**Data Source:** Props (parent passes dimensions computed by masonry hook)

---

#### Component: MasonryGrid
**Location:** `src/components/shared/masonry-grid.tsx`
**Purpose:** Virtualized masonry grid for image display. Uses `@tanstack/react-virtual` for row virtualization and CSS columns or a custom layout algorithm for variable-height positioning. The current `FixedSizeGrid` from `react-window` forces uniform cell sizes; masonry allows natural aspect ratios.

**Props Interface:**
```typescript
interface MasonryGridProps {
  images: Array<{
    id: number;
    name: string;
    path: string;
    width?: number;           // Natural image width (if known)
    height?: number;          // Natural image height (if known)
  }>;
  columnMinWidth?: number;    // Default 240px
  gap?: number;               // Default 8px
  isSelectMode: boolean;
  selectedIds: Set<number>;
  onView: (id: number) => void;
  onToggleSelect: (id: number) => void;
}
```

**State:**
- `columnCount: number` -- computed from container width / columnMinWidth
- `containerWidth: number` -- from ResizeObserver

**Children:** `ImageThumbnail` instances

**Data Source:** Props. Uses `useMasonryLayout` hook internally to compute positions.

---

#### Component: TagChip
**Location:** `src/components/shared/tag-chip.tsx`
**Purpose:** Colored tag pill. Used in filter bars, anime detail tag section, and search results. Color derived from category.

**Props Interface:**
```typescript
interface TagChipProps {
  id: number;
  name: string;
  category?: string;
  isActive?: boolean;         // Filled vs outlined
  isRemovable?: boolean;      // Shows X button
  count?: number;             // Optional count badge
  onClick?: (id: number) => void;
  onRemove?: (id: number) => void;
}
```

**State:** None

---

#### Component: CategorySection
**Location:** `src/components/shared/category-section.tsx`
**Purpose:** Collapsible section with a color indicator, category name, and item count. Used in tag management and image tag editor.

**Props Interface:**
```typescript
interface CategorySectionProps {
  name: string;
  color?: string;             // Left border color indicator
  count?: number;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}
```

**State:**
- `isExpanded: boolean` -- collapse/expand (local)

**Children:** Renders children in the collapsible body

---

#### Component: SearchBar
**Location:** `src/components/shared/search-bar.tsx`
**Purpose:** Large search input with icon and optional inline clear button. Used on Search page and command palette. Emits debounced values.

**Props Interface:**
```typescript
interface SearchBarProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  autoFocus?: boolean;
  size?: 'sm' | 'md' | 'lg';
}
```

**State:** None (controlled)

---

#### Component: FilterChip
**Location:** `src/components/shared/filter-chip.tsx`
**Purpose:** Inline filter pill used on the Search page. Shows filter type and value (e.g., "Anime: Attack on Titan"). Removable with X button.

**Props Interface:**
```typescript
interface FilterChipProps {
  label: string;
  value: string;
  onRemove: () => void;
}
```

**State:** None

---

#### Component: EntryTab
**Location:** `src/components/shared/entry-tab.tsx`
**Purpose:** Horizontal pill tab for entry filtering on the anime detail Images tab. Shows entry badge (S1, S2, M), name, and image count. Active state: filled primary color.

**Props Interface:**
```typescript
interface EntryTabProps {
  id: number;
  name: string;
  entryType: string;
  entryNumber?: number;
  imageCount: number;
  isActive: boolean;
  onClick: (id: number) => void;
}
```

**State:** None

---

#### Component: EmptyState
**Location:** `src/components/shared/empty-state.tsx`
**Purpose:** Centered empty state with icon, message, and optional action button. Used when lists are empty.

**Props Interface:**
```typescript
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}
```

---

#### Component: ConfirmDialog
**Location:** `src/components/shared/confirm-dialog.tsx`
**Purpose:** Reusable confirmation dialog wrapping Radix Dialog. Replaces the multiple Modal patterns in the current codebase (delete confirmation in `BackupRestorePage`, `AnimeDetailPage`, etc.).

**Props Interface:**
```typescript
interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;      // Default "Confirm"
  cancelLabel?: string;       // Default "Cancel"
  variant?: 'danger' | 'default';
  loading?: boolean;
  onConfirm: () => void;
}
```

---

#### Component: ImportProgressBar
**Location:** `src/components/shared/import-progress-bar.tsx`
**Purpose:** Bottom-anchored progress bar shown during image imports. Replaces the current `Footer` component which only shows import progress. Uses the `import-progress-store` Zustand store instead of the `ImportImageContext`.

**Props Interface:**
```typescript
interface ImportProgressBarProps {
  // No props -- reads from import-progress-store
}
```

**State:** Reads from `import-progress-store` (total, completed, failed, failures)

**Data Source:** `useWailsEvent('ImportImages:progress')` inside the store

---

### 4.3 Page Components

#### Component: HomePage
**Location:** `src/pages/home/home-page.tsx`
**Purpose:** Landing page showing a responsive grid of `AnimeCard` components plus a `NewAnimeCard`. Replaces the current `AnimeListPage` which uses a vertical list.

**Props Interface:** None (page component, no props)

**State:**
- Dialog state for create anime and import folders modals (local `useState`)

**Children:** `PageHeader`, `AnimeCard[]`, `NewAnimeCard`, `CreateAnimeDialog`

**Data Source:** `useAnimeList()` hook (React Query wrapping `AnimeService.ListAnime()`)

---

#### Component: CreateAnimeDialog
**Location:** `src/pages/home/create-anime-dialog.tsx`
**Purpose:** Dialog for creating a new anime. Includes a name input that doubles as an AniList search (debounced). Shows AniList results below the input for optional linking. Consolidates the current create-anime modal logic from `AnimeListPage.tsx`.

**Props Interface:**
```typescript
interface CreateAnimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (animeId: number) => void;
}
```

**State:**
- `name: string`
- `selectedAniList: AniListSearchResult | null`
- `isCreating: boolean`
- `error: string | null`

**Children:** Input, AniList result list, action buttons

**Data Source:** `useAniListSearch(name)` hook, `AnimeService.CreateAnime()`, `AnimeService.ImportFromAniList()`

---

#### Component: AnimeDetailPage
**Location:** `src/pages/anime-detail/anime-detail-page.tsx`
**Purpose:** Tabbed detail page for a single anime. Renders a `PageHeader` with the anime name, AniList link chip, and action dropdown. Below the header, renders a horizontal tab bar with 5 tabs. Tab content renders via nested `Outlet`. Replaces the current monolithic `AnimeDetailPage.tsx` (500+ lines, 30+ useState calls).

**Props Interface:** None (page component, reads `animeId` from route params)

**State:**
- Tab-level state is split across child tab components
- Page-level: only the anime header data

**Children:** `PageHeader`, Radix `Tabs` with `ImagesTab`, `EntriesTab`, `CharactersTab`, `TagsTab`, `InfoTab`

**Data Source:** `useAnimeDetail(animeId)` hook (React Query wrapping `AnimeService.GetAnimeDetails()`)

---

#### Component: ImagesTab
**Location:** `src/pages/anime-detail/tabs/images-tab.tsx`
**Purpose:** Default tab on anime detail. Shows horizontal `EntryTab` pills for filtering by entry (All, Season 1, Season 2, ...), tag filter chips, sort dropdown, and a view/select mode toggle. Below, a full-width `MasonryGrid` of images.

**Props Interface:**
```typescript
interface ImagesTabProps {
  animeId: number;
  entries: AnimeEntryInfo[];
  tags: AnimeTagInfo[];
}
```

**State:**
- `selectedEntryId: number | null` -- which entry filter is active
- `selectedTagIds: Set<number>` -- active tag filters
- `sortBy: string` -- sort field
- `isSelectMode: boolean` -- view vs select toggle

**Children:** `EntryTab[]`, `TagChip[]` (filter), sort `Select`, mode toggle, `MasonryGrid`, `SelectionActionBar` (conditional)

**Data Source:** `useAnimeImages(animeId, entryId)` hook (React Query wrapping `AnimeService.GetFolderImages()`), `useAnimeDetail` for entries/tags

---

#### Component: EntriesTab
**Location:** `src/pages/anime-detail/tabs/entries-tab.tsx`
**Purpose:** Table view of anime entries. Each row shows: type badge (colored), name, airing season/year, image count, and hover-reveal action buttons (edit, upload, add sub-entry, delete). Expandable rows for sub-entries. "+ Add Entry" button opens a dialog. Refactored from the current `EntryList.tsx` component.

**Props Interface:**
```typescript
interface EntriesTabProps {
  animeId: number;
  entries: AnimeEntryInfo[];
  onMutate: () => void;       // Trigger React Query refetch
}
```

**State:**
- Modal states for add/edit/delete entry dialogs (local)

**Children:** Entry rows, `AddEntryDialog` (extracted from current `AddEntryModal`), edit/delete dialogs

**Data Source:** Props (entries from parent), mutation via `AnimeService.CreateAnimeEntry()`, `AnimeService.RenameEntry()`, etc.

---

#### Component: CharactersTab
**Location:** `src/pages/anime-detail/tabs/characters-tab.tsx`
**Purpose:** Card grid of AniList-linked characters. Each card shows character name and image count. Edit mode toggle enables rename/delete. Search input filters the character list. "+ Add Character" button.

**Props Interface:**
```typescript
interface CharactersTabProps {
  animeId: number;
  characters: AnimeTagInfo[]; // Characters are tags with category="character"
  onMutate: () => void;
}
```

**State:**
- `isEditMode: boolean`
- `searchQuery: string`
- Modal states for add/rename/delete

**Children:** Character cards, search input, add/edit/delete dialogs

**Data Source:** Props (characters filtered from `AnimeDetailsResponse.tags`), mutation via `TagFrontendService.CreateTagForAnime()`, `TagFrontendService.UpdateName()`, `TagFrontendService.DeleteTag()`

---

#### Component: TagsTab
**Location:** `src/pages/anime-detail/tabs/tags-tab.tsx`
**Purpose:** Tag toggle interface for this anime. Tags displayed as chip toggles grouped by category sections (Scene/Action, Nature/Weather, Location, Mood, etc.). Toggle a chip to indicate this tag is relevant to this anime. The categories are derived from the tag data.

**Props Interface:**
```typescript
interface TagsTabProps {
  animeId: number;
  tags: AnimeTagInfo[];
  onMutate: () => void;
}
```

**State:**
- Modal state for adding new tags

**Children:** `CategorySection` groups, `TagChip` toggles within each group, "+ New Tag" button

**Data Source:** Props, mutation via `TagFrontendService.CreateTagForAnime()`

---

#### Component: InfoTab
**Location:** `src/pages/anime-detail/tabs/info-tab.tsx`
**Purpose:** Centered form for editing anime metadata: title, AniList link, description. "Save" button. Danger zone at bottom with "Delete Anime" button behind a confirmation dialog.

**Props Interface:**
```typescript
interface InfoTabProps {
  animeId: number;
  anime: Anime;
  onMutate: () => void;
}
```

**State:**
- `name: string` -- editable title
- `isSaving: boolean`
- `deleteConfirmOpen: boolean`

**Children:** Form inputs, `ConfirmDialog` for delete

**Data Source:** `AnimeService.RenameAnime()`, `AnimeService.DeleteAnime()`

---

#### Component: SearchPage
**Location:** `src/pages/search/search-page.tsx`
**Purpose:** Full-width search page. Large `SearchBar` at top, inline filter chips below (anime dropdown, tag include/exclude pills, sort). Full-width `MasonryGrid` results below. No sidebar (unlike current `SearchPage` which has a sidebar with accordions). Filter state persisted in URL search params.

**Props Interface:** None (page component)

**State:**
- Filter state read from / written to URL search params
- `isSelectMode: boolean`

**Children:** `SearchBar`, `FilterChip[]`, sort dropdown, `MasonryGrid`, `SelectionActionBar` (conditional)

**Data Source:** `useSearchImages(filters)` hook (React Query wrapping `SearchService.SearchImages()`), `useAnimeList()` for anime dropdown, `useTags()` for tag filter options

---

#### Component: TagManagementPage
**Location:** `src/pages/tags/tag-management-page.tsx`
**Purpose:** Tags grouped by collapsible category sections. Each category shows a color indicator, name, and tag count. Each tag row shows: name, image count, anime association chips. Has "+ New Tag" and "+ New Category" buttons. Replaces the current `TagsListPage` which uses a MUI RichTreeView.

**Props Interface:** None (page component)

**State:**
- `searchQuery: string` -- tag search filter
- Modal states for create/rename/delete/merge

**Children:** `PageHeader`, search input, `CategorySection[]`, tag rows, action dialogs

**Data Source:** `useTags()` hook (React Query wrapping `TagService.GetAll()`), mutation via `TagFrontendService.CreateTopTag()`, `TagFrontendService.UpdateName()`, `TagFrontendService.UpdateCategory()`, `TagFrontendService.DeleteTag()`, `TagFrontendService.MergeTags()`

---

#### Component: ImageTagEditorPage
**Location:** `src/pages/image-tag-editor/image-tag-editor-page.tsx`
**Purpose:** Edit tags for selected images. Top strip shows selected image thumbnails. Below, a searchable list of tags organized by category with tri-state checkboxes (checked = all selected images have this tag, indeterminate = some do, unchecked = none do). Pending changes bar at bottom shows add/remove counts with Save/Cancel. Consolidates the logic from current `AnimeTagEditPage.tsx` and `ImageTagEditPage.tsx`.

**Props Interface:** None (page component, reads imageIds and optional animeId from URL search params)

**State:**
- `addedTagIds: Set<number>` -- tags being added
- `deletedTagIds: Set<number>` -- tags being removed
- `searchQuery: string` -- filter visible tags

**Children:** Image strip, tag search, `CategorySection[]` with tri-state checkboxes, pending changes bar

**Data Source:** `useTagStats(imageIds)` hook (React Query wrapping `TagService.ReadTagsByFileIDs()`), `useTags()`, optional `useAnimeDetail(animeId)` for anime-specific grouping. Mutation: `TagFrontendService.BatchUpdateTagsForFiles()`

---

#### Component: SettingsPage
**Location:** `src/pages/settings/settings-page.tsx`
**Purpose:** Settings with horizontal section tabs: General, Appearance, Backup, About. Each section is a separate component rendered by the active tab. Backup section consolidates the current standalone `BackupRestorePage`.

**Props Interface:** None (page component)

**State:**
- `activeSection: string` -- which tab is active (local)

**Children:** Horizontal `Tabs`, section components

---

#### Component: GeneralSection
**Location:** `src/pages/settings/sections/general-section.tsx`
**Purpose:** Directory path settings (image root, config, log). Each with a "Browse" button that calls `ConfigFrontendService.SelectDirectory()`. Save and Reset buttons.

**Props Interface:** None (reads config via hook)

**Data Source:** `useConfig()` hook, `ConfigFrontendService.UpdateConfig()`, `ConfigFrontendService.GetDefaultConfig()`

---

#### Component: AppearanceSection
**Location:** `src/pages/settings/sections/appearance-section.tsx`
**Purpose:** Theme toggle (dark/light/system), and future display preferences. Reads from / writes to `ui-store`.

**Data Source:** `ui-store` Zustand store

---

#### Component: BackupSection
**Location:** `src/pages/settings/sections/backup-section.tsx`
**Purpose:** Create backup (with options), restore from backup list, backup settings. Consolidates the current `BackupRestorePage.tsx`.

**Data Source:** `BackupFrontendService.Backup()`, `BackupFrontendService.Restore()`, `BackupFrontendService.ListBackups()`, `BackupFrontendService.DeleteBackup()`

---

#### Component: AboutSection
**Location:** `src/pages/settings/sections/about-section.tsx`
**Purpose:** App version, build info, links.

---

### 4.4 Overlay Components

#### Component: ImageViewerOverlay
**Location:** `src/components/image-viewer/image-viewer-overlay.tsx`
**Purpose:** Full-screen dark overlay for viewing a single image. Close button (X) top-left. Left/right navigation arrows appear on hover over the respective edges. Minimal chrome -- no filename, no zoom controls in the default view (zoom via pinch/scroll). Wraps `react-zoom-pan-pinch`. Replaces the current `ImageWindow` component.

**Props Interface:**
```typescript
interface ImageViewerOverlayProps {
  images: Array<{ id: number; path: string; name: string }>;
  initialIndex: number;
  onClose: () => void;
}
```

**State:**
- `currentIndex: number` -- which image is displayed
- Zoom state managed internally by `react-zoom-pan-pinch`

**Children:** `TransformWrapper` + `TransformComponent` (from react-zoom-pan-pinch), close button, navigation arrows

**Data Source:** Props. Uses `useImagePrefetch` hook to preload adjacent images. Keyboard events: ArrowLeft, ArrowRight, Escape.

---

#### Component: CommandPalette
**Location:** `src/components/ui/command.tsx` (uses cmdk library)
**Purpose:** Ctrl+K command palette for power users. Search across anime, tags, and actions. Results grouped by category. Selecting an anime navigates to its detail page. Selecting a tag navigates to tag management.

**Props Interface:**
```typescript
interface CommandPaletteProps {
  // No props -- reads open state from ui-store
}
```

**State:**
- `searchQuery: string`
- Results computed from anime list + tag list + action list

**Children:** cmdk `Command.Dialog`, `Command.Input`, `Command.List`, `Command.Group`, `Command.Item`

**Data Source:** `useAnimeList()`, `useTags()` for searchable items. Navigation via `useNavigate()`.

---

### 4.5 Selection System

#### Component: SelectionProvider
**Location:** `src/components/selection/selection-provider.tsx`
**Purpose:** React context provider that wraps pages with image grids. Provides selection state and methods via context. Internally uses the `selection-store` Zustand store. Handles keyboard modifiers (Shift for range, Ctrl/Cmd for toggle).

**Props Interface:**
```typescript
interface SelectionProviderProps {
  imageIds: number[];         // Ordered list of all visible image IDs
  children: React.ReactNode;
}
```

**Context value:**
```typescript
interface SelectionContextValue {
  selectedIds: Set<number>;
  isSelectMode: boolean;
  toggleSelectMode: () => void;
  toggleSelect: (id: number) => void;
  rangeSelect: (fromId: number, toId: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setSelectedFromRect: (rect: DOMRect) => void; // For rubber band
}
```

---

#### Component: RubberBandOverlay
**Location:** `src/components/selection/rubber-band-overlay.tsx`
**Purpose:** Transparent overlay rendered on top of image grids when in select mode. Handles mousedown+drag to draw a selection rectangle. On mouseup, computes which images intersect the rectangle and updates selection state.

**Props Interface:**
```typescript
interface RubberBandOverlayProps {
  containerRef: React.RefObject<HTMLElement>;
  onSelectionRect: (rect: DOMRect) => void;
}
```

**State:**
- `isDragging: boolean`
- `startPoint: { x: number; y: number }`
- `currentPoint: { x: number; y: number }`

**Children:** SVG or div rectangle overlay

**Data Source:** Mouse events on the container. Uses `useRubberBand` hook.

---

#### Component: SelectionActionBar
**Location:** `src/components/selection/selection-action-bar.tsx`
**Purpose:** Floating action bar at the bottom of the screen when images are selected. Shows selected count and bulk action buttons: "Edit Tags", "Move", "Delete". Indigo background color.

**Props Interface:**
```typescript
interface SelectionActionBarProps {
  count: number;
  onEditTags: () => void;
  onClearSelection: () => void;
  animeId?: number;           // Context for tag editing navigation
}
```

**State:** None

**Children:** Count badge, action buttons


---

## 5. Routing Structure

```
/                                      HomePage
/anime/:animeId                        AnimeDetailPage
/anime/:animeId/images                 AnimeDetailPage > ImagesTab (default redirect)
/anime/:animeId/entries                AnimeDetailPage > EntriesTab
/anime/:animeId/characters             AnimeDetailPage > CharactersTab
/anime/:animeId/tags                   AnimeDetailPage > TagsTab
/anime/:animeId/info                   AnimeDetailPage > InfoTab
/search                                SearchPage
/search?anime=:id&tags=:ids&sort=:s    SearchPage (filters in URL)
/tags                                  TagManagementPage
/images/edit/tags?imageIds=:ids        ImageTagEditorPage
/images/edit/tags?imageIds=:ids&animeId=:id   ImageTagEditorPage (anime context)
/settings                              SettingsPage
/settings/:section                     SettingsPage > section tab
```

### Route Tree (react-router v7)

```
createBrowserRouter([
  {
    element: <AppShell />,             // Wraps all routes with icon rail + content area
    errorElement: <RootErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'anime/:animeId',
        element: <AnimeDetailPage />,
        children: [
          { index: true, element: <Navigate to="images" replace /> },
          { path: 'images', element: <ImagesTab /> },
          { path: 'entries', element: <EntriesTab /> },
          { path: 'characters', element: <CharactersTab /> },
          { path: 'tags', element: <TagsTab /> },
          { path: 'info', element: <InfoTab /> },
        ]
      },
      { path: 'search', element: <SearchPage /> },
      { path: 'tags', element: <TagManagementPage /> },
      { path: 'images/edit/tags', element: <ImageTagEditorPage /> },
      {
        path: 'settings',
        element: <SettingsPage />,
        children: [
          { index: true, element: <Navigate to="general" replace /> },
          { path: ':section', element: null },  // section handled by SettingsPage internally via params
        ]
      },
    ]
  }
])
```

### Key routing changes from current app:
1. **Anime detail uses nested routes for tabs** instead of rendering everything in one component. Each tab is its own route (`/anime/1/images`, `/anime/1/entries`, etc.), enabling direct linking and browser back/forward within tabs.
2. **Home route serves anime list** (unchanged from current `/`).
3. **Directories routes removed entirely.** Users never navigate to folders.
4. **Backup page merged into Settings.** No more `/backup` route.
5. **Image tag edit route simplified.** Single route handles both anime-context and global tag editing based on query params.


---

## 6. State Management

### Approach: Zustand for Global State, React Query for Server State, URL for Filter State

The current codebase uses plain `useState` for everything, leading to the 30+ state variable problem visible in `AnimeDetailPage.tsx`. The new approach separates state into three categories:

#### 6.1 Server State (React Query)

All data fetched from Wails bindings is managed by React Query. This eliminates the manual `useEffect` + `useState` + `setLoading` + `setError` pattern repeated across every page.

**Query Keys** (defined in `src/lib/query-keys.ts`):
```typescript
const queryKeys = {
  anime: {
    all: ['anime'] as const,
    list: () => [...queryKeys.anime.all, 'list'] as const,
    detail: (id: number) => [...queryKeys.anime.all, 'detail', id] as const,
    entries: (id: number) => [...queryKeys.anime.all, 'entries', id] as const,
    images: (id: number, entryId?: number) => [...queryKeys.anime.all, 'images', id, entryId] as const,
  },
  tags: {
    all: ['tags'] as const,
    list: () => [...queryKeys.tags.all, 'list'] as const,
    map: () => [...queryKeys.tags.all, 'map'] as const,
    stats: (fileIds: number[]) => [...queryKeys.tags.all, 'stats', ...fileIds] as const,
  },
  search: {
    all: ['search'] as const,
    images: (filters: Record<string, unknown>) => [...queryKeys.search.all, 'images', filters] as const,
  },
  config: {
    all: ['config'] as const,
    settings: () => [...queryKeys.config.all, 'settings'] as const,
  },
  backup: {
    all: ['backup'] as const,
    list: () => [...queryKeys.backup.all, 'list'] as const,
  },
} as const;
```

**Invalidation strategy:** After mutations (create/update/delete), invalidate the relevant query keys. For example, after `AnimeService.RenameAnime()`, invalidate `queryKeys.anime.detail(id)` and `queryKeys.anime.list()`.

#### 6.2 Global UI State (Zustand)

Three Zustand stores for truly global, cross-page state:

**`selection-store.ts`:**
```typescript
interface SelectionState {
  selectedIds: Set<number>;
  isSelectMode: boolean;
  orderedImageIds: number[];   // For shift-click range
  toggleSelectMode: () => void;
  toggleSelect: (id: number) => void;
  rangeSelect: (fromId: number, toId: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setOrderedImageIds: (ids: number[]) => void;
}
```

**`ui-store.ts`:**
```typescript
interface UIState {
  theme: 'dark' | 'light' | 'system';
  isCommandPaletteOpen: boolean;
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
  toggleCommandPalette: () => void;
}
```

**`import-progress-store.ts`:**
```typescript
interface ImportProgressState {
  total: number;
  completed: number;
  failed: number;
  failures: Array<{ path: string; error: string }>;
  reset: () => void;
  // Updated by Wails event subscription in a useEffect at the app root
}
```

#### 6.3 URL State (Search Params)

Filter state that should survive page refresh and enable deep linking lives in URL search params:

- **Search page:** `?anime=1&tags=5,8&sort=newest`
- **Anime detail images tab:** `?entry=3&tags=5,8` (which entry and tags are selected)
- **Image tag editor:** `?imageIds=1,2,3&animeId=1`

Use `useSearchParams()` from react-router. The current codebase already does this for the search page -- extend the pattern to all filter-bearing pages.

#### 6.4 Local Component State

Modal open/close, form field values, transient error messages -- these remain as `useState` within the component that owns them. No need to globalize.

### Image Cache/Prefetch Strategy

1. **Thumbnail URLs include a width query param** (`?width=480`) -- the Wails backend serves resized versions. This pattern already exists in `LazyImage.tsx` and `ImageCard`.
2. **React Query caches image list responses.** Re-navigating to an anime detail page shows cached images immediately, then refetches in background.
3. **Image viewer prefetches adjacent images.** The `useImagePrefetch` hook preloads `images[currentIndex - 1]` and `images[currentIndex + 1]` via `new Image().src = url` when the viewer is open.
4. **Masonry grid uses intersection observer** for lazy loading. Only images within the viewport + 200px margin trigger `<img>` rendering.


---

## 7. Data Flow

### 7.1 Page Data Loading

Each page uses React Query hooks that wrap Wails binding calls. Data is fetched on mount and cached. Example flow for Anime Detail:

1. User navigates to `/anime/5/images`
2. `AnimeDetailPage` renders, calls `useAnimeDetail(5)`
3. `useAnimeDetail` calls `AnimeService.GetAnimeDetails(5)` via React Query
4. While loading, skeleton placeholders render
5. On success, `AnimeDetailPage` renders the tab bar and passes data to `ImagesTab`
6. `ImagesTab` calls `useAnimeImages(5, null)` to load all images
7. Images render in `MasonryGrid`

### 7.2 Mutation and Refresh

After mutations, React Query cache is invalidated to trigger a refetch:

1. User renames anime via `InfoTab`
2. `InfoTab` calls `AnimeService.RenameAnime(5, "New Name")`
3. On success, calls `queryClient.invalidateQueries({ queryKey: queryKeys.anime.detail(5) })`
4. React Query refetches `GetAnimeDetails(5)` in background
5. `AnimeDetailPage` re-renders with updated name

This replaces the current pattern of manual `await load()` + `await loadEntries()` calls scattered throughout `AnimeDetailPage.tsx`.

### 7.3 Wails Event Subscriptions

The `useWailsEvent` hook wraps `Events.On` / `Events.Off` with proper cleanup:

```typescript
// Hook signature
function useWailsEvent<T>(eventName: string, handler: (data: T) => void): void;
```

Used for:
- `ImportImages:progress` events -- updates the `import-progress-store`
- Future events (e.g., filesystem change notifications)

The subscription is set up once in the `AppShell` component, updating the Zustand store. Components that need import progress read from the store.

### 7.4 Error Handling Strategy

Three tiers of error handling:

1. **React Query error state:** Each query hook exposes `error` and `isError`. Pages render an `ErrorAlert` component inline when queries fail.
2. **Mutation errors:** Caught in the mutation's `onError` callback. Displayed via toast notification (Sonner) for non-blocking errors, or inline `ErrorAlert` for form submissions.
3. **Unhandled errors:** The router's `errorElement` (`RootErrorPage`) catches unhandled throws during rendering. This preserves the current pattern but with the new layout.

### 7.5 Optimistic Updates

For fast-feeling interactions, certain mutations use optimistic updates:

- **Tag toggle on anime detail TagsTab:** Immediately update the UI, revert on error
- **Image selection:** Already instant (Zustand store, no server call)
- **Entry selection filter:** Already instant (local state)

Slower mutations (create anime, import from AniList, backup/restore) show loading states instead.


---

## 8. Custom Hooks

### useAnimeList
**Location:** `src/hooks/use-anime-list.ts`
**Purpose:** Fetches the list of all anime with image counts.
**Wraps:** `AnimeService.ListAnime()`
**Returns:** `{ data: AnimeListItem[], isLoading, error }`

### useAnimeDetail
**Location:** `src/hooks/use-anime-detail.ts`
**Purpose:** Fetches anime details including tags, folders, entries.
**Wraps:** `AnimeService.GetAnimeDetails(id)` and `AnimeService.GetAnimeEntries(id)` in parallel
**Returns:** `{ data: { details: AnimeDetailsResponse, entries: AnimeEntryInfo[] }, isLoading, error }`

### useAnimeImages
**Location:** `src/hooks/use-anime-images.ts`
**Purpose:** Fetches images for an anime, optionally filtered by entry.
**Wraps:** `AnimeService.GetFolderImages(folderId, recursive)` and `AnimeService.GetImageTagIDs(imageIds)`
**Returns:** `{ data: { images: Image[], tagMap: Record<number, number[]> }, isLoading, error }`

### useSearchImages
**Location:** `src/hooks/use-search-images.ts`
**Purpose:** Searches images with filters. Handles the anime filter branching (all, unassigned, specific anime).
**Wraps:** `SearchService.SearchImages()`, `AnimeService.SearchImagesByAnime()`, `AnimeService.SearchImagesUnassigned()`
**Returns:** `{ data: Image[], isLoading, error }`

### useTags
**Location:** `src/hooks/use-tags.ts`
**Purpose:** Fetches all tags. Provides both flat list and grouped-by-category views.
**Wraps:** `TagService.GetAll()`
**Returns:** `{ data: Tag[], groupedByCategory: Record<string, Tag[]>, isLoading, error }`

### useTagStats
**Location:** `src/hooks/use-tag-stats.ts`
**Purpose:** Fetches tag statistics for a set of file IDs (which tags apply to which files).
**Wraps:** `TagService.ReadTagsByFileIDs(fileIds)`
**Returns:** `{ data: Record<number, TagStat>, isLoading, error }`

### useImageSelection
**Location:** `src/hooks/use-image-selection.ts`
**Purpose:** Manages image selection with click, shift+click (range), and ctrl+click (toggle) behaviors. Extracted from the current `useChangeWithShirtKey` logic in `ImageList.tsx`.
**Params:** `orderedImageIds: number[]`
**Returns:** `{ selectedIds: Set<number>, handleClick: (id: number, event: MouseEvent) => void, selectAll, clearSelection }`

### useRubberBand
**Location:** `src/hooks/use-rubber-band.ts`
**Purpose:** Handles rubber band drag selection geometry. Tracks mousedown, mousemove, mouseup to compute a selection rectangle. Returns the rectangle coordinates for rendering and the intersecting element IDs.
**Params:** `containerRef: RefObject<HTMLElement>, elementRefs: Map<number, HTMLElement>`
**Returns:** `{ isDragging, rect: { x, y, width, height } | null, selectedIds: Set<number> }`

### useDebounce
**Location:** `src/hooks/use-debounce.ts`
**Purpose:** Debounces a value with a configurable delay. Used for search inputs.
**Params:** `value: T, delay: number`
**Returns:** `debouncedValue: T`

### useAniListSearch
**Location:** `src/hooks/use-anilist-search.ts`
**Purpose:** Debounced AniList search. Combines `useDebounce` with a React Query call to `AnimeService.SearchAniList()`.
**Params:** `query: string`
**Returns:** `{ data: AniListSearchResult[], isLoading, error }`

### useKeyboardShortcut
**Location:** `src/hooks/use-keyboard-shortcut.ts`
**Purpose:** Registers a global keyboard shortcut. Handles modifier keys (Ctrl/Cmd, Shift, Alt). Used for Ctrl+K (command palette), Escape (close overlay), arrow keys (image viewer navigation).
**Params:** `key: string, modifiers: string[], handler: () => void, options?: { enabled?: boolean }`

### useWailsEvent
**Location:** `src/hooks/use-wails-event.ts`
**Purpose:** Subscribes to a Wails backend event and cleans up on unmount. Replaces the manual `Events.On` / `Events.Off` pattern in `ImportImageContext.tsx`.
**Params:** `eventName: string, handler: (data: T) => void`

### useImagePrefetch
**Location:** `src/hooks/use-image-prefetch.ts`
**Purpose:** Prefetches adjacent images when the image viewer is open. Creates `new Image()` objects for the previous and next image paths.
**Params:** `images: Array<{ path: string }>, currentIndex: number`

### useMasonryLayout
**Location:** `src/hooks/use-masonry-layout.ts`
**Purpose:** Computes masonry grid positions for a list of items with known or estimated aspect ratios. Assigns each item to the shortest column.
**Params:** `items: Array<{ id: number; width?: number; height?: number }>, columnCount: number, columnWidth: number, gap: number`
**Returns:** `positions: Array<{ id: number; x: number; y: number; width: number; height: number }>, totalHeight: number`

### useConfig
**Location:** `src/hooks/use-config.ts`
**Purpose:** Fetches and caches app configuration.
**Wraps:** `ConfigFrontendService.GetConfig()`
**Returns:** `{ data: ConfigSettings, isLoading, error }`


---

## 9. Implementation Considerations

### Accessibility

- [ ] **Keyboard navigation:** All interactive elements focusable via Tab. Image grid supports arrow key navigation. Radix primitives handle ARIA roles automatically.
- [ ] **ARIA labels:** Icon-only buttons in IconRail have `aria-label`. Image thumbnails have `alt` text (filename). Command palette has `role="dialog"` with `aria-label`.
- [ ] **Focus management:** When image viewer opens, focus moves to the viewer. When it closes, focus returns to the triggering element. Dialogs trap focus. Tabs manage `aria-selected`.
- [ ] **Color contrast:** All text meets WCAG AA contrast ratios against the dark background. The `text-primary` (#f1f5f9) on `background` (#0f0f14) has a contrast ratio of 17.1:1.
- [ ] **Motion preferences:** Respect `prefers-reduced-motion` -- disable hover scale animations and transitions.
- [ ] **Screen reader:** `aria-live` regions for toast notifications. Selection count announced when selection changes.

### Performance

- [ ] **Memoization candidates:** `AnimeCard` (pure component, only re-renders on prop change), `ImageThumbnail` (high render count in grids), `EntryTab` (static once loaded), `TagChip` (repeated in lists)
- [ ] **Lazy loading:** Image viewer component loaded via `React.lazy()`. Settings page sections lazy loaded. Command palette lazy loaded.
- [ ] **Bundle splitting:** Each page is a separate chunk via React.lazy + route-based code splitting. The `ui/` components are in the main bundle (they are small and shared).
- [ ] **Virtual scrolling:** `MasonryGrid` virtualizes rows outside the viewport via `@tanstack/react-virtual`. Only renders visible images + 200px overscan.
- [ ] **Image optimization:** Thumbnails request resized versions via `?width=` query param (existing Wails feature). Full images loaded only in the image viewer.
- [ ] **React Query stale time:** Anime list and tag list set to 5 minutes stale time. Image queries set to 2 minutes. Config set to 30 minutes.

### Testability

- [ ] **Component isolation:** Every component receives data via props or hooks, never directly calling Wails bindings. Hooks can be mocked in tests.
- [ ] **Hook testing:** Custom hooks tested with `@testing-library/react-hooks`. Mock Wails services at the module level.
- [ ] **Integration tests:** Page-level tests that render the full page with mocked React Query providers. Verify: data loads, filters work, mutations trigger refetch.
- [ ] **Selection system tests:** `useImageSelection` and `useRubberBand` tested with synthetic mouse events.
- [ ] **Zustand store tests:** Stores tested in isolation (Zustand supports testing without React rendering).


---

## 10. Implementation Order

### Phase 1: Foundation (Week 1)

**Goal:** App boots with the new stack, renders a placeholder page.

1. **Project setup:** Install Tailwind CSS v4, Radix UI, `lucide-react`, Zustand, `@tanstack/react-query`, `@tanstack/react-virtual`, `cmdk`, `sonner`. Remove MUI Joy, MUI Material, MUI Icons, Emotion, `react-window`, `react-virtualized-auto-sizer`.
2. **Tailwind config:** Set up `globals.css` with CSS custom properties, `tailwind.config.ts` with the design token extensions.
3. **shadcn/ui primitives:** Create `src/components/ui/` with: `button.tsx`, `dialog.tsx`, `input.tsx`, `tabs.tsx`, `badge.tsx`, `separator.tsx`, `tooltip.tsx`, `skeleton.tsx`. These are the minimum needed for Phase 2.
4. **`cn.ts` utility:** `clsx` + `tailwind-merge` helper.
5. **AppShell + IconRail:** Layout grid with the 64px icon rail, content area. Navigation links to placeholder pages.
6. **Route setup:** `routes.tsx` with all routes pointing to placeholder page components.
7. **Provider setup:** `providers.tsx` with `QueryClientProvider`, theme class on `<html>`.
8. **Zustand stores:** `ui-store.ts` (theme), `selection-store.ts`, `import-progress-store.ts`.

**Depends on:** Nothing. Clean start.

### Phase 2: Home Page + Anime Card (Week 2)

**Goal:** Home page shows anime cards, "New Anime" card, create dialog works.

1. **`useAnimeList` hook:** React Query wrapper for `AnimeService.ListAnime()`.
2. **`AnimeCard` + `NewAnimeCard` components.**
3. **`HomePage` page:** Grid of anime cards.
4. **`CreateAnimeDialog`:** Name input, AniList search, create flow.
5. **`useAniListSearch` hook.**
6. **`useDebounce` hook.**
7. **`EmptyState` component.**
8. **`ConfirmDialog` component.**

**Depends on:** Phase 1 (layout, primitives, routes).

### Phase 3: Anime Detail Page Shell + Info Tab (Week 3)

**Goal:** Navigate to anime detail, see tabbed layout, Info tab works (rename, delete).

1. **`useAnimeDetail` hook.**
2. **`AnimeDetailPage` with tab bar and `Outlet`.**
3. **`InfoTab` with rename form and delete confirmation.**
4. **`PageHeader` component.**
5. **Nested routing for anime detail tabs.**

**Depends on:** Phase 2 (navigation from home to detail).

### Phase 4: Image Infrastructure (Week 3-4)

**Goal:** Masonry grid renders images, image viewer works.

1. **`ImageThumbnail` component.**
2. **`useMasonryLayout` hook.**
3. **`MasonryGrid` component** with `@tanstack/react-virtual`.
4. **`ImageViewerOverlay`** wrapping `react-zoom-pan-pinch`.
5. **`useImagePrefetch` hook.**
6. **`useKeyboardShortcut` hook** (for arrow keys, Escape in viewer).

**Depends on:** Phase 1 (primitives, layout). Independent of Phase 2-3 for the components themselves, but needs Phase 3 for integration into anime detail.

### Phase 5: Anime Detail Images Tab (Week 4)

**Goal:** Images tab shows masonry grid with entry filters and tag filters.

1. **`useAnimeImages` hook.**
2. **`ImagesTab` page component.**
3. **`EntryTab` component** (horizontal pill tabs for entries).
4. **`TagChip` component** (for tag filters).
5. **Integration:** Wire up entry selection -> filtered image loading -> masonry display -> image viewer.

**Depends on:** Phase 3 (anime detail shell), Phase 4 (masonry grid, image viewer).

### Phase 6: Selection System (Week 5)

**Goal:** Users can select images via click, shift+click, rubber band.

1. **`useImageSelection` hook** (ported from current `useChangeWithShirtKey` logic).
2. **`SelectionProvider` context.**
3. **`useRubberBand` hook.**
4. **`RubberBandOverlay` component.**
5. **`SelectionActionBar` component.**
6. **Integration into `MasonryGrid`:** Select mode toggle, selection visualization on `ImageThumbnail`.

**Depends on:** Phase 4 (masonry grid, image thumbnail).

### Phase 7: Remaining Anime Detail Tabs (Week 5-6)

**Goal:** Entries, Characters, Tags tabs fully functional.

1. **`EntriesTab`** -- entry table with inline editing, add/edit/delete dialogs. Ported from current `EntryList.tsx` and `AddEntryModal.tsx`.
2. **`CharactersTab`** -- character card grid, add/rename/delete.
3. **`TagsTab`** -- chip toggles by category.
4. **`CategorySection` component.**
5. **`AniListSearchModal`** reuse for AniList linking on anime detail.

**Depends on:** Phase 3 (anime detail shell).

### Phase 8: Search Page (Week 6)

**Goal:** Search with inline filters, full-width masonry results.

1. **`SearchBar` component.**
2. **`FilterChip` component.**
3. **`useSearchImages` hook.**
4. **`SearchPage`** with filter chips, anime dropdown, tag pills, sort.
5. **Integration with MasonryGrid and SelectionSystem.**

**Depends on:** Phase 4 (masonry grid), Phase 6 (selection system).

### Phase 9: Tag Management + Image Tag Editor (Week 7)

**Goal:** Tag management page and image tag editor fully functional.

1. **`TagManagementPage`** -- categories, tag rows, create/rename/delete/merge.
2. **`ImageTagEditorPage`** -- selected images strip, tri-state checkboxes, pending changes bar.
3. **`useTagStats` hook.**
4. **`useTags` hook.**

**Depends on:** Phase 1 (primitives). Can start in parallel with Phase 7-8.

### Phase 10: Settings + Import Progress + Polish (Week 7-8)

**Goal:** Settings page with all sections. Import progress bar. Command palette. Final polish.

1. **`SettingsPage`** with horizontal tabs.
2. **`GeneralSection`, `AppearanceSection`, `BackupSection`, `AboutSection`.**
3. **`useWailsEvent` hook** for import progress.
4. **`ImportProgressBar`** component.
5. **`CommandPalette`** (Ctrl+K).
6. **`BottomTabBar`** for mobile layout.
7. **Toast notifications** (Sonner) for mutation feedback.
8. **Loading skeletons** for all pages.
9. **Error boundary** for the root route.

**Depends on:** Phase 1 (stores, layout).

### Phase 11: Testing + Accessibility Audit (Week 8)

**Goal:** Test coverage for hooks, stores, and key interaction flows.

1. Unit tests for all custom hooks.
2. Unit tests for Zustand stores.
3. Integration tests for page data loading flows.
4. Keyboard navigation audit.
5. Screen reader testing.
6. Performance profiling (React DevTools, Lighthouse).
