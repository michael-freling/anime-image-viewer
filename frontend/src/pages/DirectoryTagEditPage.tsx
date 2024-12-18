import { Box, Button, Stack, Typography } from "@mui/joy";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { TagService } from "../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import TagExplorer from "../components/TagExplorer";

const DirectoryTagsEditPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const directoryIdStr = searchParams.get("directoryIds") || "";
  const directoryIds = directoryIdStr.split(",").map((id) => parseInt(id));

  const [addedTagIds, setAddedTagIds] = useState<number[]>([]);
  const [deletedTagIds, setDeletedTagIds] = useState<number[]>([]);

  const updateImageTags = async () => {
    await TagService.BatchUpdateTagsForFiles(
      directoryIds,
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
      <Typography>Select tags for {directoryIds.length} directories</Typography>
      <TagExplorer
        selectable={true}
        fileIds={directoryIds}
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
export default DirectoryTagsEditPage;
