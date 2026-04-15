/**
 * About settings section — app identity + external links.
 *
 * Spec: ui-design.md §3.7 (Settings — About) and wireframe `08-settings-
 * mobile.svg` (About rows: Version, GitHub).
 *
 * The GitHub link opens via Wails' Browser.OpenURL when the runtime is
 * available (desktop app context). In a fallback web / test environment we
 * degrade to a plain anchor with rel="noreferrer noopener" so we keep the
 * link clickable when hydrated outside Wails.
 */
import { chakra, Stack, Text } from "@chakra-ui/react";
import { ExternalLink } from "lucide-react";

const ChakraAnchor = chakra("a");

const APP_NAME = "AnimeVault";
// TODO: expose a real version string from the Wails bindings once
// `ConfigFrontendService.GetVersion` / equivalent lands.
const APP_VERSION = "Dev";
const REPO_URL = "https://github.com/michael-freling/anime-image-viewer";

async function openRepo(event: React.MouseEvent<HTMLAnchorElement>): Promise<void> {
  // Prefer Wails' Browser.OpenURL when the runtime is attached to the
  // window; the native browser handles the URL instead of navigating away
  // from the WebView. Fall back to the anchor's default behaviour otherwise.
  try {
    const wails = await import("@wailsio/runtime").catch(() => null);
    if (wails?.Browser && typeof wails.Browser.OpenURL === "function") {
      event.preventDefault();
      await wails.Browser.OpenURL(REPO_URL);
    }
  } catch {
    // Ignore: the default anchor navigation fires if the dynamic import
    // fails (e.g. when we're running outside the Wails WebView).
  }
}

export function AboutSection(): JSX.Element {
  return (
    <Stack data-testid="about-section" gap="4" py="4">
      <Stack
        as="ul"
        role="list"
        gap="0"
        bg="bg.surface"
        borderWidth="1px"
        borderColor="border"
        borderRadius="md"
      >
        <Stack
          as="li"
          role="listitem"
          direction="row"
          align="center"
          justify="space-between"
          px="3"
          py="3"
          borderBottomWidth="1px"
          borderBottomColor="border"
        >
          <Text fontSize="sm" color="fg">
            App Name
          </Text>
          <Text fontSize="sm" color="fg.secondary" data-testid="about-app-name">
            {APP_NAME}
          </Text>
        </Stack>
        <Stack
          as="li"
          role="listitem"
          direction="row"
          align="center"
          justify="space-between"
          px="3"
          py="3"
          borderBottomWidth="1px"
          borderBottomColor="border"
        >
          <Text fontSize="sm" color="fg">
            Version
          </Text>
          <Text fontSize="sm" color="fg.secondary" data-testid="about-version">
            {APP_VERSION}
          </Text>
        </Stack>
        <Stack
          as="li"
          role="listitem"
          direction="row"
          align="center"
          justify="space-between"
          px="3"
          py="3"
        >
          <Text fontSize="sm" color="fg">
            GitHub Repository
          </Text>
          <ChakraAnchor
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            onClick={openRepo}
            data-testid="about-github-link"
            display="inline-flex"
            alignItems="center"
            gap="1"
            color="primary"
            fontSize="sm"
            _hover={{ textDecoration: "underline" }}
          >
            <span>Open</span>
            <ExternalLink size={12} aria-hidden="true" />
          </ChakraAnchor>
        </Stack>
      </Stack>
    </Stack>
  );
}

export default AboutSection;
