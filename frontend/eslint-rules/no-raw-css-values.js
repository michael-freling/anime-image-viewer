/**
 * ESLint rule: no-raw-css-values
 *
 * Warns when raw CSS values (hex colors, pixel values) are used in JSX props
 * instead of Chakra UI semantic tokens. This encourages consistent use of the
 * design system's spacing scale and color palette.
 *
 * Examples of violations:
 *   <Box color="#ff0000" />        -> use color="red.500"
 *   <Box padding="16px" />         -> use padding="4"
 *   <Box margin="8px 16px" />      -> use margin={{ base: "2", md: "4" }}
 *
 * Exceptions:
 *   - width/height on img, svg, Icon, Image elements (often need exact pixels)
 *   - data-* attributes
 *   - String template expressions (dynamic values)
 *   - Non-layout/non-color props (e.g., aria-*, role, etc.)
 */

// Props that commonly accept Chakra spacing tokens
const SPACING_PROPS = new Set([
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'paddingX', 'paddingY', 'paddingInline', 'paddingBlock',
  'p', 'pt', 'pr', 'pb', 'pl', 'px', 'py', 'ps', 'pe',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'marginX', 'marginY', 'marginInline', 'marginBlock',
  'm', 'mt', 'mr', 'mb', 'ml', 'mx', 'my', 'ms', 'me',
  'gap', 'rowGap', 'columnGap',
  'top', 'right', 'bottom', 'left',
  'inset', 'insetX', 'insetY',
  'fontSize', 'borderRadius', 'rounded',
]);

// Props that accept Chakra color tokens
const COLOR_PROPS = new Set([
  'color', 'bg', 'bgColor', 'backgroundColor',
  'borderColor', 'borderTopColor', 'borderRightColor',
  'borderBottomColor', 'borderLeftColor',
  'outlineColor', 'fill', 'stroke',
  'shadowColor', 'accentColor',
  'colorPalette',
]);

// Elements where width/height with exact pixels is acceptable
const SIZE_EXCEPTION_ELEMENTS = new Set([
  'img', 'svg', 'Icon', 'Image', 'video', 'canvas',
  'Img', 'SVG', 'Avatar', 'Logo',
]);

// Patterns
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$/;
const RGB_PATTERN = /^rgba?\s*\(/;
const HSL_PATTERN = /^hsla?\s*\(/;
const PX_VALUE_PATTERN = /\d+px/;

function isColorValue(value) {
  return HEX_COLOR_PATTERN.test(value) ||
    RGB_PATTERN.test(value) ||
    HSL_PATTERN.test(value);
}

function hasPxValue(value) {
  return PX_VALUE_PATTERN.test(value);
}

function isDataAttribute(propName) {
  return propName.startsWith('data-');
}

function isSizeExceptionElement(node) {
  const parent = node.parent;
  if (!parent || parent.type !== 'JSXOpeningElement') return false;

  const elementName = parent.name;
  if (elementName.type === 'JSXIdentifier') {
    return SIZE_EXCEPTION_ELEMENTS.has(elementName.name);
  }
  if (elementName.type === 'JSXMemberExpression') {
    return SIZE_EXCEPTION_ELEMENTS.has(elementName.property.name);
  }
  return false;
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Discourage raw CSS values in favor of Chakra UI tokens',
      category: 'Best Practices',
      recommended: false,
    },
    messages: {
      noRawColor:
        'Avoid raw color value "{{value}}" in prop "{{prop}}". ' +
        'Use a Chakra UI color token instead (e.g., "red.500", "gray.700").',
      noRawPixels:
        'Avoid raw pixel value "{{value}}" in prop "{{prop}}". ' +
        'Use a Chakra UI spacing/size token instead (e.g., "4", "6", "8").',
    },
    schema: [],
  },

  create(context) {
    return {
      JSXAttribute(node) {
        const propName = node.name && node.name.name;
        if (!propName || typeof propName !== 'string') return;

        // Skip data-* attributes
        if (isDataAttribute(propName)) return;

        // Skip width/height on image/icon elements
        if (
          (propName === 'width' || propName === 'height' ||
           propName === 'w' || propName === 'h' ||
           propName === 'minW' || propName === 'minH' ||
           propName === 'maxW' || propName === 'maxH') &&
          isSizeExceptionElement(node)
        ) {
          return;
        }

        // Only check string literal values
        if (!node.value) return;

        let rawValue = null;

        if (node.value.type === 'Literal' && typeof node.value.value === 'string') {
          rawValue = node.value.value;
        } else if (
          node.value.type === 'JSXExpressionContainer' &&
          node.value.expression.type === 'Literal' &&
          typeof node.value.expression.value === 'string'
        ) {
          rawValue = node.value.expression.value;
        }

        // Skip if no string value found (template literals, objects, etc.)
        if (!rawValue) return;

        // Check for raw color values in color props
        if (COLOR_PROPS.has(propName) && isColorValue(rawValue)) {
          context.report({
            node,
            messageId: 'noRawColor',
            data: { value: rawValue, prop: propName },
          });
          return;
        }

        // Check for raw pixel values in spacing/layout props
        if (SPACING_PROPS.has(propName) && hasPxValue(rawValue)) {
          context.report({
            node,
            messageId: 'noRawPixels',
            data: { value: rawValue, prop: propName },
          });
          return;
        }

        // Also flag hex colors in any prop that looks like a color prop
        // (catches custom color props like headerColor, etc.)
        if (propName.toLowerCase().includes('color') && isColorValue(rawValue)) {
          context.report({
            node,
            messageId: 'noRawColor',
            data: { value: rawValue, prop: propName },
          });
        }
      },
    };
  },
};
