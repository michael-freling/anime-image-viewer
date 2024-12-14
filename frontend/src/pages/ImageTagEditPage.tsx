import { Box, Button, Stack, Typography } from "@mui/joy";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { TagService } from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import TagExplorer from "../components/TagExplorer";

const ImageTagEditPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const imageIdsStr = searchParams.get("imageIds") || "";
  const imageIds = imageIdsStr.split(",").map((id) => parseInt(id));

  const [addedTagIds, setAddedTagIds] = useState<number[]>([]);
  const [deletedTagIds, setDeletedTagIds] = useState<number[]>([]);

  const updateImageTags = async () => {
    await TagService.BatchUpdateTagsForFiles(
      imageIds,
      addedTagIds,
      deletedTagIds
    );
    navigate(-1);
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minHeight: "100%",
      }}
    >
      <Typography>Select tags for {imageIds.length} images</Typography>
      <TagExplorer
        selectable={true}
        fileIds={imageIds}
        onSelect={(addedTagIds, deletedTagIds) => {
          setAddedTagIds(addedTagIds);
          setDeletedTagIds(deletedTagIds);
        }}
      />

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
    </Box>
  );
};
export default ImageTagEditPage;
