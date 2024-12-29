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
import { ImageFile } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import {
  Tag,
  TagSuggestion,
  TagFrontendService,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/tag";
import { ImageService } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import Layout from "../../Layout";

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
  const [isSubmitted, setSubmitted] = useState<boolean>(false);

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

    ImageService.ReadImagesByIDs(imageFileIds).then((response) => {
      const imageFiles = imageFileIds.map((id) => response[id]);
      setImageFiles(imageFiles);
      setTagSuggestions(
        imageFileIds.reduce((acc, id) => {
          acc[id] = [];
          return acc;
        }, {} as { [id: number]: TagSuggestion[] })
      );
    });
    TagFrontendService.SuggestTags(imageFileIds)
      .then((response) => {
        // it's too slow to show image files from a suggestion's result
        // setImageFiles(response.imageFiles);
        setTagSuggestions(response.suggestions);
        setTags(response.allTags);
      })
      .catch((error) => {
        setError(error);
      });
  }, [searchParams]);

  function handleSubmit() {
    setSubmitted(true);

    try {
      let selectedTags: { [id: number]: number[] } = {};
      for (const image of imageFiles) {
        let tags: number[] = [];
        for (const suggestion of tagSuggestions[image.id]) {
          if (suggestion.hasTag) {
            continue;
          }
          if (suggestion.hasDescendantTag) {
            continue;
          }
          if (suggestion.score * 100 < selectedScore) {
            continue;
          }

          tags.push(suggestion.tagId);
        }
        selectedTags[image.id] = tags;
      }

      TagFrontendService.AddSuggestedTags({
        selectedTags,
      });

      navigate(-1);
    } finally {
      setSubmitted(false);
    }
  }

  if (error) {
    return <Box>{error.message}</Box>;
  }

  const cardHeight = 320;
  const cardWidth = (cardHeight * 16) / 9;
  return (
    <Layout.Main
      actionHeader={
        <>
          <Button color="primary" onClick={handleSubmit} disabled={isSubmitted}>
            Submit
          </Button>
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
        </>
      }
    >
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
              height: cardHeight,
              gap: 2,
              marginBottom: 1,
            }}
          >
            <CardOverflow sx={{ width: cardWidth }}>
              <LazyImage src={image.path} width={cardWidth} />
            </CardOverflow>
            <CardOverflow
              sx={{
                display: "flex",
                gap: 1,
                height: "100%",
                overflowY: "auto",
              }}
            >
              {tagSuggestions[image.id].map((suggestion) => {
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

              {tagSuggestions[image.id].map((suggestion) => {
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
    </Layout.Main>
  );
};
export default ImageTagSuggestionPage;
