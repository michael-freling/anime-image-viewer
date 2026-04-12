---
title: "UX Redesign"
weight: 10
bookCollapseSection: false
---

# UX Redesign v2: AnimeVault (Anime Image Viewer/Organizer)

## 1. Design Overview

### Design Philosophy

This redesign v2 takes a fundamentally different approach from v1. Rather than reskinning the existing admin-panel layout, we rethink every screen from scratch, drawing inspiration from the best modern consumer apps:

- **Google Photos** -- Inline filter chips above a full-width results grid. No sidebars on search.
- **Pinterest** -- Masonry grids that fill the viewport. Cards with preview images for discovery.
- **Netflix / Crunchyroll** -- Hero sections with featured content. Horizontal scrollable strips for categories.
- **Spotify** -- Minimal chrome, dark-first design, search as a first-class experience.
- **Linear** -- Command palette (Ctrl+K), keyboard-first, icon rail navigation.
- **AniList** -- Anime profile pages with hero headers and metadata chips.

### What Changed from v1

1. **"Library" renamed to "Home"** everywhere.
2. **Folders page removed entirely.** Users never see or interact with folders. The app manages filesystem organization internally.
3. **ML tag suggestions removed entirely.** No confidence sliders, no suggestion panels, no "ML" references anywhere.
4. **Desktop targets 4K (3840x2160)** instead of 1440px. More columns, more content visible.
5. **Search has NO sidebars.** Inline filter chips directly above full-width results (Google Photos style).
6. **Anime Detail has NO left panel.** Hero header with metadata, horizontal entry chips, full-width masonry grid (AniList/Pinterest style).
7. **Tag Management uses visual cards** with preview images, not a tree+detail panel split.
8. **Navigation reduced to 4 items:** Home, Search, Tags, and a divider before Backup and Settings.
9. **Dark theme as default.** Modern, image-focused aesthetic.
10. **Advanced select mode** with rubber band/lasso selection, shift+click range, ctrl+click toggle.

### Key Design Decisions

1. **No sidebars on content pages** -- Every content page (Search, Anime Detail, Tag Management) uses full-width layouts. Filters and metadata appear as inline chips, hero headers, or horizontal tabs. This maximizes image display area, especially on 4K screens.

2. **Icon Rail sidebar (desktop) + 4-Tab Bottom Bar (mobile)** -- The 80px icon rail on desktop keeps navigation accessible without stealing content space. Mobile uses exactly 4 tabs: Home, Search, Tags, More.

3. **Command Palette (Ctrl+K)** -- Power-user access to any anime, tag, or action without leaving the current page.

4. **Hero headers on detail pages** -- Anime Detail uses a full-width hero banner with cover image background, metadata overlay, and action buttons. This replaces the old left-panel tree approach.

5. **Entry chips, not entry trees** -- Entries appear as horizontal pill tabs, not an expandable sidebar tree. Click a chip to filter the image grid. Much simpler.

6. **Manual tagging only** -- The Image Tag Editor is a clean, full-width tri-state checkbox layout organized by category. No ML panel, no confidence sliders.

7. **Rubber band selection** -- Users can click and drag on empty space to draw a selection rectangle. This is the most intuitive way to select multiple images with a mouse.

### Design Tokens

```
Colors (Dark -- default):
  --background:     #0f0f14
  --surface:        #1e1e2e
  --surface-alt:    #16161e
  --primary:        #818cf8 (Indigo 400)
  --primary-hover:  #6366f1 (Indigo 500)
  --primary-subtle: #312e81 (Indigo 900)
  --text:           #f1f5f9
  --text-secondary: #94a3b8
  --text-muted:     #64748b
  --text-dim:       #475569
  --border:         #2d2d3f
  --danger:         #fca5a5
  --danger-bg:      #3b1a1a
  --success:        #6ee7b7
  --success-bg:     #1a3a2e
  --warning:        #fcd34d
  --warning-bg:     #3b2600

Colors (Light):
  --background:     #fafafa
  --surface:        #ffffff
  --surface-alt:    #f8fafc
  --primary:        #6366f1 (Indigo 500)
  --primary-hover:  #4f46e5 (Indigo 600)
  --primary-subtle: #eef2ff (Indigo 50)
  --text:           #111827
  --text-secondary: #6b7280
  --text-muted:     #9ca3af
  --border:         #e5e7eb

Spacing: 4px base unit (4, 8, 12, 16, 24, 32, 48, 64, 80)
Border Radius: 6px (small), 10px (medium), 16px (large), 24px (pill)
Font: Inter
```

