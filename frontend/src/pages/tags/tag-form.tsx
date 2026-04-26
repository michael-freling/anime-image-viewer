/**
 * Shared form body used by the create / edit tag dialogs.
 *
 * Fields (ui-design §3.6 — Tag Management create/edit flow):
 *   - Name      text input
 *   - Category  dropdown restricted to the five known keys
 *   - Parent    optional number input (tag id). The current backend does
 *               not support nested tags, but the brief asks for the field
 *               so the UI is future-proof. Value is persisted as `null`
 *               when empty.
 *
 * The form is a controlled React component: the parent owns `values`, `set`
 * and `onSubmit`. This mirrors the pattern used elsewhere in the app
 * (HomeImportDialog, AniListSearchModal) where dialogs wrap the form.
 */
import { Box, Button, Stack, chakra } from "@chakra-ui/react";

import { TAG_ONLY_CATEGORY_ORDER } from "../../lib/constants";
import type { Tag, TagCategoryKey } from "../../types";

// Native DOM elements wrapped with Chakra's style-prop machinery. `chakra(...)`
// yields a component that accepts the element's intrinsic props (type, value,
// disabled, etc.) AND Chakra style props on the same object — without the
// polymorphic typing quirks that `Box as="input"` triggers in v3.
const ChakraLabel = chakra("label");
const ChakraInput = chakra("input");
const ChakraSelect = chakra("select");

export interface TagFormValues {
  name: string;
  category: TagCategoryKey;
  parentId: number | null;
}

export const CATEGORY_LABELS: Record<TagCategoryKey, string> = {
  scene: "Scene / Action",
  nature: "Nature / Weather",
  location: "Location",
  mood: "Mood / Genre",
  character: "Character",
  uncategorized: "Uncategorized",
};

export interface TagFormProps {
  values: TagFormValues;
  onChange: (values: TagFormValues) => void;
  /** Optional list of candidate parent tags (id + name). */
  parentOptions?: Tag[];
  /** Disables every control — used while the submit mutation is in-flight. */
  disabled?: boolean;
  /** Error message rendered inline below the submit row. */
  error?: string | null;
  /** Called when the user presses Enter in the name field. */
  onSubmit?: () => void;
  /** "Create" vs "Save" button label, etc. */
  submitLabel: string;
  onCancel: () => void;
  submitting?: boolean;
}

export function TagForm({
  values,
  onChange,
  parentOptions,
  disabled,
  error,
  onSubmit,
  submitLabel,
  onCancel,
  submitting,
}: TagFormProps): JSX.Element {
  const isDisabled = disabled || submitting;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <Stack gap="4" data-testid="tag-form">
      <Box>
        <ChakraLabel
          display="block"
          fontSize="sm"
          fontWeight="500"
          color="fg"
          mb="1"
          htmlFor="tag-form-name"
        >
          Name
        </ChakraLabel>
        <ChakraInput
          id="tag-form-name"
          type="text"
          data-testid="tag-form-name"
          value={values.name}
          onChange={(e) => onChange({ ...values, name: e.target.value })}
          onKeyDown={handleKeyDown}
          disabled={isDisabled}
          placeholder="Tag name"
          aria-label="Tag name"
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

      <Box>
        <ChakraLabel
          display="block"
          fontSize="sm"
          fontWeight="500"
          color="fg"
          mb="1"
          htmlFor="tag-form-category"
        >
          Category
        </ChakraLabel>
        <ChakraSelect
          id="tag-form-category"
          data-testid="tag-form-category"
          value={values.category}
          onChange={(e) =>
            onChange({
              ...values,
              category: e.target.value as TagCategoryKey,
            })
          }
          disabled={isDisabled}
          aria-label="Tag category"
          width="100%"
          height="40px"
          px="2"
          borderRadius="md"
          borderWidth="1px"
          borderColor="border"
          bg="bg.surface"
          color="fg"
          fontSize="sm"
          _focus={{
            outline: "none",
            borderColor: "primary",
          }}
          _disabled={{ opacity: 0.6, cursor: "not-allowed" }}
        >
          {TAG_ONLY_CATEGORY_ORDER.map((key) => (
            <option key={key} value={key}>
              {CATEGORY_LABELS[key]}
            </option>
          ))}
        </ChakraSelect>
      </Box>

      <Box>
        <ChakraLabel
          display="block"
          fontSize="sm"
          fontWeight="500"
          color="fg"
          mb="1"
          htmlFor="tag-form-parent"
        >
          Parent tag (optional)
        </ChakraLabel>
        <ChakraSelect
          id="tag-form-parent"
          data-testid="tag-form-parent"
          value={values.parentId == null ? "" : String(values.parentId)}
          onChange={(e) => {
            const raw = e.target.value;
            onChange({
              ...values,
              parentId: raw === "" ? null : Number(raw),
            });
          }}
          disabled={isDisabled || !parentOptions || parentOptions.length === 0}
          aria-label="Parent tag"
          width="100%"
          height="40px"
          px="2"
          borderRadius="md"
          borderWidth="1px"
          borderColor="border"
          bg="bg.surface"
          color="fg"
          fontSize="sm"
          _focus={{
            outline: "none",
            borderColor: "primary",
          }}
          _disabled={{ opacity: 0.6, cursor: "not-allowed" }}
        >
          <option value="">(none)</option>
          {(parentOptions ?? []).map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </ChakraSelect>
      </Box>

      {error && (
        <Box
          data-testid="tag-form-error"
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
          onClick={onCancel}
          disabled={isDisabled}
          data-testid="tag-form-cancel"
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
          disabled={isDisabled || values.name.trim() === ""}
          loading={submitting}
          loadingText={submitLabel}
          data-testid="tag-form-submit"
        >
          {submitLabel}
        </Button>
      </Stack>
    </Stack>
  );
}

export default TagForm;
