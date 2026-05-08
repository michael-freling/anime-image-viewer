/**
 * Top-level router error boundary.
 *
 * Rendered by react-router when a route throws — e.g. a loader rejects, a
 * child component errors during render, or the user hits an unknown path.
 * Deliberately minimal: we don't want a broken app to depend on the full
 * AppShell (icon rail, nav state, query client) to render the error itself.
 *
 * Chakra v3 + lucide-react only. No MUI.
 */
import { Box, Button, Heading, Stack, Text } from "@chakra-ui/react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { isRouteErrorResponse, useRouteError } from "react-router";

function describeError(error: unknown): { title: string; detail: string } {
  if (isRouteErrorResponse(error)) {
    return {
      title: `${error.status} ${error.statusText || "Error"}`,
      detail:
        typeof error.data === "string"
          ? error.data
          : JSON.stringify(error.data ?? {}, null, 2),
    };
  }
  if (error instanceof Error) {
    return {
      title: "Something went wrong",
      detail: error.stack ?? error.message,
    };
  }
  return {
    title: "Something went wrong",
    detail: JSON.stringify(error, null, 2),
  };
}

export default function RootErrorPage(): JSX.Element {
  const error = useRouteError();
  console.error("RootErrorPage caught", error);

  const { title, detail } = describeError(error);

  const handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <Box
      role="alert"
      aria-live="assertive"
      minH="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="bg.base"
      color="fg"
      p="6"
    >
      <Stack gap="6" maxW="640px" w="100%">
        <Stack direction="row" align="center" gap="3">
          <Box color="danger" aria-hidden="true">
            <AlertTriangle size={32} strokeWidth={2} />
          </Box>
          <Heading as="h1" size="xl">
            {title}
          </Heading>
        </Stack>

        <Text color="fg.secondary">
          An unexpected error occurred. Reloading the app usually clears it.
          If the problem keeps happening, check the log file under Settings.
        </Text>

        <Box
          as="pre"
          bg="bg.surface"
          borderWidth="1px"
          borderColor="border"
          borderRadius="md"
          p="4"
          overflowX="auto"
          fontSize="sm"
          color="fg.muted"
          maxH="320px"
        >
          {detail}
        </Box>

        <Box>
          <Button
            onClick={handleReload}
            bg="primary"
            color="white"
            _hover={{ bg: "primary.hover" }}
          >
            <RotateCcw size={16} />
            <Text as="span" ml="2">
              Reload app
            </Text>
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}
