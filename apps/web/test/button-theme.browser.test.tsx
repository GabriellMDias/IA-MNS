import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { Button } from "../src/components.js";
import "../src/styles.css";

test("button text retains AA contrast while switching themes with motion enabled", async () => {
  const root = document.documentElement;
  const originalTheme = root.dataset.theme;
  const rgb = (color: string) => color.match(/[\d.]+/g)!.map(Number);
  const luminance = (color: number[]) => {
    const [red, green, blue] = color.slice(0, 3).map((value) => {
      const channel = value / 255;
      return channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  try {
    root.dataset.theme = "light";
    await render(
      <div id="theme-contrast" style={{ background: "var(--surface)" }}>
        {(["primary", "secondary", "ghost", "danger"] as const).map(
          (variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ),
        )}
      </div>,
    );
    const buttons = document.querySelectorAll<HTMLButtonElement>(
      "#theme-contrast button",
    );
    expect(buttons).toHaveLength(4);
    for (const theme of ["dark", "light"]) {
      // Flush the previous theme so the browser creates real CSS transitions.
      for (const button of buttons) button.getBoundingClientRect();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      root.dataset.theme = theme;
      for (const button of buttons) {
        const animations = button.getAnimations();
        // Sample the start, intermediate frames and end without timing-dependent sleeps.
        for (const elapsed of [0, 30, 60, 90, 120]) {
          for (const animation of animations) {
            animation.pause();
            animation.currentTime = elapsed;
          }
          const style = getComputedStyle(button);
          const background = rgb(style.backgroundColor);
          const backdrop =
            background[3] === 0
              ? rgb(getComputedStyle(button.parentElement!).backgroundColor)
              : background;
          const foregroundLuminance = luminance(rgb(style.color));
          const backgroundLuminance = luminance(backdrop);
          const contrast =
            (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
            (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
          expect(
            contrast,
            `${button.textContent} in ${theme} at ${elapsed}ms`,
          ).toBeGreaterThanOrEqual(4.5);
        }
        for (const animation of animations) animation.finish();
      }
    }
  } finally {
    if (originalTheme === undefined) delete root.dataset.theme;
    else root.dataset.theme = originalTheme;
  }
});
