// https://github.com/mui/material-ui/blob/d0a59894122d209958beda64e17f5987fef141b2/docs/data/joy/getting-started/templates/files/components/Layout.tsx
import * as React from "react";
import Box, { BoxProps } from "@mui/joy/Box";
import Sheet from "@mui/joy/Sheet";

interface RootProps extends BoxProps {
  columnCount: number;
}

function Root({ columnCount, ...props }: RootProps) {
  const gridTemplateColumns = {
    2: {
      xs: "1fr",
      sm: "minmax(64px, 200px) minmax(450px, 1fr)",
      md: "minmax(100px, 160px) minmax(500px, 1fr)",
    },
    3: {
      xs: "1fr",
      sm: "minmax(64px, 200px) minmax(450px, 1fr)",
      md: "minmax(100px, 160px) minmax(240px, 320px) minmax(500px, 1fr)",
    },
  };

  return (
    <Box
      {...props}
      sx={[
        {
          display: "grid",
          gridTemplateColumns: gridTemplateColumns[columnCount],
          gridTemplateRows: "64px 1fr",
          minWidth: "100vw",
          minHeight: "100vh",
          maxHeight: "100vh",
        },
        ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
      ]}
    />
  );
}

function Header(props: BoxProps) {
  return (
    <Box
      component="header"
      className="Header"
      {...props}
      sx={[
        {
          p: 2,
          gap: 2,
          bgcolor: "background.surface",
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gridColumn: "1 / -1",
          borderBottom: "1px solid",
          borderColor: "divider",
          position: "sticky",
          top: 0,
          zIndex: 1100,
        },
        ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
      ]}
    />
  );
}

function SideNav(props: BoxProps) {
  return (
    <Box
      component="nav"
      className="Navigation"
      {...props}
      sx={[
        {
          p: 2,
          bgcolor: "background.surface",
          borderRight: "1px solid",
          borderColor: "divider",
          maxHeight: "100%",
          display: {
            xs: "none",
            sm: "initial",
          },
        },
        ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
      ]}
    />
  );
}

function Main(props: BoxProps) {
  return (
    <Box
      component="main"
      className="Main"
      {...props}
      sx={[{ p: 2 }, ...(Array.isArray(props.sx) ? props.sx : [props.sx])]}
    />
  );
}
function SideDrawer(
  props: BoxProps & { onClose: React.MouseEventHandler<HTMLDivElement> }
) {
  const { onClose, ...other } = props;
  return (
    <Box
      {...other}
      sx={[
        { position: "fixed", zIndex: 1200, width: "100%", height: "100%" },
        ...(Array.isArray(other.sx) ? other.sx : [other.sx]),
      ]}
    >
      <Box
        role="button"
        onClick={onClose}
        sx={(theme) => ({
          position: "absolute",
          inset: 0,
          bgcolor: `rgba(${theme.vars.palette.neutral.darkChannel} / 0.8)`,
        })}
      />
      <Sheet
        sx={{
          minWidth: 256,
          width: "max-content",
          height: "100%",
          p: 2,
          boxShadow: "lg",
          bgcolor: "background.surface",
        }}
      >
        {props.children}
      </Sheet>
    </Box>
  );
}

export default {
  Root,
  Header,
  SideNav,
  SideDrawer,
  Main,
};
