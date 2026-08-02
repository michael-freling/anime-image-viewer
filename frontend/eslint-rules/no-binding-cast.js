/**
 * ESLint rule: no-binding-cast
 *
 * Forbids laundering a Wails service binding through a double type assertion
 * (`X as unknown as Y` / `X as any as Y`), where `X` is a value imported from
 * `lib/api` or the generated `bindings/` tree.
 *
 * This is the exact footgun that let tag create/update/delete silently no-op.
 * The old code did:
 *
 *   const svc = TagService as unknown as Record<string, unknown>;
 *   const fn = svc["CreateTag"];            // undefined at runtime
 *
 * The double cast erased the binding's real method signatures, so `tsc` could
 * not tell that `CreateTag`/`UpdateName`/… don't exist on that service. Every
 * call fell through to a no-op stub. Call the correctly-typed binding directly
 * so the compiler verifies the method exists.
 *
 * The rule only fires on the *binding identifier itself* being laundered
 * (`TagService as unknown as …`). Casting a call *result* (`res as unknown as
 * AnimeDetail`) is a different, narrower concern and is left alone.
 */

"use strict";

function importedName(specifier) {
  return specifier && specifier.local ? specifier.local.name : null;
}

function isBindingSource(source) {
  // Relative import of the api barrel (…/lib/api) or anything under bindings/.
  return /(^|\/)lib\/api$/.test(source) || source.includes("/bindings/");
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow erasing a Wails binding's type via `as unknown as` / `as any as`.",
    },
    schema: [],
    messages: {
      bindingCast:
        "Do not launder the '{{name}}' binding through `as unknown as` / `as any as`. " +
        "This erases the binding's method types so the compiler can't catch calls to " +
        "methods that don't exist (the tag create/update/delete no-op bug). " +
        "Call the correctly-typed binding directly.",
    },
  },

  create(context) {
    const bindingNames = new Set();

    return {
      ImportDeclaration(node) {
        if (!node.source || typeof node.source.value !== "string") return;
        if (!isBindingSource(node.source.value)) return;
        for (const spec of node.specifiers) {
          const name = importedName(spec);
          if (name) bindingNames.add(name);
        }
      },

      // Outer of a double assertion: `<inner> as <Outer>` where <inner> is
      // `<base> as unknown|any`.
      TSAsExpression(node) {
        const inner = node.expression;
        if (!inner || inner.type !== "TSAsExpression") return;

        const innerType = inner.typeAnnotation;
        const launders =
          innerType &&
          (innerType.type === "TSUnknownKeyword" ||
            innerType.type === "TSAnyKeyword");
        if (!launders) return;

        // Unwrap `!` (non-null) then find the base identifier of the cast.
        let base = inner.expression;
        while (base && base.type === "TSNonNullExpression") base = base.expression;

        let name = null;
        if (base && base.type === "Identifier") {
          name = base.name;
        } else if (
          base &&
          base.type === "MemberExpression" &&
          base.object &&
          base.object.type === "Identifier"
        ) {
          name = base.object.name;
        }

        if (name && bindingNames.has(name)) {
          context.report({ node, messageId: "bindingCast", data: { name } });
        }
      },
    };
  },
};
