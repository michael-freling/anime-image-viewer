/**
 * App-level providers.
 *
 * Order matters: theme must wrap query so query-driven components can use
 * Chakra styling, and next-themes must sit outside Chakra so the `class`
 * attribute is set before Chakra reads the color mode.
 *
 * This module is NOT yet imported from main.tsx — Phase G wires it in.
 */
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider, useTheme } from "next-themes";
import { ReactNode, useEffect, useState } from "react";
import { useUIStore } from "../stores/ui-store";
import system from "../styles/theme";

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Creates the React Query client once per app mount. Defaults per
 * frontend-design.md §4: 5-minute stale time on metadata, no refetch on window
 * focus (desktop app), single retry for transient Wails bridge failures.
 */
function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

/**
 * Syncs the Zustand theme preference to next-themes so the actual DOM
 * class/attribute updates when the user switches appearance in Settings.
 */
function ThemeSync(): null {
  const theme = useUIStore((s) => s.theme);
  const { setTheme } = useTheme();
  useEffect(() => {
    setTheme(theme);
  }, [theme, setTheme]);
  return null;
}

export function AppProviders({ children }: AppProvidersProps): JSX.Element {
  // useState ensures the QueryClient is stable across renders without making
  // it a module-level singleton (friendlier for tests and React strict mode).
  const [queryClient] = useState(() => createQueryClient());

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <ThemeSync />
      <ChakraProvider value={system}>
        <QueryClientProvider client={queryClient}>
          {children}
          {import.meta.env.DEV && (
            <ReactQueryDevtools initialIsOpen={false} />
          )}
        </QueryClientProvider>
      </ChakraProvider>
    </ThemeProvider>
  );
}

export default AppProviders;
