import { FC, useEffect, useState } from "react";
import { useParams } from "react-router";
import {
  Image,
  SearchService,
} from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/frontend";
import ImageListMain from "../../components/Images/ImageList";

const DirectoryImageListPage: FC = () => {
  const { directoryId } = useParams();
  const [images, setImages] = useState<Image[]>([]);

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

  return <ImageListMain loadedImages={images} />;
};
export default DirectoryImageListPage;
