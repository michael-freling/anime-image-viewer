import "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Toolbar from "@mui/material/Toolbar";
import List from "@mui/material/List";
import Divider from "@mui/material/Divider";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import * as Icons from "@mui/icons-material";
import React from "react";

const Navigation: React.FC<{ drawerWidth: number }> = ({ drawerWidth }) => {
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
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
          width: drawerWidth,
          boxSizing: "border-box",
        },
      }}
    >
      <Toolbar />
      <Box sx={{ overflow: "auto" }}>
        <List>
          {menus.map((menu, index) => (
            <ListItem key={index} disablePadding>
              <ListItemButton>
                <ListItemIcon>{menu.icon}</ListItemIcon>
                <ListItemText primary={menu.text} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        <Divider />
      </Box>
    </Drawer>
  );
};

export default Navigation;
