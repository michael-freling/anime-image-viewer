/**
 * Shared factory for Jest mocks of `@chakra-ui/react` + `lucide-react`.
 *
 * Chakra v3 compiles to ESM and depends on `createSystem` / emotion at
 * runtime, which our Jest config cannot execute without extra transform
 * rules. Unit tests only care about *behaviour* — layout + colour tokens
 * belong to visual regression — so we stub every Chakra primitive out with
 * a passthrough host element that ignores style props.
 *
 * Usage (inside a test file):
 *
 *   jest.mock("@chakra-ui/react", () => {
 *     const { chakraStubFactory } = jest.requireActual("../chakra-stub");
 *     return chakraStubFactory();
 *   });
 *
 * `jest.mock` is hoisted above imports, so the factory is invoked at module
 * load time. We MUST avoid closing over outer scope; everything must live
 * in the factory body. `jest.requireActual` is the one legal way to pull in
 * a helper module (ours is a vanilla CommonJS/TS module, no mocks needed).
 *
 * `lucideStubFactory` follows the same shape for `lucide-react` icons.
 */

// Style props we strip so React doesn't warn about unknown DOM attributes.
const STYLE_PROPS = new Set<string>([
  "alignItems",
  "align",
  "animation",
  "aspectRatio",
  "asChild",
  "autoFocus",
  "bg",
  "borderTop",
  "borderLeft",
  "borderBottom",
  "borderRight",
  "border",
  "borderBottomWidth",
  "borderColor",
  "borderLeftWidth",
  "borderRadius",
  "borderRightWidth",
  "borderTopWidth",
  "borderWidth",
  "bottom",
  "boxShadow",
  "color",
  "colorPalette",
  "cursor",
  "direction",
  "divideColor",
  "divideY",
  "display",
  "flex",
  "flexBasis",
  "flexDirection",
  "flexGrow",
  "flexShrink",
  "flexWrap",
  "fontSize",
  "fontWeight",
  "gap",
  "grid",
  "gridTemplateColumns",
  "gridTemplateRows",
  "h",
  "height",
  "insetInline",
  "justify",
  "justifyContent",
  "justifyItems",
  "left",
  "lineHeight",
  "loading",
  "loadingText",
  "m",
  "mb",
  "minH",
  "minHeight",
  "minW",
  "minWidth",
  "ml",
  "mr",
  "mt",
  "mx",
  "my",
  "ns",
  "objectFit",
  "opacity",
  "overflow",
  "overflowY",
  "overflowX",
  "p",
  "pb",
  "pe",
  "pl",
  "placement",
  "pointerEvents",
  "position",
  "pr",
  "ps",
  "pt",
  "px",
  "py",
  "right",
  "rootProps",
  "rowGap",
  "size",
  "spacing",
  "textAlign",
  "textDecoration",
  "textOverflow",
  "top",
  "transform",
  "transition",
  "variant",
  "w",
  "whiteSpace",
  "width",
  "wordBreak",
  "zIndex",
  "_focus",
  "_focusVisible",
  "_hover",
  "_active",
  "_last",
  "_placeholder",
]);

/**
 * Pure factory — callers hand it to `jest.mock("@chakra-ui/react", ...)`.
 * It constructs React stubs on demand using `jest.requireActual("react")`
 * so no top-level import is captured.
 */
