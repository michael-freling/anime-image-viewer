import { Button, Typography } from "@mui/joy";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { TagFrontendService } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/tag";
import SelectTagExplorer from "../../components/SelectTagExplorer";
import Layout from "../../Layout";

const DirectoryTagsEditPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const directoryIdStr = searchParams.get("directoryIds") || "";
  const directoryIds = directoryIdStr.split(",").map((id) => parseInt(id));

  const [addedTagIds, setAddedTagIds] = useState<number[]>([]);
  const [deletedTagIds, setDeletedTagIds] = useState<number[]>([]);

  const updateImageTags = async () => {
    await TagFrontendService.BatchUpdateTagsForFiles(
      directoryIds,
      addedTagIds,
      deletedTagIds
    );
    navigate(-1);
  };

  return (
    <Layout.Main
      actionHeader={
        <>
          <Typography>
            Select tags for {directoryIds.length} directories
          </Typography>
          <Button
            color="primary"
            onClick={() => {
              updateImageTags();
            }}
          >
            Update
          </Button>
        </>
      }
    >
      <SelectTagExplorer
        isMultiSelect={true}
        fileIds={directoryIds}
        onSelect={(addedTagIds, deletedTagIds) => {
          setAddedTagIds(addedTagIds);
          setDeletedTagIds(deletedTagIds);
        }}
      />
    </Layout.Main>
  );
};
export default DirectoryTagsEditPage;
