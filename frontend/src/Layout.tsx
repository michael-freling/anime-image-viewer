// https://github.com/mui/material-ui/blob/d0a59894122d209958beda64e17f5987fef141b2/docs/data/joy/getting-started/templates/files/components/Layout.tsx
import * as React from "react";
import Box, { BoxProps } from "@mui/joy/Box";
import Sheet from "@mui/joy/Sheet";
import HeaderComponent from "./components/Header";
import Navigation from "./components/Navigation";
import { Outlet } from "react-router";
import { Card, Stack } from "@mui/joy";
import Footer from "./components/Footer";

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
          bgcolor: "background.surface",
          borderRight: "1px solid",
          borderColor: "divider",
          height: "100%",
        },
        ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
      ]}
    />
  );
}

export interface MainProps {
  actionHeader: React.ReactNode;
}
const Main: React.FC<MainProps & React.PropsWithChildren> = ({
  actionHeader,
  children,
}) => {
  return (
    <Box component="main" className="Main">
      <Card
        sx={{
          position: "sticky",
          top: 0,
          p: 1,
          zIndex: 1,
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          {actionHeader}
        </Stack>
      </Card>
      <Box
        sx={{
          height: "calc(100vh - 120px)",
          width: "100%",
          overflowX: "hidden",
          overflowY: "auto",
        }}
      >
        {children}
      </Box>
      <Card
        sx={{
          position: "sticky",
          bottom: 0,
          zIndex: 1,

          p: 0,
        }}
      >
        <Footer />
      </Card>
    </Box>
  );
};

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

interface ThreeColumnLayoutProps {
  sideNavigation: React.ReactNode;
}

const ThreeColumnLayout: React.FC<ThreeColumnLayoutProps> = ({
  sideNavigation,
}) => (
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns: {
        xs: "1fr",
        sm: "minmax(64px, 200px) minmax(450px, 1fr)",
        md: "minmax(100px, 160px) minmax(240px, 320px) minmax(500px, 1fr)",
      },
      gridTemplateRows: "64px 1fr",
      width: "100vw",
      height: "100vh",
      overflowY: "hidden",
    }}
  >
    <Header>
      <HeaderComponent />
    </Header>
    <SideNav>
      <Navigation />
    </SideNav>
    <SideNav sx={{ overflowY: "auto" }}>{sideNavigation}</SideNav>

    <Outlet />
  </Box>
);

const TwoColumnLayout: React.FC = () => (
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns: {
        xs: "1fr",
        sm: "minmax(64px, 200px) minmax(450px, 1fr)",
        md: "minmax(100px, 160px) minmax(500px, 1fr)",
      },
      gridTemplateRows: "64px 1fr",
      width: "100vw",
      height: "100vh",
      overflowY: "hidden",
    }}
  >
    <Header>
      <HeaderComponent />
    </Header>
    <SideNav>
      <Navigation />
    </SideNav>

    <Outlet />
  </Box>
);

export default {
  Header,
  SideNav,
  SideDrawer,
  Main,
  TwoColumnLayout,
  ThreeColumnLayout,
};
