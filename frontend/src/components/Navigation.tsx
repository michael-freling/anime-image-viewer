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
  SeriesByTags = "Tags",
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
          id: Menu.SeriesByTags,
          text: "Search by tags",
          icon: <Icons.Bookmarks />,
          url: "/tags",
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
    <List size="sm">
      {menus.map((menu, index) => (
        <ListItem key={index} nested sx={{ mt: 2 }}>
          <ListSubheader sx={{ letterSpacing: "2px", fontWeight: "800" }}>
            {menu.text}
          </ListSubheader>
          <List aria-labelledby="nav-list-tags" size="sm">
            {menu.menuItems.map((menuItem, index) => (
              <ListItem key={index}>
                <NavLink
                  to={menuItem.url}
                  style={{ textDecoration: "none" }}
                  viewTransition
                >
                  <ListItemButton
                    selected={selectedMenu === menuItem.id}
                    onClick={() => {
                      selectMenu(menuItem.id);
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
