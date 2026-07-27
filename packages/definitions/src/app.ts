/**
 * Icon used for an app created without one, when no icon could be matched by
 * name either.
 *
 * This is served from the application itself rather than pulled from the
 * dashboard-icons CDN. Upstream fell back to that pack's `homarr.svg`, which
 * meant every unmatched app on a Muninn instance rendered with the Homarr bird.
 */
export const defaultAppIconUrl = "/logo/logo.png";
