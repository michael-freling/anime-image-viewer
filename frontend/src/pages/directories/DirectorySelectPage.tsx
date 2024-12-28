// TreeView hasn't been supported by a Joy UI yet: https://github.com/mui/mui-x/issues/14687
import { Button, Typography } from "@mui/joy";
import { FC, useState } from "react";
import { createSearchParams, useNavigate } from "react-router";
import SelectDirectoryExplorer from "../../components/SelectDirectoryExplorer";
import Layout from "../../Layout";

const DirectorySelectPage: FC = () => {
  const navigate = useNavigate();
  const [directoriesIds, setDirectoriesIds] = useState<number[]>([]);

  function onSelect(directoryIds: number[]) {
    setDirectoriesIds(directoryIds);
  }

  return (
    <Layout.Main
      actionHeader={
        <>
          <Typography>Select directories to update tags</Typography>
          <Button
            variant="outlined"
            disabled={directoriesIds.length === 0}
            onClick={() => {
              const searchParams = createSearchParams({
                directoryIds: directoriesIds.join(","),
              }).toString();
              navigate({
                pathname: "/directories/tags/edit",
                search: `?${searchParams}`,
              });
            }}
          >
            Edit tags
          </Button>
        </>
      }
    >
      <SelectDirectoryExplorer isMultiSelect={true} onSelect={onSelect} />
    </Layout.Main>
  );
};
export default DirectorySelectPage;
