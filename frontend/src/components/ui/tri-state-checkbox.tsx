/**
 * Tri-state checkbox used by the Image Tag Editor.
 *
 * Spec: ui-design.md §4.4 "Tri-State Checkbox" and wireframe
 * `06-image-tag-editor-desktop.svg`. The component is a button with
 * `role="checkbox"` + `aria-checked="mixed"` when indeterminate — the
 * native Chakra Checkbox has an indeterminate prop, but combining it with
 * our add/remove highlights and strikethrough-on-removing is cleaner as a
 * purpose-built button than by fighting the Checkbox slot recipe.
 *
 * States (from the wireframe):
 *   unchecked     empty cell
 *   checked       primary fill, white check
 *   indeterminate primary border, dash glyph
 *
 * Pending "adding":  green row highlight (`success.bg` / `success` border).
 * Pending "removing": red row highlight (`danger.bg` / `danger` border) plus
 *                      strikethrough on the label.
 *
 * `onChange` fires with the *next* state on toggle. Indeterminate → checked
 * (user resolves the mix by adding to all); checked → unchecked; unchecked
 * → checked. Indeterminate itself is only ever set by the parent.
 */
import { Box, chakra } from "@chakra-ui/react";
import { Check, Minus } from "lucide-react";

const ChakraButton = chakra("button");

export type TriStateValue = "unchecked" | "checked" | "indeterminate";
export type TriStatePending = "adding" | "removing" | null;

export interface TriStateCheckboxProps {
  state: TriStateValue;
  pending?: TriStatePending;
  onChange: (next: "unchecked" | "checked") => void;
  label?: string;
  count?: number;
}

export function TriStateCheckbox({
  state,
  pending = null,
  onChange,
  label,
  count,
}: TriStateCheckboxProps): JSX.Element {
  const handleClick = () => {
    // Click resolves the cell. Indeterminate → checked (add to all);
    // checked → unchecked; unchecked → checked.
    if (state === "checked") {
      onChange("unchecked");
    } else {
      onChange("checked");
    }
  };

  const ariaChecked =
    state === "indeterminate" ? "mixed" : state === "checked";

  // Row-level visual state: pending wins over the base state.
  let rowBg: string;
  let rowBorderColor: string;
  let labelColor: string = "fg";
  if (pending === "adding") {
    rowBg = "success.bg";
    rowBorderColor = "success";
    labelColor = "success";
  } else if (pending === "removing") {
    rowBg = "danger.bg";
    rowBorderColor = "danger";
    labelColor = "danger";
  } else {
    rowBg = "bg.surface";
    rowBorderColor = "transparent";
  }

  // Checkbox swatch visuals by state.
  let controlBg: string;
  let controlBorder: string;
  let indicator: JSX.Element | null;
  if (pending === "adding") {
    controlBg = "success";
    controlBorder = "success";
    indicator = <Check size={12} color="#0a0a0f" strokeWidth={3} />;
  } else if (pending === "removing") {
    controlBg = "transparent";
    controlBorder = "danger";
    indicator = null;
  } else if (state === "checked") {
    controlBg = "primary";
    controlBorder = "primary";
    indicator = <Check size={12} color="#ffffff" strokeWidth={3} />;
  } else if (state === "indeterminate") {
    controlBg = "transparent";
    controlBorder = "primary";
    indicator = <Minus size={12} color="var(--chakra-colors-primary)" strokeWidth={3} />;
  } else {
    controlBg = "transparent";
    controlBorder = "border";
    indicator = null;
  }

  return (
    <ChakraButton
      type="button"
      role="checkbox"
      aria-checked={ariaChecked}
      data-state={state}
      data-pending={pending ?? undefined}
      onClick={handleClick}
      width="full"
      display="flex"
      alignItems="center"
      gap="3"
      px="3"
      py="2"
      bg={rowBg}
      border="1px solid"
      borderColor={rowBorderColor}
      borderRadius="md"
      cursor="pointer"
      textAlign="left"
      _hover={{ bg: pending ? rowBg : "bg.surfaceAlt" }}
      _focusVisible={{
        outline: "2px solid",
        outlineColor: "primary",
        outlineOffset: "2px",
      }}
    >
      <Box
        aria-hidden="true"
        display="flex"
        alignItems="center"
        justifyContent="center"
        width="16px"
        height="16px"
        borderRadius="sm"
        bg={controlBg}
        border="1.5px solid"
        borderColor={controlBorder}
        flexShrink={0}
      >
        {indicator}
      </Box>
      {label != null && (
        <Box
          flex="1"
          fontSize="sm"
          color={labelColor}
          textDecoration={pending === "removing" ? "line-through" : undefined}
        >
          {label}
        </Box>
      )}
      {pending === "adding" && (
        <Box fontSize="xs" color="success" data-testid="tri-state-pending-hint">
          adding
        </Box>
      )}
      {pending === "removing" && (
        <Box fontSize="xs" color="danger" data-testid="tri-state-pending-hint">
          removing
        </Box>
      )}
      {typeof count === "number" && (
        <Box fontSize="xs" color="fg.secondary" ml="auto">
          {count}
        </Box>
      )}
    </ChakraButton>
  );
}

export default TriStateCheckbox;