---

## 2. User Flows

### 2.1 First-Time Setup

```mermaid
flowchart TD
    A[App Launch] --> B{Root directory configured?}
    B -->|No| C[Welcome Screen]
    C --> D[Select image root directory]
    D --> E{Directory has subfolders?}
    E -->|Yes| F[Offer to import as anime]
    E -->|No| G[Show empty Home with create instructions]
    F --> H[User selects which to import]
    H --> I[Import begins in background]
    I --> J[Home populates with anime cards]
    B -->|Yes| J
    G --> J
```

### 2.2 Adding New Anime

```mermaid
flowchart TD
    A[Home Page] --> B{Action chosen}
    B -->|Create New| C[Create Anime Dialog]
    C --> D[Enter name]
    D --> E[Anime created]
    E --> F[Navigate to Anime Detail]

    B -->|Import| G[Import Dialog]
    G --> H[Show unassigned directories]
    H --> I[User selects with checkboxes]
    I --> J[Click Import]
    J --> K[Background import with toast progress]
    K --> L[Home refreshes with new cards]

    B -->|AniList Search| M[AniList Search Modal]
    M --> N[Search by anime name]
    N --> O[Select from results]
    O --> P[Create anime with AniList metadata]
    P --> F
```

### 2.3 Browsing and Viewing Images

```mermaid
flowchart TD
    A[Home] --> B[Click anime card]
    B --> C[Anime Detail Page]
    C --> D{Navigation}

    D -->|Entry chip| E[Filter images by entry]
    D -->|Tag filter| F[Filter by tag]

    E --> G[Image Grid updates]
    F --> G

    G --> H[Click image]
    H --> I[Full-screen Image Viewer]

    I --> J{Viewer Actions}
    J -->|Arrow keys / swipe| K[Navigate to next/prev image]
    J -->|Scroll / pinch| L[Zoom in/out]
    J -->|Press T or Tags button| M[Open tag side panel]
    M --> N[View and edit tags]
    J -->|Press Esc or X| O[Return to grid]
    J -->|Thumbnail strip| P[Jump to specific image]
```

### 2.4 Tagging Images (Manual Only)

```mermaid
flowchart TD
    A[Image Grid] --> B[Switch to Select mode]
    B --> C{Selection Method}
    C -->|Click| D[Toggle individual image]
    C -->|Shift+Click| E[Select range from last]
    C -->|Ctrl+Click| F[Add/remove from selection]
    C -->|Drag on empty space| G[Rubber band select]

    D --> H{Selection Action}
    E --> H
    F --> H
    G --> H

    H -->|Edit Tags| I[Tag Editor Page]
    I --> J[Full-width tag tree with tri-state checkboxes]
    J --> K[Check = add to ALL selected]
    J --> L[Uncheck = remove from ALL]
    J --> M[Indeterminate = some have tag]

    I --> N[Click Apply]
    N --> O[Tags saved]
    O --> P[Return to previous view]

    H -->|From Image Viewer| Q[Tags side panel]
    Q --> R[Inline tag editing for single image]
    R --> S[Changes saved immediately]
```

### 2.5 Searching and Filtering

```mermaid
flowchart TD
    A[Click Search tab] --> B[Search Page]
    B --> C[Top search bar with inline filters]

    C --> D[Anime dropdown filter]
    C --> E[Tag include pills]
    C --> F[Tag exclude pills]
    C --> G[Sort dropdown]

    D --> H[Results grid updates live]
    E --> H
    F --> H
    G --> H

    H --> I{Action on results}
    I -->|Click image| J[Full-screen viewer]
    I -->|Switch to Select| K[Select mode]
    K --> L[Bulk tag edit]

    C --> M[Active filter chips visible]
    M --> N[Click X on chip to remove]
    M --> O[Clear All to reset]
```

### 2.6 Managing Anime Entries

```mermaid
flowchart TD
    A[Anime Detail Page] --> B{Entry Action}

    B -->|Add Entry| C[Add Entry Modal]
    C --> D{Entry Type}
    D -->|Season| E[Set season number]
    D -->|Movie| F[Set year]
    D -->|Other| G[Set name]
    E --> H[Entry created]
    F --> H
    G --> H

    B -->|Entry chip context menu| I{Entry Menu}
    I -->|Rename| J[Inline edit or modal]
    I -->|Set Type| K[Change type dialog]
    I -->|Delete| L[Confirm delete dialog]
    I -->|Upload Images| M[Native file picker]
    M --> N[Background import to entry]

    B -->|Click entry chip| O[Filter images to that entry]
```

