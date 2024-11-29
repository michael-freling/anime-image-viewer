import * as React from "react";
import List from "@mui/joy/List";
import ListSubheader from "@mui/joy/ListSubheader";
import ListItem from "@mui/joy/ListItem";
import ListItemButton from "@mui/joy/ListItemButton";
import ListItemDecorator from "@mui/joy/ListItemDecorator";
import ListItemContent from "@mui/joy/ListItemContent";

import * as Icons from "@mui/icons-material";

const Navigation: React.FC<{}> = () => {
  const menus = [
    {
      text: "Series",
      icon: <Icons.Tv />,
    },
    {
      text: "Tags",
      icon: <Icons.Bookmarks />,
    },
  ];

  return (
    <List size="sm">
      <ListItem nested sx={{ mt: 2 }}>
        <ListSubheader sx={{ letterSpacing: "2px", fontWeight: "800" }}>
          Anime
        </ListSubheader>
        <List aria-labelledby="nav-list-tags" size="sm">
          {menus.map((menu, index) => (
            <ListItem key={index}>
              <ListItemButton>
                <ListItemDecorator>{menu.icon}</ListItemDecorator>
                <ListItemContent>{menu.text}</ListItemContent>
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </ListItem>
    </List>
  );
};

export default Navigation;
