import List from "@mui/joy/List";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import ListItemContent from "@mui/joy/ListItemContent";
import ListItemDecorator from "@mui/joy/ListItemDecorator";
import ListSubheader from "@mui/joy/ListSubheader";
import * as React from "react";

import * as Icons from "@mui/icons-material";
import { NavLink, useLocation } from "react-router";

export enum Menu {
  Series = "Series",
  Search = "Search",

  Directories = "Directories",
  Tags = "List",
}

const Navigation: React.FC = () => {
  const location = useLocation();

  const menus = [
    {
      text: "Menu",
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
        {
          id: Menu.Directories,
          text: "Directories",
          icon: <Icons.Folder color="primary" />,
          url: "/directories/edit",
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
                    selected={location.pathname == menuItem.url}
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