### 2.7 Backup and Restore

```mermaid
flowchart TD
    A[Backup Page] --> B{Action}

    B -->|Create Backup| C[Configure options]
    C --> D[Toggle: Include images]
    C --> E[Optional: Target directory]
    D --> F[Click Create Backup]
    F --> G[Progress indicator]
    G --> H[Success toast with path]

    B -->|Restore| I[Click Restore on backup row]
    I --> J[Confirm dialog]
    J --> K[Click Restore]
    K --> L[Progress indicator]
    L --> M[Restart required notice]

    B -->|Delete| N[Click Delete on row]
    N --> O[Confirm dialog]
    O --> P[Backup removed]

    B -->|Auto-Backup| Q[Configure settings]
    Q --> R[Enable/disable toggle]
    Q --> S[Idle minutes threshold]
    Q --> T[Retention count]
    Q --> U[Include images toggle]
    R --> V[Save settings]
```

### 2.8 Settings

```mermaid
flowchart TD
    A[Settings Page] --> B{Section tab}

    B -->|General| C[Directory configuration]
    C --> D[Image Root + Browse]
    C --> E[Config + Browse]
    C --> F[Log + Browse]
    C --> G[Backup + Browse]

    B -->|Appearance| H[Theme settings]
    H --> I[Light / Dark / System toggle]
    H --> J[Grid column preference]

    B -->|Backup| K[Same as Backup page settings]

    B -->|About| L[Version, links, license]

    C --> M[Save]
    M --> N{Changed directories?}
    N -->|Yes| O[Warning: restart required]
    N -->|No| P[Success toast]
```

---

## 3. Screen Layouts

### 3.1 Home

**Desktop (3840x2160):**

<img src="/wireframes/01-home-desktop.svg" alt="Home Desktop Wireframe" style="width:100%" />

**Mobile (375x812):**

<img src="/wireframes/01-home-mobile.svg" alt="Home Mobile Wireframe" style="width:100%;max-width:375px" />

**Components:**
- 80px icon rail sidebar (desktop) / 4-tab bottom bar (mobile)
- Hero area with page title, stats, search bar, and quick action buttons
- "Recently Updated" horizontal strip with compact anime cards showing recent activity
- Collection grid: 6 columns on 4K desktop, 2 columns on mobile
- Each card: cover image, anime name, entry count, image count, latest entry badge
- Import progress toast (floating, bottom-right)

**Layout Notes:**
- Netflix/Crunchyroll-inspired layout: hero section at top, then scrollable grid
- No top bar -- the icon rail handles navigation, search is prominent in the hero
- Grid uses CSS Grid with `auto-fill, minmax(520px, 1fr)` for fluid 4K columns
- Dark theme default: `#0f0f14` background, `#1e1e2e` card surfaces

### 3.2 Anime Detail

**Desktop (3840x2160):**

<img src="/wireframes/02-anime-detail-desktop.svg" alt="Anime Detail Desktop Wireframe" style="width:100%" />

**Mobile (375x812):**

<img src="/wireframes/02-anime-detail-mobile.svg" alt="Anime Detail Mobile Wireframe" style="width:100%;max-width:375px" />

**Components:**
- Full-width hero header with blurred cover image, anime title, metadata, action buttons
- Horizontal entry chip tabs: "All Images", "Season 1", "Season 2", etc.
- Inline toolbar: image count, tag filter chip, sort dropdown, view/select toggle
- Full-width masonry image grid (7 columns at 4K, 2 on mobile)
- NO left panel, NO entry tree, NO folder section

**Layout Notes:**
- AniList profile + Pinterest board inspired
- Hero header fades to background via gradient overlay
- Entry chips replace the old sidebar tree
- Masonry grid fills entire width minus icon rail

### 3.3 Image Viewer

**Desktop (3840x2160):**

<img src="/wireframes/03-image-viewer-desktop.svg" alt="Image Viewer Desktop Wireframe" style="width:100%" />

**Mobile (375x812):**

<img src="/wireframes/03-image-viewer-mobile.svg" alt="Image Viewer Mobile Wireframe" style="width:100%;max-width:375px" />

