import * as React from "react";
import List from "@mui/joy/List";
import ListSubheader from "@mui/joy/ListSubheader";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import ListItemDecorator from "@mui/joy/ListItemDecorator";
import ListItemContent from "@mui/joy/ListItemContent";

import * as Icons from "@mui/icons-material";

export enum Menu {
  Series = "Series",
  SeriesByTags = "Tags",
  Directories = "Directories",
  Tags = "List",
}

export interface NavigationProps {
  selectedMenu: Menu;
  selectMenu: (menu: Menu) => void;
}

const Navigation: React.FC<NavigationProps> = ({
  selectedMenu,
  selectMenu,
}) => {
  const menus = [
    {
      text: "Anime",
      menuItems: [
        {
          id: Menu.Series,
          text: "Series",
          icon: <Icons.Tv />,
        },
        {
          id: Menu.SeriesByTags,
          text: "Search by tags",
          icon: <Icons.Bookmarks />,
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
        },
        {
          id: Menu.Tags,
          text: "Tags",
          icon: <Icons.Bookmarks />,
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
                <ListItemButton
                  selected={selectedMenu === menuItem.id}
                  onClick={() => {
                    selectMenu(menuItem.id);
                  }}
                >
                  <ListItemDecorator>{menuItem.icon}</ListItemDecorator>
                  <ListItemContent>{menuItem.text}</ListItemContent>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </ListItem>
      ))}
    </List>
  );
};

export default Navigation;
