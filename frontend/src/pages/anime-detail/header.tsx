/**
 * AnimeDetailHeader — top header for the Anime Detail page.
 *
 * Spec: ui-design.md §3.2.1 "Header: breadcrumb, anime name, entry count,
 * image count, Upload button, `...` overflow menu".
 *
 * This wraps the shared `PageHeader` so the Home > {Anime name} breadcrumb +
 * title + actions behave identically to other pages. The metadata line
 * (entries, images) goes in the subtitle slot.
 */
import { Box, Button, Flex } from "@chakra-ui/react";
import { ArrowLeft, Upload, MoreVertical } from "lucide-react";
import { useNavigate } from "react-router";

import { PageHeader } from "../../components/layout/page-header";
import { formatCount } from "../../lib/format";
import type { AnimeDetail } from "../../types";

export interface AnimeDetailHeaderProps {
  detail: AnimeDetail | undefined;
  /** Computed total image count across all entries. */
  totalImages: number;
  /** Number of top-level entries for the metadata line. */
  entryCount: number;
  /** Called when the user clicks the Upload button. */
  onUpload?: () => void;
  /** Called when the user clicks the overflow menu. */
  onMore?: () => void;
}

function countTotalImages(detail: AnimeDetail | undefined): number {
  if (!detail) return 0;
  let total = 0;
  for (const entry of detail.entries) {
    total += entry.imageCount ?? 0;
    if (entry.children) {
      for (const child of entry.children) {
        total += child.imageCount ?? 0;
      }
    }
  }
  return total;
}

export function AnimeDetailHeader({
  detail,
  totalImages,
  entryCount,
  onUpload,
  onMore,
}: AnimeDetailHeaderProps): JSX.Element {
  const navigate = useNavigate();
  const name = detail?.anime.name ?? "";
  const effectiveTotal = totalImages > 0 ? totalImages : countTotalImages(detail);
  const metaLine = [
    formatCount(entryCount, "entry", "entries"),
    formatCount(effectiveTotal, "image", "images"),
  ]
    .filter(Boolean)
    .join(" · ");

  const actions = (
    <Flex gap="2" align="center">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => navigate("/")}
        data-testid="anime-detail-back"
        aria-label="Back to home"
      >
        <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
          <ArrowLeft size={14} />
        </Box>
        Back
      </Button>
      {onUpload ? (
        <Button
          type="button"
          size="sm"
          variant="solid"
          onClick={onUpload}
          data-testid="anime-detail-upload"
          aria-label="Upload images"
        >
          <Box as="span" aria-hidden="true" display="inline-flex" mr="2">
            <Upload size={14} />
          </Box>
          Upload
        </Button>
      ) : null}
      {onMore ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onMore}
          data-testid="anime-detail-more"
          aria-label="More actions"
        >
          <MoreVertical size={14} />
        </Button>
      ) : null}
    </Flex>
  );

  return (
    <PageHeader
      title={name || "Loading anime…"}
      subtitle={metaLine || undefined}
      actions={actions}
      breadcrumbs={[
        { label: "Home", href: "/" },
        { label: name || "Anime" },
      ]}
    />
  );
}

export default AnimeDetailHeader;
