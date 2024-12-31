import { Events } from "@wailsio/runtime";
import { createContext, useContext, useEffect, useState } from "react";

interface importProgressEvent {
  total: number;
  completed: number;
  failed: number;
  failures: {
    path: string;
    error: string;
  }[];
}

const initialProgress: importProgressEvent = {
  total: 0,
  completed: 0,
  failed: 0,
  failures: [],
};

const ImportImagesContext = createContext<importProgressEvent>(initialProgress);

export const ImportImageProgressProvider = ({ children }) => {
  const [importProgress, setImportProgress] = useState(initialProgress);

  useEffect(() => {
    Events.On(
      "ImportImages:progress",
      function (progress: { name: string; data: importProgressEvent[] }) {
        console.debug("ImportImages:progress", progress);
        const dataCount = progress.data.length;
        setImportProgress(progress.data[dataCount - 1]);
      }
    );
    return () => {
      Events.Off("ImportImages:progress");
    };
  }, []);

  return (
    <ImportImagesContext.Provider value={importProgress}>
      {children}
    </ImportImagesContext.Provider>
  );
};

export const useImportImageProgress: () => importProgressEvent = () => {
  return useContext<importProgressEvent>(ImportImagesContext);
};
