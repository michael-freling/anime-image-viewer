/**
 * AnimeDetailTabBar — horizontal primary tab bar for the Anime Detail page.
 *
 * Spec: ui-design.md §3.2 "Tabs: Images (default) | Seasons | Characters |
 * Tags | Info" with the active tab marked by a primary underline.
 *
 * This is a thin wrapper around the shared `UnderlineTabBar` component,
 * providing the anime-detail-specific tab items.
 */
import { Film, ListOrdered, Image as ImageIcon, Tag, Info } from "lucide-react";

import {
  UnderlineTabBar,
  type TabItem,
} from "../../components/shared/underline-tab-bar";

/**
 * Tabs in canonical order (ui-design §3.2). The paths are relative so they
 * resolve against the /anime/:animeId parent when used inside the
 * AnimeDetailLayout.
 */
export const ANIME_DETAIL_TABS: readonly TabItem[] = [
  { to: "images", label: "Images", icon: ImageIcon },
  { to: "seasons", label: "Seasons", icon: ListOrdered },
  { to: "characters", label: "Characters", icon: Film },
  { to: "tags", label: "Tags", icon: Tag },
  { to: "info", label: "Info", icon: Info },
] as const;

export function AnimeDetailTabBar(): JSX.Element {
  return (
    <UnderlineTabBar
      items={ANIME_DETAIL_TABS}
      ariaLabel="Anime detail tabs"
      testId="anime-detail-tab-bar"
      testIdPrefix="anime-detail-tab"
    />
  );
}

export default AnimeDetailTabBar;
