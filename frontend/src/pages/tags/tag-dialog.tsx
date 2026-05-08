/**
 * Modal wrapper around `TagForm`, used by the Tag Management page for both
 * "New tag" and "Edit tag" flows.
 *
 * The dialog is stateless — all form state + submission flows through props.
 * Chakra v3's `Dialog` primitive unmounts children when `open=false`, so we
 * rely on that behaviour to reset form state between opens (the parent
 * resets its own state on close as well).
 */
import { Dialog, Portal } from "@chakra-ui/react";

import { TagForm, type TagFormProps } from "./tag-form";

export interface TagDialogProps extends Omit<TagFormProps, "onCancel"> {
  open: boolean;
  onClose: () => void;
  title: string;
}

export function TagDialog({
  open,
  onClose,
  title,
  ...formProps
}: TagDialogProps): JSX.Element | null {
  const handleOpenChange = (details: { open: boolean }) => {
    if (!details.open && !formProps.submitting) onClose();
  };

  if (!open) return null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={handleOpenChange}
      closeOnEscape={!formProps.submitting}
      closeOnInteractOutside={!formProps.submitting}
    >
      <Portal>
        <Dialog.Backdrop bg="blackAlpha.600" />
        <Dialog.Positioner>
          <Dialog.Content
            data-testid="tag-dialog"
            bg="bg.surface"
            color="fg"
            borderRadius="lg"
            borderWidth="1px"
            borderColor="border"
            maxWidth="480px"
            width="full"
          >
            <Dialog.Header px="5" pt="4">
              <Dialog.Title fontSize="md" fontWeight="600">
                {title}
              </Dialog.Title>
            </Dialog.Header>
            <Dialog.Body px="5" py="3">
              <TagForm {...formProps} onCancel={onClose} />
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

export default TagDialog;
