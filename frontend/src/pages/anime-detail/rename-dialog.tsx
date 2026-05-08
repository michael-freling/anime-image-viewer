/**
 * Simple dialog with a single name input field. Used by the Characters tab
 * for both create and rename flows.
 */
import { Box, Button, Dialog, Portal, Stack, chakra } from "@chakra-ui/react";

const ChakraInput = chakra("input");

export interface RenameDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  name: string;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  submitLabel: string;
}

export function RenameDialog({
  open,
  onClose,
  title,
  name,
  onNameChange,
  onSubmit,
  submitting,
  error,
  submitLabel,
}: RenameDialogProps): JSX.Element | null {
  const handleOpenChange = (details: { open: boolean }) => {
    if (!details.open && !submitting) onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmit();
    }
  };

  if (!open) return null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={handleOpenChange}
      closeOnEscape={!submitting}
      closeOnInteractOutside={!submitting}
    >
      <Portal>
        <Dialog.Backdrop bg="blackAlpha.600" />
        <Dialog.Positioner>
          <Dialog.Content
            data-testid="rename-dialog"
            bg="bg.surface"
            color="fg"
            borderRadius="lg"
            borderWidth="1px"
            borderColor="border"
            maxWidth="400px"
            width="full"
          >
            <Dialog.Header px="5" pt="4">
              <Dialog.Title fontSize="md" fontWeight="600">
                {title}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body px="5" py="3">
              <Stack gap="4">
                <Box>
                  <ChakraInput
                    type="text"
                    data-testid="rename-dialog-input"
                    value={name}
                    onChange={(e) => onNameChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={submitting}
                    placeholder="Name"
                    aria-label="Name"
                    width="100%"
                    height="40px"
                    px="3"
                    borderRadius="md"
                    borderWidth="1px"
                    borderColor="border"
                    bg="bg.surface"
                    color="fg"
                    fontSize="sm"
                    _focus={{
                      outline: "none",
                      borderColor: "primary",
                      boxShadow: "0 0 0 2px var(--chakra-colors-primary)",
                    }}
                    _disabled={{ opacity: 0.6, cursor: "not-allowed" }}
                  />
                </Box>

                {error && (
                  <Box
                    data-testid="rename-dialog-error"
                    role="alert"
                    fontSize="sm"
                    color="danger"
                    bg="danger.bg"
                    borderRadius="md"
                    px="3"
                    py="2"
                  >
                    {error}
                  </Box>
                )}

                <Stack direction="row" gap="2" justify="flex-end" mt="2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onClose}
                    disabled={submitting}
                    data-testid="rename-dialog-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    bg="primary"
                    color="bg.surface"
                    _hover={{ bg: "primary.hover" }}
                    onClick={onSubmit}
                    disabled={submitting || name.trim() === ""}
                    loading={submitting}
                    loadingText={submitLabel}
                    data-testid="rename-dialog-submit"
                  >
                    {submitLabel}
                  </Button>
                </Stack>
              </Stack>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

export default RenameDialog;
