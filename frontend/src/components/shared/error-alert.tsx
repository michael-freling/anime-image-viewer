/**
 * Inline error display used by pages + dialogs.
 *
 * Uses the `danger` / `danger.bg` semantic tokens so the same component
 * renders in both dark and light mode without colour overrides. Retry is
 * optional: when `onRetry` is omitted we don't render the button so callers
 * can't accidentally leave a dead button in the UI.
 */
import { Box, Button } from "@chakra-ui/react";
import { AlertTriangle } from "lucide-react";

export interface ErrorAlertProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorAlert({
  title = "Something went wrong",
  message,
  onRetry,
}: ErrorAlertProps): JSX.Element {
  return (
    <Box
      role="alert"
      aria-live="assertive"
      display="flex"
      alignItems="flex-start"
      gap="3"
      p="4"
      bg="danger.bg"
      borderLeft="3px solid"
      borderColor="danger"
      borderRadius="md"
      color="danger"
    >
      <Box aria-hidden="true" flexShrink={0} mt="1">
        <AlertTriangle size={18} />
      </Box>
      <Box flex="1" minWidth={0}>
        <Box fontSize="sm" fontWeight="600" color="danger">
          {title}
        </Box>
        <Box fontSize="sm" color="danger" mt="1" wordBreak="break-word">
          {message}
        </Box>
      </Box>
      {onRetry && (
        <Button
          type="button"
          size="xs"
          variant="outline"
          borderColor="danger"
          color="danger"
          onClick={onRetry}
          _hover={{ bg: "bg.surfaceAlt" }}
        >
          Retry
        </Button>
      )}
    </Box>
  );
}

export default ErrorAlert;
