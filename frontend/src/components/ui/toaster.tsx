/**
 * Singleton Chakra toaster + typed helpers.
 *
 * Chakra v3 exposes `createToaster` (re-exported from `@ark-ui/react/toast`)
 * which owns a queue of toast records. We create exactly one toaster at
 * module load and mount the matching `<Toaster />` element once in the app
 * root. Callers use the `toast` helpers from anywhere — no React context or
 * provider wrapper needed.
 *
 * Durations follow ui-design.md §7 (accessibility / spec defaults):
 *   success/info  4s
 *   warning       6s
 *   error         8s
 */
import {
  createToaster,
  Portal,
  Toast,
  Toaster as ChakraToaster,
} from "@chakra-ui/react";

export const DURATIONS = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: 8000,
} as const;

/**
 * The shared toaster singleton. Exposed so advanced callers can use
 * `toaster.promise`, `toaster.dismiss(id)`, etc.
 */
export const toaster = createToaster({
  placement: "bottom-end",
  overlap: true,
  gap: 12,
});

export interface ToastOptions {
  duration?: number;
  id?: string;
}

function create(
  type: "success" | "error" | "info" | "warning",
  title: string,
  description?: string,
  options?: ToastOptions,
) {
  return toaster.create({
    type,
    title,
    description,
    duration: options?.duration ?? DURATIONS[type],
    id: options?.id,
  });
}

export const toast = {
  success: (title: string, description?: string, options?: ToastOptions) =>
    create("success", title, description, options),
  error: (title: string, description?: string, options?: ToastOptions) =>
    create("error", title, description, options),
  info: (title: string, description?: string, options?: ToastOptions) =>
    create("info", title, description, options),
  warning: (title: string, description?: string, options?: ToastOptions) =>
    create("warning", title, description, options),
  dismiss: (id?: string) => toaster.dismiss(id),
};

/**
 * `<Toaster />` mounts the portal target that renders the queue. Include
 * exactly once near the root of the app (after Chakra's theme provider).
 */
export function Toaster(): JSX.Element {
  return (
    <Portal>
      <ChakraToaster toaster={toaster} insetInline={{ mdDown: "4" }}>
        {(toastRecord) => (
          <Toast.Root
            data-testid="toast"
            data-toast-type={toastRecord.type}
            bg="bg.surface"
            color="fg"
            borderWidth="1px"
            borderColor={
              toastRecord.type === "error"
                ? "danger"
                : toastRecord.type === "success"
                  ? "success"
                  : toastRecord.type === "warning"
                    ? "warning"
                    : "border"
            }
            borderRadius="md"
            px="4"
            py="3"
            minWidth="320px"
            maxWidth="440px"
          >
            <Toast.Indicator />
            <Toast.Title fontSize="sm" fontWeight="600">
              {toastRecord.title}
            </Toast.Title>
            {toastRecord.description && (
              <Toast.Description
                fontSize="sm"
                color="fg.secondary"
                mt="1"
              >
                {toastRecord.description}
              </Toast.Description>
            )}
            <Toast.CloseTrigger />
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  );
}

export default Toaster;
