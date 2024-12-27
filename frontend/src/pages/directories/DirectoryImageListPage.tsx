import { Box } from "@mui/joy";
import { FC, useEffect, useState } from "react";
import { useParams } from "react-router";
import { SearchService } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import ImageList, { ImageListType } from "../../components/Images/ImageList";

const DirectoryImageListPage: FC = () => {
  const { directoryId } = useParams();

  const [images, setImages] = useState<ImageListType>([]);

  console.debug("DirectoryImageListPage", {
    directoryId,
    images,
  });

  const readDirectory = async (directoryId: string) => {
    if (!directoryId) {
      return;
    }
    const response = await SearchService.SearchImageFilesInDirectory(
      parseInt(directoryId, 10)
    );
    setImages([
      ...response.images.map((image) => ({
        ...image,
        selected: false,
      })),
    ]);
  };

  useEffect(() => {
    if (directoryId) {
      readDirectory(directoryId);
    }
  }, [directoryId]);

  return (
    <Box
      sx={{
        gap: 1,
      }}
    >
      <ImageList
        images={images}
        onSelect={(index) => {
          images[index].selected = !images[index].selected;
          setImages([...images]);
        }}
      />
    </Box>
  );
};
export default DirectoryImageListPage;
