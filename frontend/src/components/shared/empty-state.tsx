/**
 * Centered message used for empty result states.
 *
 * Spec: ui-design.md §3.1 (Home empty state copy), §3.4 (search, no results),
 * wireframe `01-home-desktop.svg` (empty copy). Caller passes a lucide icon
 * component; we render it at 48px in the muted text colour so the illustration
 * stays secondary to the title.
 */
import { Box } from "@chakra-ui/react";
import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps): JSX.Element {
  return (
    <Box
      role="status"
      aria-live="polite"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      textAlign="center"
      width="full"
      maxWidth="400px"
      mx="auto"
      px="6"
      py="12"
      gap="3"
    >
      {Icon && (
        <Box color="fg.dim" aria-hidden="true" mb="2">
          <Icon size={48} strokeWidth={1.5} />
        </Box>
      )}
      <Box as="h2" fontSize="lg" fontWeight="600" color="fg">
        {title}
      </Box>
      {description && (
        <Box fontSize="sm" color="fg.secondary" lineHeight="1.5">
          {description}
        </Box>
      )}
      {action && <Box mt="3">{action}</Box>}
    </Box>
  );
}

export default EmptyState;
