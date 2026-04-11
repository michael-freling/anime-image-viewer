import {
  Box,
  Divider,
  IconButton,
  Input,
  List,
  ListItemButton,
  Modal,
  ModalClose,
  ModalDialog,
  ModalOverflow,
  Option,
  Select,
  Sheet,
  Stack,
  Typography,
} from "@mui/joy";
import { RichTreeView, TreeViewBaseItem } from "@mui/x-tree-view";
import React, { FC, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  Directory,
  DirectoryService,
  Image,
  SearchService,
  Tag,
  TagService,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import { TagFrontendService as LegacyTagFrontendService } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/tag";
import {
  ExplorerTreeItem,
  ExplorerTreeItemProps,
} from "../../components/ExplorerTreeItem";
import { ImageList } from "../../components/Images/ImageList";
import ImageWindow from "../../components/Images/ImageWindow";
import { ViewImageType } from "../../components/Images/ViewImage";
import {
  tagsToTreeViewBaseItems,
  getDefaultExpandedItems,
} from "../../components/TagExplorer";
import Layout from "../../Layout";
import { Add, Search } from "@mui/icons-material";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";

export const TagsListPage: FC = () => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [isTagLoaded, setTagLoaded] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<number | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);
  const [previewImages, setPreviewImages] = useState<Image[]>([]);
  const [rootDirectory, setRootDirectory] = useState<Directory | null>(null);
  const [tagToDirectoryIds, setTagToDirectoryIds] = useState<
    Map<number, number[]>
  >(new Map());
  const [selectedViewImageId, setSelectedViewImageId] = useState<number | null>(
    null
  );

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (tags.length > 0) {
      return;
    }

    refresh();
  }, []);

  useEffect(() => {
    (async () => {
      const response = await DirectoryService.ReadDirectoryTree();
      setRootDirectory(response.rootDirectory);

      const inverted = new Map<number, number[]>();
      const tagMap = response.tagMap ?? {};
      for (const [fileIdStr, tagIds] of Object.entries(tagMap)) {
        const fileId = Number(fileIdStr);
        for (const tagId of tagIds as number[]) {
          const existing = inverted.get(tagId) ?? [];
          existing.push(fileId);
          inverted.set(tagId, existing);
        }
      }
      setTagToDirectoryIds(inverted);
    })();
  }, []);

  useEffect(() => {
    if (selectedTagId == null) {
      setPreviewImages([]);
      return;
    }
    (async () => {
      const response = await SearchService.SearchImages({
        tagId: selectedTagId,
      });
      setPreviewImages((response.images ?? []).slice(0, 6));
    })();
  }, [selectedTagId]);

  const previewViewImages = useMemo<ViewImageType[]>(
    () => previewImages.map((image) => ({ ...image, selected: false })),
    [previewImages]
  );

  const taggedDirIds = useMemo<Set<number>>(() => {
    if (selectedTagId == null) return new Set();
    return new Set(tagToDirectoryIds.get(selectedTagId) ?? []);
  }, [selectedTagId, tagToDirectoryIds]);

  const selectedTagName = useMemo(() => {
    if (selectedTagId == null) return "";
    return tags.find((t) => t.id === selectedTagId)?.name ?? "";
  }, [selectedTagId, tags]);

  const previewDirectoryTreeItems = useMemo<
    TreeViewBaseItem<{ id: string; label: string; tags: string[] }>[]
  >(() => {
    if (rootDirectory == null || taggedDirIds.size === 0) return [];
    type PreviewTreeItem = TreeViewBaseItem<{
      id: string;
      label: string;
      tags: string[];
    }>;
    const buildFilteredTree = (dir: Directory): PreviewTreeItem | null => {
      const children: PreviewTreeItem[] = [];
      for (const child of dir.children ?? []) {
        const built = buildFilteredTree(child);
        if (built) children.push(built);
      }
      const isTagged = taggedDirIds.has(dir.id);
      if (!isTagged && children.length === 0) return null;
      return {
        id: String(dir.id),
        label: dir.name,
        tags: isTagged && selectedTagName ? [selectedTagName] : [],
        children,
      };
    };
    const items: PreviewTreeItem[] = [];
    for (const child of rootDirectory.children ?? []) {
      const built = buildFilteredTree(child);
      if (built) items.push(built);
    }
    return items;
  }, [rootDirectory, taggedDirIds, selectedTagName]);

  const previewExpandedItems = useMemo<string[]>(() => {
    const ids: string[] = [];
    const walk = (
      items: TreeViewBaseItem<{ id: string; label: string; tags: string[] }>[]
    ) => {
      for (const item of items) {
        ids.push(item.id);
        if (item.children && item.children.length > 0) {
          walk(
            item.children as TreeViewBaseItem<{
              id: string;
              label: string;
              tags: string[];
            }>[]
          );
        }
      }
    };
    walk(previewDirectoryTreeItems);
    return ids;
  }, [previewDirectoryTreeItems]);

  async function refresh() {
    const tags = await TagService.GetAll();
    setTags(tags);
    setTagLoaded(true);
  }

  const filteredSortedTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    const filtered = q
      ? tags.filter((t) => t.name.toLowerCase().includes(q))
      : tags.slice();
    filtered.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
    return filtered;
  }, [tags, tagSearch]);

  const treeItems = useMemo(
    () => tagsToTreeViewBaseItems(filteredSortedTags),
    [filteredSortedTags]
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addNewChild = async (_parentID: string) => {
    await LegacyTagFrontendService.CreateTopTag("New Tag");
    await refresh();
  };

  const deleteTag = async (tagId: string) => {
    const id = parseInt(tagId, 10);
    const count = await LegacyTagFrontendService.GetTagFileCount(id);
    if (count > 0) {
      const confirmed = window.confirm(
        `This tag is used by ${count} image(s). Are you sure you want to delete it?`
      );
      if (!confirmed) {
        return;
      }
    }
    await LegacyTagFrontendService.DeleteTag(id);
    await refresh();
  };

  const mergeTag = async (targetTagId: number) => {
    if (mergeSourceId == null) return;
    await LegacyTagFrontendService.MergeTags(mergeSourceId, targetTagId);
    setMergeSourceId(null);
    await refresh();
  };

  return (
    <Layout.Main
      actionHeader={
        <>
          <Typography>Edit tags</Typography>
          <IconButton
            variant="outlined"
            color="primary"
            onClick={async () => {
              await LegacyTagFrontendService.CreateTopTag("New Tag");
              // todo: Update only added tag
              await refresh();
            }}
          >
            <Add />
          </IconButton>
        </>
      }
    >
      {!isTagLoaded && <Typography>Loading...</Typography>}
      {isTagLoaded && (
        <Box
          sx={{
            display: "flex",
            gap: 2,
            height: "100%",
            overflow: "hidden",
          }}
        >
          <Sheet
            variant="outlined"
            sx={{
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              p: 1,
              borderRadius: "sm",
            }}
          >
            <Stack spacing={1} sx={{ height: "100%" }}>
              <Input
                size="sm"
                placeholder="Search tags"
                startDecorator={<Search fontSize="small" />}
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
              />
              <Box sx={{ flex: 1, overflow: "auto" }}>
                <RichTreeView
                  expansionTrigger="content"
                  defaultExpandedItems={getDefaultExpandedItems()}
                  slots={{
                    // todo: RichTreeView doesn't allow to pass a type other than TreeItem2Props
                    item: ExplorerTreeItem as any,
                  }}
                  slotProps={{
                    item: {
                      addNewChild,
                      deleteItem: deleteTag,
                      mergeItem: (itemId: string) => {
                        setMergeSourceId(parseInt(itemId, 10));
                      },
                    } as ExplorerTreeItemProps,
                  }}
                  isItemEditable={() => true}
                  experimentalFeatures={{ labelEditing: true }}
                  items={treeItems}
                  onSelectedItemsChange={(
                    _event: React.SyntheticEvent,
                    itemId: string | null
                  ) => {
                    if (itemId == null || itemId === "0") {
                      setSelectedTagId(null);
                      return;
                    }
                    const parsed = parseInt(itemId, 10);
                    setSelectedTagId(Number.isNaN(parsed) ? null : parsed);
                  }}
                  onItemLabelChange={async (itemId, newLabel) => {
                    await LegacyTagFrontendService.UpdateName(
                      parseInt(itemId, 10),
                      newLabel
                    );
                    // todo: Update only changed tag
                    await refresh();
                  }}
                />
              </Box>
            </Stack>
          </Sheet>
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              py: 1,
            }}
          >
            {selectedTagId == null ? (
              <Typography level="body-md" sx={{ color: "text.secondary" }}>
                Select a tag to preview its images and folders.
              </Typography>
            ) : (
              <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
                <Box sx={{ flexShrink: 0 }}>
                  <Typography level="title-md" sx={{ mb: 1 }}>
                    Category
                  </Typography>
                  <Select
                    size="sm"
                    value={tags.find((t) => t.id === selectedTagId)?.category ?? ""}
                    onChange={async (_event, newValue) => {
                      if (selectedTagId == null) return;
                      await LegacyTagFrontendService.UpdateCategory(selectedTagId, newValue ?? "");
                      await refresh();
                    }}
                    sx={{ maxWidth: 200 }}
                  >
                    <Option value="">(uncategorized)</Option>
                    <Option value="character">Character</Option>
                  </Select>
                </Box>

                <Divider />

                <Box sx={{ flexShrink: 0, maxHeight: "50%", overflowY: "auto", minHeight: 0 }}>
                  <Typography level="title-md" sx={{ mb: 1 }}>
                    Folders with this tag
                  </Typography>
                  {previewDirectoryTreeItems.length === 0 ? (
                    <Typography
                      level="body-sm"
                      sx={{ color: "text.tertiary" }}
                    >
                      No folders.
                    </Typography>
                  ) : (
                    <RichTreeView
                      key={selectedTagId ?? "none"}
                      defaultExpandedItems={previewExpandedItems}
                      slots={{
                        // todo: RichTreeView doesn't allow to pass a type other than TreeItem2Props
                        item: ExplorerTreeItem as any,
                        expandIcon: (props) => (
                          <FolderIcon color="primary" {...props} />
                        ),
                        collapseIcon: (props) => (
                          <FolderOpenIcon color="primary" {...props} />
                        ),
                        endIcon: (props) => (
                          <FolderOpenIcon color="primary" {...props} />
                        ),
                      }}
                      slotProps={{
                        item: {
                          addNewChild: async () => {},
                        } as unknown as ExplorerTreeItemProps,
                      }}
                      items={previewDirectoryTreeItems}
                      onSelectedItemsChange={(_event, itemId) => {
                        if (!itemId) return;
                        navigate({
                          pathname: `/directories/${itemId}`,
                          search: searchParams.toString(),
                        });
                      }}
                    />
                  )}
                </Box>

                <Divider />

                <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                  <Typography level="title-md" sx={{ mb: 1 }}>
                    Images with this tag
                  </Typography>
                  {previewViewImages.length === 0 ? (
                    <Typography
                      level="body-sm"
                      sx={{ color: "text.tertiary" }}
                    >
                      No images.
                    </Typography>
                  ) : (
                    <Box sx={{ flex: 1, minHeight: 0, width: "100%" }}>
                      <ImageList
                        mode="view"
                        images={previewViewImages}
                        onChange={() => {}}
                        onView={(image) => setSelectedViewImageId(image.id)}
                      />
                    </Box>
                  )}
                </Box>
              </Stack>
            )}
          </Box>
        </Box>
      )}

      {selectedViewImageId != null && (
        <Modal open={true} onClose={() => setSelectedViewImageId(null)}>
          <ModalOverflow>
            <ModalDialog
              aria-labelledby="tag-preview-image-window"
              layout="fullscreen"
              sx={{ p: 0, m: 0 }}
            >
              <ImageWindow
                images={previewViewImages}
                initialId={selectedViewImageId}
              />
            </ModalDialog>
          </ModalOverflow>
        </Modal>
      )}

      {/* Merge target selection modal */}
      <Modal open={mergeSourceId != null} onClose={() => setMergeSourceId(null)}>
        <ModalDialog>
          <ModalClose />
          <Typography level="title-md">
            Merge &quot;{tags.find((t) => t.id === mergeSourceId)?.name}&quot; into:
          </Typography>
          <List
            sx={{
              maxHeight: 400,
              overflow: "auto",
            }}
          >
            {tags
              .filter((t) => t.id !== mergeSourceId)
              .map((tag) => (
                <ListItemButton
                  key={tag.id}
                  onClick={() => mergeTag(tag.id)}
                >
                  {tag.name}
                </ListItemButton>
              ))}
          </List>
        </ModalDialog>
      </Modal>
    </Layout.Main>
  );
};

export default TagsListPage;
