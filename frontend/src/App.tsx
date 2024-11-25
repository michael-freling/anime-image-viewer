import { useState, useEffect } from "react";
import { Service } from "../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import Grid from "@mui/material/Grid2";
import DirectoryExplorer from "./DirectoryExplorer";

function App() {
  const [rootDirectory, setRootDirectory] = useState<string>("");

  useEffect(() => {
    Service.ReadInitialDirectory().then(async (directory) => {
      setRootDirectory(directory);
    });
    // Reload WML so it picks up the wml tags
    // WML.Reload();
  }, []);

  return (
    <Grid container spacing={2}>
      <Grid>
        <DirectoryExplorer root={rootDirectory} />
      </Grid>
      <Grid>
        <h1></h1>
        <div className="result">Result</div>
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
