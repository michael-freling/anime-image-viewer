import { Button, Stack, Typography } from "@mui/joy";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { TagFrontendService } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/tag";
import SelectTagExplorer from "../../components/SelectTagExplorer";
import Layout from "../../Layout";

const ImageTagEditPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const imageIds = searchParams.getAll("imageIds").map((id) => parseInt(id));

  const [addedTagIds, setAddedTagIds] = useState<number[]>([]);
  const [deletedTagIds, setDeletedTagIds] = useState<number[]>([]);

  const updateImageTags = async () => {
    await TagFrontendService.BatchUpdateTagsForFiles(
      imageIds,
      addedTagIds,
      deletedTagIds
    );
    navigate(-1);
  };

  return (
    <Layout.Main
      actionHeader={
        <>
          <Typography>Select tags for {imageIds.length} images</Typography>
          <Stack direction="row" spacing={2}>
            <Button
              color="primary"
              onClick={() => {
                updateImageTags();
              }}
            >
              Update
            </Button>
          </Stack>
        </>
      }
    >
      <SelectTagExplorer
        isMultiSelect={true}
        fileIds={imageIds}
        onSelect={(addedTagIds, deletedTagIds) => {
          setAddedTagIds(addedTagIds);
          setDeletedTagIds(deletedTagIds);
        }}
      />
    </Layout.Main>
  );
};
export default ImageTagEditPage;