**Components:**
- Full-screen dark overlay
- Main image with zoom/pan
- Semi-transparent top bar with controls
- Tag side panel (480px, desktop) / Bottom sheet (mobile)
- Bottom thumbnail strip
- NO ML suggestions

### 3.4 Search

**Desktop (3840x2160):**

<img src="/wireframes/04-search-desktop.svg" alt="Search Desktop Wireframe" style="width:100%" />

**Mobile (375x812):**

<img src="/wireframes/04-search-mobile.svg" alt="Search Mobile Wireframe" style="width:100%;max-width:375px" />

**Components:**
- Large search bar at top
- Inline filter bar: Anime dropdown, Tag include/exclude pills, Sort dropdown
- Full-width masonry results grid
- NO sidebar filter panel, NO folder filter, NO filename filter

### 3.5 Tag Management

**Desktop (3840x2160):**

<img src="/wireframes/05-tag-management-desktop.svg" alt="Tag Management Desktop Wireframe" style="width:100%" />

**Mobile (375x812):**

<img src="/wireframes/05-tag-management-mobile.svg" alt="Tag Management Mobile Wireframe" style="width:100%;max-width:375px" />

**Components:**
- Tag cards organized by category with preview image strips
- Each card: preview images, tag name, image count, anime count
- NO tree + detail panel split

### 3.6 Image Tag Editor

**Desktop (3840x2160):**

<img src="/wireframes/06-image-tag-editor-desktop.svg" alt="Image Tag Editor Desktop Wireframe" style="width:100%" />

**Mobile (375x812):**

<img src="/wireframes/06-image-tag-editor-mobile.svg" alt="Image Tag Editor Mobile Wireframe" style="width:100%;max-width:375px" />

**Components:**
- Selected images strip, tag search, pending changes bar
- Full-width tri-state checkboxes in multi-column layout
- Visual states: green for adding, red for removing
- NO ML panel, NO confidence slider

### 3.7 Backup / Restore

**Desktop (3840x2160):**

<img src="/wireframes/07-backup-restore-desktop.svg" alt="Backup Restore Desktop Wireframe" style="width:100%" />

**Mobile (375x812):**

<img src="/wireframes/07-backup-restore-mobile.svg" alt="Backup Restore Mobile Wireframe" style="width:100%;max-width:375px" />

**Components:**
- Centered card layout (max-width 1200px)
- Create, History, Auto-backup settings cards

### 3.8 Settings

**Desktop (3840x2160):**

<img src="/wireframes/08-settings-desktop.svg" alt="Settings Desktop Wireframe" style="width:100%" />

**Mobile (375x812):**

<img src="/wireframes/08-settings-mobile.svg" alt="Settings Mobile Wireframe" style="width:100%;max-width:375px" />

**Components:**
- Horizontal section tabs (not left nav)
- Centered form layout
- Mobile: iOS-style grouped list

### 3.9 Select Mode

**Desktop (3840x2160):**

<img src="/wireframes/09-select-mode-desktop.svg" alt="Select Mode Desktop Wireframe" style="width:100%" />

**Components:**
- Indigo selection action bar with count and actions
- Rubber band selection rectangle (dashed indigo border)
- Selected images: indigo border + tint + filled checkbox
- Hint bar: Click, Shift+Click, Ctrl+Click, Drag

### 3.10 Navigation Pattern

**Reference:**

<img src="/wireframes/10-navigation-pattern.svg" alt="Navigation Pattern Wireframe" style="width:100%" />

**Desktop:** 80px icon rail (Home, Search, Tags | Backup, Settings), expands to 200px on hover
**Mobile:** 4-tab bottom bar (Home, Search, Tags, More), "More" opens bottom sheet

---

## 4. Component Specifications

### 4.1 Anime Card

**States:**
- Default: Dark surface, cover image, info
- Hover: Scale 1.02, glow border
- Active: Scale 0.98
- Loading: Skeleton placeholder
- Empty: Gradient placeholder

### 4.2 Image Thumbnail

**States:**
- Default: Image with 12px radius
- Hover: Brightness overlay
- Selected: 4px indigo border, checkbox, 15% tint
- Rubber band pending: 3px dashed border, 10% tint
- Loading: Skeleton
- Error: Broken image icon

### 4.3 Tag Chip

