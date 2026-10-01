import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ErrorNotice } from "../src/components.js";
import { ApiFailure } from "../src/api-client.js";

test("a failure exposes an accessible reload action", async () => {
  const reload = vi.fn();
  const screen = await render(
    <ErrorNotice
      error={new ApiFailure(409, "EXAMPLE_CONFLICT", "test-request", "Changed")}
      messages={{ EXAMPLE_CONFLICT: "This item changed. Reload it first." }}
      reloadLabel="Reload current item"
      onReload={reload}
    />,
  );
  await expect.element(screen.getByRole("alert")).toBeVisible();
  await expect
    .element(screen.getByText("This item changed. Reload it first."))
    .toBeVisible();
  await screen.getByRole("button", { name: "Reload current item" }).click();
  expect(reload).toHaveBeenCalledOnce();
});

test("an unknown write outcome is never presented as a known failure", async () => {
  const screen = await render(
    <ErrorNotice error={new TypeError("disconnect")} operation="write" />,
  );
  await expect
    .element(screen.getByText(/Update outcome is unknown/))
    .toBeVisible();
  await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
});
