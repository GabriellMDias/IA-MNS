import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { AccessTokenForm } from "../../src/approval-requests/access-token-form.js";

test("the token form supports keyboard submission without persisting the credential", async () => {
  const connected = vi.fn();
  const screen = await render(<AccessTokenForm onConnect={connected} />);
  const field = screen.getByLabelText("Access token");
  await expect.element(field).toHaveAttribute("type", "password");
  await field.fill("  synthetic-token  ");
  await userEvent.keyboard("{Enter}");
  expect(connected).toHaveBeenCalledWith("synthetic-token");
  await expect.element(field).toHaveValue("");
});
