/** The app root - where the "Open Trackie" nav button points. */
export const APP_URL = 'https://app.trackie.nz';

/** One-click sign-in deep link - where the "Get started" hero button points. */
export const GET_STARTED_URL = `${APP_URL}/get-started`;

/**
 * Top-nav links. Intentionally empty for launch - the nav is just the logo and
 * the "Open Trackie" button. To add a page later, drop a `{ label, href }` here
 * and the nav renders it automatically.
 */
export const NAV_LINKS: { label: string; href: string }[] = [];
