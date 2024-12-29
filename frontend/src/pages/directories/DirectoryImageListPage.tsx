import { FC, useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { SearchService } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import ImageListMain, {
  ImageList,
  ViewImage,
} from "../../components/Images/ImageList";

const DirectoryImageListPage: FC = () => {
  const { directoryId } = useParams();

  const [images, setImages] = useState<ViewImage[]>([]);

  const onSelect = useCallback((selectedId) => {
    // https://alexsidorenko.com/blog/react-list-rerender
    setImages((previousImages) =>
      previousImages.map((image) => {
        if (image.id !== selectedId) {
          return image;
        }

        return {
          ...image,
          selected: !image.selected,
        };
      })
    );
  }, []);

  console.debug("DirectoryImageListPage", {
    directoryId,
    images,
  });

  const readDirectory = async (directoryId: string) => {
    if (!directoryId) {
      return;
    }
    const response = await SearchService.SearchImages({
      directoryId: parseInt(directoryId, 10),
    });
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
    <ImageListMain images={images}>
      <ImageList images={images} onSelect={onSelect} />
    </ImageListMain>
  );
};
export default DirectoryImageListPage;
