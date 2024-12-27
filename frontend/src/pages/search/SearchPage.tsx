import Layout from "../../Layout";
import {
  Accordion,
  AccordionDetails,
  AccordionGroup,
  AccordionSummary,
  Avatar,
  Box,
  ListItemContent,
  Stack,
  Switch,
  Typography,
} from "@mui/joy";
import { FC, useState } from "react";
import { Bookmark, Folder } from "@mui/icons-material";
import { Directory } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/image";
import { Tag } from "../../../bindings/github.com/michael-freling/anime-image-viewer/internal/tag";
import SelectDirectoryExplorer from "../../components/SelectDirectoryExplorer";
import SelectTagExplorer from "../../components/SelectTagExplorer";

interface SearchSidebarProps {
  onSelect(directoryId: number, tagId: number): void;
}

const SearchSidebar: FC<SearchSidebarProps> = ({ onSelect }) => {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [tag, setTag] = useState<Tag | null>();

  return (
    <AccordionGroup>
      <Accordion defaultExpanded={true}>
        <AccordionSummary>
          <Avatar color="primary">
            <Folder />
          </Avatar>
          <ListItemContent>
            <Typography level="title-md">Directory</Typography>
            <Typography level="body-sm">
              {directory == null ? "Not selected" : directory.name}
            </Typography>
          </ListItemContent>
        </AccordionSummary>
        <AccordionDetails>
          <Box
            sx={{
              mt: -1,
              ml: -2,
              mr: -2,
              p: 1,
              height: "100%",
            }}
          >
            <SelectDirectoryExplorer
              isMultiSelect={false}
              onSelect={(directory) => {
                setDirectory(directory);
                onSelect(directory?.id ?? 0, tag?.id ?? 0);
              }}
            />
          </Box>
        </AccordionDetails>
      </Accordion>
      <Accordion defaultExpanded={true}>
        <AccordionSummary>
          <Avatar color="primary">
            <Bookmark />
          </Avatar>
          <ListItemContent>
            <Typography level="title-md">Tags</Typography>
            <Typography level="body-sm">
              {tag == null ? "Not selected" : tag.full_name}
            </Typography>
          </ListItemContent>
        </AccordionSummary>
        <AccordionDetails>
          <Box
            sx={{
              mt: -1,
              ml: -2,
              mr: -2,
              p: 1,
              height: "100%",
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ m: 1, mb: 2 }}
            >
              <Typography>Search images without tags</Typography>
              <Switch />
            </Stack>
            <SelectTagExplorer
              isMultiSelect={false}
              onSelect={(tag: Tag | null) => {
                setTag(tag);
                onSelect(directory?.id ?? 0, tag?.id ?? 0);
              }}
            />
          </Box>
        </AccordionDetails>
      </Accordion>
    </AccordionGroup>
  );
};

const SearchPage: FC = () => {
  const [, setImages] = useState({
    userImages: [],
  });

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          sm: "minmax(450px, 1fr)",
          md: "minmax(240px, 320px) minmax(500px, 1fr)",
        },
        gridTemplateRows: "64px 1fr",
      }}
    >
      <Layout.SideNav
        sx={{
          borderRight: "1px solid",
          borderColor: "divider",
          height: "95vh",
          overflowY: "auto",
        }}
      >
        <SearchSidebar
          onSelect={(directoryId: number, tagId: number) => {
            console.debug("SearchSidebar", {
              directoryId,
              tagId,
            });
            setImages({
              userImages: [],
            });
          }}
        />
      </Layout.SideNav>
      <Layout.Main>
        <h1>Search</h1>
      </Layout.Main>
    </Box>
  );
};
export default SearchPage;
