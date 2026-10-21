import { expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import {
  Button,
  ErrorNotice,
  SelectField,
  TextField,
} from "../src/components.js";
import { ApiFailure } from "../src/api-client.js";

test("select fields retain native choices, restrictions and associated help", async () => {
  const screen = await render(
    <SelectField
      label="Session duration"
      hint="Applied to direct sessions."
      defaultValue="12"
    >
      <option value="12">12 hours</option>
      <option value="24">24 hours</option>
      <option value="none" disabled>
        Unavailable
      </option>
    </SelectField>,
  );
  const select = screen.getByRole("combobox", { name: "Session duration" });
  await expect
    .element(select)
    .toHaveAccessibleDescription("Applied to direct sessions.");
  await expect
    .element(screen.getByRole("option", { name: "Unavailable" }))
    .toBeDisabled();
  await select.selectOptions("24");
  await expect.element(select).toHaveValue("24");
});

test("text fields retain unique labels, help and caller descriptions", async () => {
  const screen = await render(
    <>
      <p id="shared-help">Only synthetic input.</p>
      <TextField
        label="Display name"
        hint="Visible to colleagues."
        aria-describedby="shared-help"
      />
      <TextField
        label="Login"
        hint="Use your assigned login."
        error="This login is taken."
      />
    </>,
  );
  const name = screen.getByRole("textbox", { name: "Display name" });
  const login = screen.getByRole("textbox", { name: "Login" });
  await expect
    .element(name)
    .toHaveAccessibleDescription(
      "Only synthetic input. Visible to colleagues.",
    );
  await expect
    .element(login)
    .toHaveAccessibleDescription(
      "Use your assigned login. This login is taken.",
    );
  await expect.element(login).toHaveAttribute("aria-invalid", "true");
  await name.fill("Example Person");
  await expect.element(name).toHaveValue("Example Person");
  await expect.element(login).toHaveValue("");
});

test("buttons opt into form submission and prevent activation while pending", async () => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  const pending = vi.fn();
  const screen = await render(
    <form onSubmit={submit}>
      <Button variant="secondary">Cancel</Button>
      <Button type="submit">Save</Button>
      <Button loading onClick={pending}>
        Working
      </Button>
    </form>,
  );
  await screen.getByRole("button", { name: "Cancel" }).click();
  expect(submit).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "Save" }).click();
  expect(submit).toHaveBeenCalledOnce();
  await expect
    .element(screen.getByRole("button", { name: "Working" }))
    .toBeDisabled();
  await expect
    .element(screen.getByRole("button", { name: "Working" }))
    .toHaveAttribute("aria-busy", "true");
  expect(pending).not.toHaveBeenCalled();
});

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
