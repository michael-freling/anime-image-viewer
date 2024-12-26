import {
  Box,
  Button,
  Card,
  CardOverflow,
  Chip,
  Divider,
  Slider,
  Stack,
  Typography,
} from "@mui/joy";
import { useNavigate, useSearchParams } from "react-router";
import LazyImage from "../../components/LazyImage";
import { useEffect, useState } from "react";
import {
  ImageFile,
  Tag,
  TagSuggestion,
  TagSuggestionService,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";

const ImageTagSuggestionPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const imageFileIdStr = searchParams.get("imageIds") || "";
  const [selectedScore, setSelectedScore] = useState<number>(50);
  const imageFileIds = imageFileIdStr.split(",").map((id) => parseInt(id));

  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<{
    [id: number]: TagSuggestion[];
  }>([]);
  const [tags, setTags] = useState<{ [id: number]: Tag }>({});

  const [error, setError] = useState<Error | null>(null);

  console.debug("ImageTagSuggestionPage", {
    imageFileIds,
    selectedScore,
    imageFiles,
  });
  useEffect(() => {
    if (imageFileIds.length === 0) {
      return;
    }
    if (error) {
      return;
    }

    TagSuggestionService.SuggestTags(imageFileIds)
      .then((response) => {
        setImageFiles(response.imageFiles);
        setTagSuggestions(response.suggestions);
        setTags(response.allTags);
      })
      .catch((error) => {
        setError(error);
      });
  }, [searchParams, selectedScore]);

  if (error) {
    return <Box>{error.message}</Box>;
  }

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        divider={<Divider orientation="vertical" />}
      >
        <Button
          color="primary"
          onClick={() => {
            // todo: make sure it doesn't cause a problem
            navigate(-1);
          }}
        >
          Submit
        </Button>
        <Stack direction="row" spacing={2} alignItems="center" flexGrow={1}>
          <Typography width={100}>Match rate</Typography>
          <Slider
            color="primary"
            value={selectedScore}
            valueLabelDisplay="auto"
            min={0}
            max={100}
            step={1}
            onChange={(event, value) => {
              setSelectedScore(value as number);
            }}
            sx={{ flexGrow: 1 }}
          />
        </Stack>
      </Stack>

      {/* Grid component doesn't work https://github.com/mui/material-ui/issues/44102 */}
      <Stack
        spacing={1}
        direction="row"
        useFlexGap
        sx={{ flexWrap: "wrap", minWidth: 0 }}
      >
        {imageFiles.map((image, index) => (
          <Card
            key={index}
            size="sm"
            sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              height: 150,
              gap: 2,
              marginBottom: 1,
            }}
          >
            <CardOverflow sx={{ width: 240 }}>
              <LazyImage src={image.Path} />
            </CardOverflow>
            <CardOverflow
              sx={{
                display: "flex",
                gap: 1,
                height: "100%",
                overflowY: "auto",
              }}
            >
              {tagSuggestions[image.ID].map((suggestion) => {
                const tagId = suggestion.tagId;
                if (!(tagId in tags)) {
                  return null;
                }
                if (!suggestion.hasTag) {
                  return null;
                }

                return (
                  <Chip key={tagId} color="primary">
                    {tags[tagId].full_name}
                  </Chip>
                );
              })}
              <Divider orientation="horizontal" />

              {tagSuggestions[image.ID].map((suggestion) => {
                const tagId = suggestion.tagId;
                if (!(tagId in tags)) {
                  return null;
                }
                if (suggestion.hasTag || suggestion.hasDescendantTag) {
                  return null;
                }
                const score = suggestion.score * 100;

                const disabled = score < selectedScore;
                const color = disabled ? "neutral" : "success";
                return (
                  <Chip key={tagId} color={color} disabled={disabled}>
                    {tags[tagId].full_name} ({score.toFixed(0)}%)
                  </Chip>
                );
              })}
            </CardOverflow>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
};
export default ImageTagSuggestionPage;