**Category Colors (Dark):**
- Character: `#312e81` / `#818cf8`
- Scene: `#1a3a2e` / `#6ee7b7`
- Location: `#3b2600` / `#fcd34d`
- Object: `#3b1a1a` / `#fca5a5`
- Uncategorized: `#1e1e2e` / `#94a3b8`

### 4.4 Tri-State Checkbox

**States:**
- Unchecked: Transparent, dim border
- Checked: Primary fill, white checkmark
- Indeterminate: Transparent, primary border, dash
- Adding: Green highlight row
- Removing: Red highlight row, strikethrough

### 4.5 Command Palette

- Ctrl+K to open, Esc to close
- Results grouped: Anime, Tags, Actions
- Arrow keys to navigate, Enter to select

---

## 5. Select Mode Specification

### 5.1 Selection Methods

| Method | Action | Keyboard |
|--------|--------|----------|
| Click | Toggle single image | -- |
| Shift+Click | Select range from last selected | Shift held |
| Ctrl+Click | Add/remove without clearing | Ctrl/Cmd held |
| Drag on empty space | Rubber band rectangle selection | -- |
| Ctrl+A | Select all in current view | Ctrl+A |

### 5.2 Rubber Band Details
- Initiated by mousedown on grid empty space (not on an image)
- Semi-transparent indigo fill (8% opacity), dashed indigo border
- Images intersecting the rectangle are "pending selected" with dashed border
- On mouseup, pending become selected
- Ctrl+drag adds to existing selection without clearing

### 5.3 Visual Feedback
- Selected: 4px indigo border + 15% tint + filled checkbox
- Pending: 3px dashed border + 10% tint + half-filled checkbox
- Unselected: Empty checkbox (only visible in select mode)
- Action bar: Full-width indigo bar with count, Select All, Clear, Edit Tags, Done

---

## 6. Responsive Design

### 6.1 Breakpoints

| Breakpoint | Width | Grid Columns |
|------------|-------|--------------|
| Mobile | 0-639px | 2 |
| Tablet | 640-1023px | 3-4 |
| Desktop | 1024-2559px | 5-6 |
| 4K | 2560px+ | 6-8 |

### 6.2 Navigation

| Size | Pattern |
|------|---------|
| Desktop | 80px icon rail, expands 200px on hover |
| Tablet | 80px icon rail, no expand |
| Mobile | 4-tab bottom bar (Home, Search, Tags, More) |

---

## 7. Accessibility

- All interactive elements keyboard-focusable
- 2px primary focus ring
- Semantic HTML with ARIA landmarks
- Color contrast AA minimum (4.5:1 body, 3:1 large text)
- `prefers-reduced-motion` respected
- Touch targets 44x44px minimum
- Rubber band selection announces count via live region

---

## Wireframe File Index

| File | Description |
|------|-------------|
| `01-home-desktop.svg` | Home with hero + collection grid (3840x2160) |
| `01-home-mobile.svg` | Home with bottom tabs (375x812) |
| `02-anime-detail-desktop.svg` | Hero header + entry chips + masonry grid (3840x2160) |
| `02-anime-detail-mobile.svg` | Compact hero + chips + 2-col grid (375x812) |
| `03-image-viewer-desktop.svg` | Full-screen viewer with tag panel (3840x2160) |
| `03-image-viewer-mobile.svg` | Full-screen viewer with bottom sheet (375x812) |
| `04-search-desktop.svg` | Inline filters + full-width results (3840x2160) |
| `04-search-mobile.svg` | Search bar + filter chips + results (375x812) |
| `05-tag-management-desktop.svg` | Tag cards by category with previews (3840x2160) |
| `05-tag-management-mobile.svg` | Tag list with thumbnails (375x812) |
| `06-image-tag-editor-desktop.svg` | Full-width tri-state checkboxes, no ML (3840x2160) |
| `06-image-tag-editor-mobile.svg` | Single-column tag checkboxes (375x812) |
| `07-backup-restore-desktop.svg` | Centered card layout (3840x2160) |
| `07-backup-restore-mobile.svg` | Stacked cards (375x812) |
| `08-settings-desktop.svg` | Horizontal section tabs + form (3840x2160) |
| `08-settings-mobile.svg` | iOS-style settings list (375x812) |
| `09-select-mode-desktop.svg` | Rubber band selection shown (3840x2160) |
| `10-navigation-pattern.svg` | Icon rail + mobile bottom bar comparison |
