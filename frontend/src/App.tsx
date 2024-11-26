import { useEffect } from "react";
import Grid from "@mui/material/Grid2";
import DirectoryExplorer from "./DirectoryExplorer";

function App() {
  useEffect(() => {
    // Reload WML so it picks up the wml tags
    // WML.Reload();
  }, []);

  return (
    <Grid container spacing={2}>
      <Grid>
        <DirectoryExplorer />
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
