import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import { Box, Tooltip, IconButton, Stack, Button } from "@mui/joy";
import { useColorScheme } from "@mui/joy/styles";
import * as React from "react";

function ColorSchemeToggle() {
  const { mode, setMode } = useColorScheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) {
    return <IconButton size="sm" variant="outlined" color="primary" />;
  }
  return (
    <Tooltip title="Change theme" variant="outlined">
      <IconButton
        data-screenshot="toggle-mode"
        size="sm"
        variant="plain"
        color="neutral"
        sx={{ alignSelf: "center" }}
        onClick={() => {
          if (mode === "light") {
            setMode("dark");
          } else {
            setMode("light");
          }
        }}
      >
        {mode === "light" ? <DarkModeRoundedIcon /> : <LightModeRoundedIcon />}
      </IconButton>
    </Tooltip>
  );
}

export default function Header() {
  return (
    <Box sx={{ display: "flex", flexGrow: 1, justifyContent: "space-between" }}>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap={true}
        sx={{
          flexWrap: "wrap",
        }}
      >
        <Button variant="plain" color="neutral" component="a">
          Anime Image Viewer
        </Button>
      </Stack>
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          gap: 1.5,
          alignItems: "center",
        }}
      >
        <ColorSchemeToggle />
      </Box>
    </Box>
  );
}
