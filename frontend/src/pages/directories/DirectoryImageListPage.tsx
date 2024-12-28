import { FC, useEffect, useState } from "react";
import { useParams } from "react-router";
import { SearchService } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import ImageListMain, {
  ImageList,
  ViewImage,
} from "../../components/Images/ImageList";

const DirectoryImageListPage: FC = () => {
  const { directoryId } = useParams();

  const [images, setImages] = useState<ViewImage[]>([]);
  const [imageIdIndexes, setImageIdIndexes] = useState<{
    [key: number]: number;
  }>({});

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
    setImageIdIndexes(
      response.images.reduce((acc, image, index) => {
        acc[image.id] = index;
        return acc;
      }, {})
    );
  };

  useEffect(() => {
    if (directoryId) {
      readDirectory(directoryId);
    }
  }, [directoryId]);

  return (
    <ImageListMain images={images}>
      <ImageList
        images={images}
        onSelect={(selectedId) => {
          const index = imageIdIndexes[selectedId];
          images[index].selected = !images[index].selected;
          setImages([...images]);
        }}
      />
    </ImageListMain>
  );
};
export default DirectoryImageListPage;
