/**
 * Root layout component used as the top-level route `element`.
 *
 * Every route in the app renders inside AppShell; this module exists as a
 * thin re-export so `src/app/routes.tsx` can import a single module path
 * that conceptually owns the chrome. AppShell itself already renders the
 * react-router `<Outlet />`, so there's no extra wrapping here.
 */
export { AppShell as RootLayout } from "../components/layout/app-shell";
export { default } from "../components/layout/app-shell";
