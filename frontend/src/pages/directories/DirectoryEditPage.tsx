import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { Button, Typography } from "@mui/joy";
import { RichTreeView } from "@mui/x-tree-view";
import { FC, useEffect, useState } from "react";
import { createSearchParams, useNavigate, useSearchParams } from "react-router";
import {
  BatchImportImageService,
  Directory,
  DirectoryService,
  Tag,
  TagService,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import {
  directoryToTreeViewBaseItems,
  getDefaultExpandedItems,
  getDirectoryMap,
} from "../../components/DirectoryExplorer";
import {
  ExplorerTreeItem,
  ExplorerTreeItemProps,
} from "../../components/ExplorerTreeItem";
import ModeButtons from "../../components/ModeButtons";
import SelectDirectoryExplorer from "../../components/SelectDirectoryExplorer";
import Layout from "../../Layout";

type Mode = "edit" | "selectTags";

interface Request {
  mode: Mode;
  selectedDirectoryIds: number[];
}

function useRequest(): Request {
  const [searchParams] = useSearchParams();
  let params: Request = {
    mode: "edit",
    selectedDirectoryIds: [],
  };
  if (searchParams.has("mode")) {
    params.mode = searchParams.get("mode") as Mode;
  }
  if (searchParams.has("directoryIds")) {
    params.selectedDirectoryIds = searchParams
      .getAll("directoryIds")
      .map((id) => parseInt(id));
  }

  return params as Request;
}

const DirectoryEditPage: FC = () => {
  const request = useRequest();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(request.mode);
  const [rootDirectory, setRootDirectory] = useState<Directory>();
  const [allTagMap, setAllTagMap] = useState<{ [id: number]: Tag }>({});
  const [directoryMap, setDirectoryMap] = useState<{
    [id: number]: Directory;
  }>({});
  const [directoryIds, setDirectoriesIds] = useState<number[]>(
    request.selectedDirectoryIds
  );
  const [directoryTagMap, setDirectoryTagMap] = useState<{
    [id: number]: number[];
  }>({});

  function onSelect(directoryIds: number[]) {
    setDirectoriesIds(directoryIds);
    updatePage(mode, directoryIds);
  }

  useEffect(() => {
    refresh();
  }, []);

  function updatePage(mode: Mode, directoryIds: number[]) {
    navigate(
      {
        search: createSearchParams({
          mode,
          directoryIds: directoryIds.map((id) => id.toString()),
        }).toString(),
      },
      {
        replace: true,
      }
    );
  }

  async function refresh() {
    TagService.ReadAllMap().then((tagMap) => {
      setAllTagMap(tagMap);
    });

    const { rootDirectory, tagMap } =
      await DirectoryService.ReadDirectoryTree();
    setRootDirectory(rootDirectory);
    setDirectoryMap(getDirectoryMap(rootDirectory));
    setDirectoryTagMap(tagMap);
  }

  if (!rootDirectory) {
    return <Typography>Loading...</Typography>;
  }

  const newDirectoryName = "New Directory";
  return (
    <Layout.Main
      actionHeader={
        <>
          <ModeButtons
            onChange={(newMode) => {
              setMode(newMode);
              updatePage(newMode, directoryIds);
            }}
            defaultMode={mode}
            enabledModes={[
              { value: "edit", text: "Edit" },
              { value: "selectTags", text: "Select tags" },
            ]}
          />
          <Button
            variant="outlined"
            disabled={mode != "selectTags" || directoryIds.length === 0}
            onClick={() => {
              const searchParams = createSearchParams({
                directoryIds: directoryIds.join(","),
              }).toString();
              navigate({
                pathname: "/directories/tags/edit",
                search: `?${searchParams}`,
              });
            }}
          >
            Edit tags
          </Button>
        </>
      }
    >
      {mode === "edit" && (
        <RichTreeView
          expansionTrigger="content"
          defaultExpandedItems={getDefaultExpandedItems([], directoryMap)}
          slots={{
            // todo: RichTreeView doesn't allow to pass a type other than TreeItem2Props
            item: ExplorerTreeItem as any,
            expandIcon: (props) => <FolderIcon color="primary" {...props} />,
            collapseIcon: (props) => (
              <FolderOpenIcon color="primary" {...props} />
            ),
            endIcon: (props) => <FolderOpenIcon color="primary" {...props} />,
          }}
          slotProps={{
            item: {
              addNewChild: async (parentID: string) => {
                await DirectoryService.CreateDirectory(
                  newDirectoryName,
                  parseInt(parentID, 10)
                );
                await refresh();
              },
              importImages: async (parentID: string) => {
                await BatchImportImageService.ImportImages(
                  parseInt(parentID, 10)
                );
                await refresh();
              },
            } as ExplorerTreeItemProps,
          }}
          items={[
            directoryToTreeViewBaseItems(
              rootDirectory,
              allTagMap,
              directoryTagMap
            ),
          ]}
          isItemEditable={() => true}
          experimentalFeatures={{ labelEditing: true }}
          onItemLabelChange={async (itemId, newLabel) => {
            const directoryID = parseInt(itemId, 10);
            console.debug("DirectoryExplorer.onItemLabelChange", {
              directoryID,
              newLabel,
            });
            await DirectoryService.UpdateName(directoryID, newLabel);
            await refresh();
            // The label doesn't add a child tag correctly
          }}
        />
      )}
      {mode === "selectTags" && (
        <SelectDirectoryExplorer
          selectedDirectoryIds={directoryIds}
          isMultiSelect={true}
          onSelect={onSelect}
        />
      )}
    </Layout.Main>
  );
};

export default DirectoryEditPage;
