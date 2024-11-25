import { useState, useEffect } from 'react'
import {FileInfo, Service} from "../bindings/github.com/michael-freling/anime-image-viewer/internal/image";

function App() {
  const [rootDirectory, setRootDirectory] = useState<string>('');
  const [files, setFiles] = useState<FileInfo[]>([]);

  async function readFiles(path: string) {
    const files = await Service.ReadDirectory(path)
    setFiles(files);
  }

  useEffect(() => {
    Service.ReadInitialDirectory()
      .then(async (directory) => {
        setRootDirectory(directory);
        await readFiles(directory)
      });
    // Reload WML so it picks up the wml tags
    // WML.Reload();
  }, []);

  return (
    <div className="container">
      <h1></h1>
      <div className="result">Result</div>
      <div className="card">
        <ul>
            {rootDirectory}
            {files.map((file) =>
                <li>
                    {file.IsDirectory && <span>📁</span>}
                    {file.Name}
                </li>
            )}
        </ul>
        <div></div>

      </div>
      <div className="footer">
        <div><p>Footer</p></div>
      </div>
    </div>
  )
}

export default App
