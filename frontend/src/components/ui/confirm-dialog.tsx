/**
 * Confirm dialog — a thin wrapper over Chakra v3's `Dialog` (alert-dialog
 * pattern) with a danger variant used by destructive actions such as
 * delete-anime, delete-entry, delete-tag.
 *
 * Props are controlled: parents pass `open` + `onClose` + `onConfirm`. The
 * `variant: 'danger'` flag swaps the Confirm button to use the danger
 * palette so the colour intent matches the copy.
 *
 * The confirm handler may return a promise; while it is pending we lock the
 * buttons and show a loading state on Confirm so the user can't double-click
 * and fire the action twice.
 */
import { Button, Dialog, Portal } from "@chakra-ui/react";
import { useState } from "react";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
}: ConfirmDialogProps): JSX.Element {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    try {
      setLoading(true);
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (details: { open: boolean }) => {
    if (!details.open && !loading) {
      onClose();
    }
  };

  const isDanger = variant === "danger";

  return (
    <Dialog.Root
      role="alertdialog"
      open={open}
      onOpenChange={handleOpenChange}
      closeOnEscape={!loading}
      closeOnInteractOutside={!loading}
    >
      <Portal>
        <Dialog.Backdrop bg="blackAlpha.600" />
        <Dialog.Positioner>
          <Dialog.Content
            data-testid="confirm-dialog"
            data-variant={variant}
            bg="bg.surface"
            color="fg"
            borderRadius="lg"
            borderWidth="1px"
            borderColor="border"
            maxWidth="440px"
          >
            <Dialog.Header px="5" pt="4">
              <Dialog.Title fontSize="md" fontWeight="600">
                {title}
              </Dialog.Title>
            </Dialog.Header>
            {description && (
              <Dialog.Body px="5" py="2">
                <Dialog.Description
                  color="fg.secondary"
                  fontSize="sm"
                  lineHeight="1.5"
                >
                  {description}
                </Dialog.Description>
              </Dialog.Body>
            )}
            <Dialog.Footer
              px="5"
              pb="4"
              pt="4"
              display="flex"
              gap="2"
              justifyContent="flex-end"
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                disabled={loading}
                data-testid="confirm-dialog-cancel"
              >
                {cancelLabel}
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="confirm-dialog-confirm"
                data-loading={loading ? "true" : undefined}
                onClick={handleConfirm}
                loading={loading}
                loadingText={confirmLabel}
                bg={isDanger ? "danger" : "primary"}
                color={isDanger ? "bg.surface" : "bg.surface"}
                _hover={{
                  bg: isDanger ? "danger" : "primary.hover",
                  opacity: 0.9,
                }}
              >
                {confirmLabel}
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

export default ConfirmDialog;
