/**
 * Where this single application instance is running. Embedded hosts open the
 * same build under /embed/pdt or /embed/sankhya; the router then uses that
 * prefix as its basepath so navigation and reloads stay inside the embedded
 * surface (whose responses carry the host-specific frame-ancestors policy).
 * The surface never grants permission; identity and authorization do.
 */
export type Surface = "direct" | "pdt" | "sankhya";

export function detectSurface(pathname: string): {
  surface: Surface;
  basepath: string;
} {
  const match = /^\/embed\/(pdt|sankhya)(?=\/|$)/.exec(pathname);
  return match
    ? { surface: match[1] as Surface, basepath: match[0] }
    : { surface: "direct", basepath: "/" };
}

export const currentSurface = detectSurface(window.location.pathname);
