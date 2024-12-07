import { Box, Button, Stack, Typography } from "@mui/joy";
import { useSearchParams } from "react-router";
import TagExplorer from "../components/TagExplorer";
import { useState } from "react";

const ImageTagEditPage = () => {
  const [searchParams] = useSearchParams();
  const imageIdsStr = searchParams.get("imageIds") || "";
  const imageIds = imageIdsStr.split(",");

  const [tagIds, setTagIds] = useState<number[]>([]);

  console.debug("ImageTagEditPage", {
    imageIdsStr,
    imageIds,
    searchParams: searchParams.toString(),
  });

  const updateImageTags = async () => {
    console.debug("updateImageTags", { imageIds, tagIds });
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
      <Typography>Select tags</Typography>
      <TagExplorer
        selectable={true}
        onSelect={(tagIds) => {
          setTagIds({ ...tagIds });
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
