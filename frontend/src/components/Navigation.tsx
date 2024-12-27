import * as React from "react";
import List from "@mui/joy/List";
import ListSubheader from "@mui/joy/ListSubheader";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import ListItemDecorator from "@mui/joy/ListItemDecorator";
import ListItemContent from "@mui/joy/ListItemContent";

import * as Icons from "@mui/icons-material";
import { NavLink } from "react-router";

export enum Menu {
  Series = "Series",
  Search = "Search",

  Directories = "Directories",
  TagsForDirectories = "TagsForDirectories",
  Tags = "List",
}

const Navigation: React.FC = () => {
  const [selectedMenu, selectMenu] = React.useState<Menu>(Menu.Series);

  const menus = [
    {
      text: "Anime",
      menuItems: [
        {
          id: Menu.Series,
          text: "Series",
          icon: <Icons.Tv />,
          url: "/",
        },
        {
          id: Menu.Search,
          text: "Search",
          icon: <Icons.Search />,
          url: "/search",
        },
      ],
    },
    {
      text: "Manage images",
      menuItems: [
        {
          id: Menu.Directories,
          text: "Images",
          icon: <Icons.Folder color="primary" />,
          url: "/directories/edit",
        },
        {
          id: Menu.TagsForDirectories,
          text: "Tags for directories",
          icon: <Icons.SnippetFolder color="primary" />,
          url: "/directories/tags/select",
        },

        {
          id: Menu.Tags,
          text: "Tags",
          icon: <Icons.Bookmarks />,
          url: "/tags/edit",
        },
      ],
    },
  ];

  return (
    <List sx={{ width: "100%" }}>
      {menus.map((menu, index) => (
        <ListItem key={index} nested sx={{ p: 0, width: "inherit" }}>
          <ListSubheader
            sx={{
              letterSpacing: "2px",
              fontWeight: "800",
              pl: 3,
            }}
          >
            {menu.text}
          </ListSubheader>
          <List aria-labelledby="nav-list-tags" sx={{ m: 0, width: "inherit" }}>
            {menu.menuItems.map((menuItem, index) => (
              <ListItem key={index} sx={{ p: 0, width: "inherit" }}>
                <NavLink
                  to={menuItem.url}
                  style={{ textDecoration: "none", width: "inherit" }}
                  viewTransition
                >
                  <ListItemButton
                    selected={selectedMenu === menuItem.id}
                    onClick={() => {
                      selectMenu(menuItem.id);
                    }}
                    sx={{
                      m: 0,
                      p: 1,
                      pl: 2,
                      width: "inherit",
                    }}
                  >
                    <ListItemDecorator>{menuItem.icon}</ListItemDecorator>
                    <ListItemContent>{menuItem.text}</ListItemContent>
                  </ListItemButton>
                </NavLink>
              </ListItem>
            ))}
          </List>
        </ListItem>
      ))}
    </List>
  );
};

export default Navigation;
