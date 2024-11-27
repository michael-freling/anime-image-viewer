import { useEffect, useState } from "react";
import Grid from "@mui/material/Grid2";
import DirectoryExplorer from "./DirectoryExplorer";
import {
  ImageFile,
  Service,
} from "../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import { ImageList, ImageListItem } from "@mui/material";

export interface UserImages {
  userImages: ImageFile[];
}

function App() {
  const [images, setImages] = useState<UserImages>({
    userImages: [],
  });

  useEffect(() => {
    // Reload WML so it picks up the wml tags
    // WML.Reload();
  }, []);

  const handleDirectory = async (directory) => {
    const images = await Service.ReadImageFiles(directory);
    setImages({
      userImages: images,
    });
  };

  return (
    <Grid container spacing={2}>
      <Grid size={2}>
        <DirectoryExplorer selectDirectory={handleDirectory} />
      </Grid>
      <Grid size={8}>
        <h1></h1>
        <ImageList sx={{ width: "100%" }} cols={5}>
          {images.userImages.map((userImage) => (
            <ImageListItem
              key={userImage.Path}
              style={{
                width: "100%",
                height: "auto",
              }}
            >
              <img
                src={userImage.Path}
                style={{
                  width: "100%",
                  height: "auto",
                }}
              />
            </ImageListItem>
          ))}
        </ImageList>
        <div className="card">
          <div></div>
        </div>
        <div className="footer">
          <div>
            <p>Footer</p>
          </div>
        </div>
      </Grid>
    </Grid>
  );
}

export default App;