export function chakraStubFactory() {
  const React = jest.requireActual("react");

  function stripStyleProps(props: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(props)) {
      if (!STYLE_PROPS.has(key)) out[key] = props[key];
    }
    return out;
  }

  function passthrough(tag: string) {
    return React.forwardRef(function Stub(props: any, ref: any) {
      const { as, children, ...rest } = props;
      const actualTag = typeof as === "string" ? as : tag;
      return React.createElement(
        actualTag,
        { ...stripStyleProps(rest), ref },
        children,
      );
    });
  }

  const Box = passthrough("div");
  const Button = React.forwardRef(function Button(props: any, ref: any) {
    const { loading, loadingText, children, disabled, ...rest } = props;
    return React.createElement(
      "button",
      {
        ...stripStyleProps(rest),
        ref,
        disabled: disabled || loading,
        "data-loading": loading ? "true" : undefined,
      },
      loading && loadingText ? loadingText : children,
    );
  });
  const IconButton = passthrough("button");
  const Input = passthrough("input");
  const Stack = passthrough("div");
  const Skeleton = passthrough("div");
  const Portal = ({ children }: { children: any }) =>
    React.createElement(React.Fragment, null, children);
  const Flex = passthrough("div");
  const Text = passthrough("span");

  const Progress = {
    Root: passthrough("div"),
    Track: passthrough("div"),
    Range: passthrough("div"),
    Label: passthrough("div"),
    ValueText: passthrough("span"),
  };

  // Dialog root mounts children only when `open`. onOpenChange is stored in
  // a private context so close buttons can bubble up.
  // Note: `React` comes from `jest.requireActual("react")` which is typed
  // `any`, so `createContext<...>(...)` generic type-args are rejected by
  // TypeScript. Cast to a typed helper instead.
  type DialogCtx = { open: boolean; onClose: () => void } | null;
  const createContextTyped = React.createContext as <T>(defaultValue: T) => {
    Provider: (props: { value: T; children?: unknown }) => unknown;
  };
  const DialogContext = createContextTyped<DialogCtx>(null);
  const DialogRoot = function DialogRoot(props: any) {
    const { open, children, onOpenChange, closeOnEscape } = props;
    const ctx = React.useMemo(
      () => ({
        open: !!open,
        onClose: () => onOpenChange?.({ open: false }),
      }),
      [open, onOpenChange],
    );
    // Mirror real Chakra: listen for Escape key to trigger onOpenChange.
    React.useEffect(() => {
      if (!open || closeOnEscape === false) return;
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onOpenChange?.({ open: false });
        }
      };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }, [open, closeOnEscape, onOpenChange]);
    if (!open) return null;
    return React.createElement(DialogContext.Provider, { value: ctx }, children);
  };
  const DialogContent = React.forwardRef(function DialogContent(
    props: any,
    ref: any,
  ) {
    return React.createElement(
      "div",
      { ...stripStyleProps(props), role: "dialog", ref },
      props.children,
    );
  });

  const Dialog = {
    Root: DialogRoot,
    Backdrop: passthrough("div"),
    Positioner: passthrough("div"),
    Content: DialogContent,
    Header: passthrough("header"),
    Body: passthrough("div"),
    Footer: passthrough("footer"),
    Title: passthrough("h2"),
    Description: passthrough("p"),
    CloseTrigger: passthrough("button"),
  };

  // Checkbox with tri-state support: checked=true/false/"indeterminate".
  // We render a <div> (not a <label>) so the label→input click-forwarding
  // path doesn't trigger a duplicate onClick when jsdom dispatches a
  // MouseEvent on the root.
  const CheckboxRoot = React.forwardRef(function CheckboxRoot(
    props: any,
    ref: any,
  ) {
    const {
      checked,
      onCheckedChange,
      disabled,
      children,
      ...rest
    } = props;
    const cleanRest = stripStyleProps(rest);
    const onClick = (e: any) => {
      if (!disabled) {
        const current = checked === true;
        onCheckedChange?.(!current);
      }
      (cleanRest as any).onClick?.(e);
    };
    return React.createElement(
      "div",
      {
        ...cleanRest,
        ref,
        role: "checkbox",
        tabIndex: 0,
        "aria-checked":
          checked === "indeterminate"
            ? "mixed"
            : checked === true
              ? "true"
              : "false",
        "data-disabled": disabled ? "true" : undefined,
        onClick,
      },
      children,
    );
  });
  // HiddenInput renders nothing in the stub — its real job is form-submission
  // parity, which unit tests don't exercise.
  const HiddenInput = () => null;
  const Checkbox = {
    Root: CheckboxRoot,
    HiddenInput,
    Control: passthrough("span"),
    Label: passthrough("span"),
  };

  const Toast = {
    Root: passthrough("div"),
    Title: passthrough("div"),
    Description: passthrough("div"),
    CloseTrigger: passthrough("button"),
    Indicator: passthrough("div"),
  };

  const createToaster = (_opts: unknown) => {
    void _opts;
    return {
      create: jest.fn(),
      dismiss: jest.fn(),
      success: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warning: jest.fn(),
      promise: jest.fn(),
      remove: jest.fn(),
      update: jest.fn(),
      subscribe: jest.fn(() => jest.fn()),
      getVisibleToasts: jest.fn(() => []),
      getCount: jest.fn(() => 0),
      isVisible: jest.fn(() => false),
      isDismissed: jest.fn(() => false),
      pause: jest.fn(),
      resume: jest.fn(),
      expand: jest.fn(),
      collapse: jest.fn(),
      attrs: {},
    };
  };

  // Chakra `chakra("button")` factory returns a passthrough of the given tag
  // that also accepts all style props.
  function chakra(tag: string) {
    return passthrough(tag);
  }

  return {
    Box,
    Button,
    IconButton,
    Input,
    Stack,
    Skeleton,
    Portal,
    Flex,
    Text,
    Progress,
    Dialog,
    Checkbox,
    Toast,
    Toaster: passthrough("div"),
    chakra,
    createToaster,
  };
}

/**
 * Pure factory for `lucide-react`. Every icon component renders as a
 * semantic `<svg data-icon="IconName">` so tests can detect which icon
 * rendered without shipping the real symbol set.
 */
export function lucideStubFactory() {
  const React = jest.requireActual("react");
  return new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "__esModule") return true;
        return function Icon(props: any) {
          return React.createElement("svg", {
            "data-icon": prop,
            "data-size": props?.size,
            "aria-hidden": "true",
          });
        };
      },
    },
  );
}
