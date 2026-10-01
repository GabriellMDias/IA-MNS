# Approval Request Reference Workflow

This browser workflow is part of Orion's foundation-only reference implementation; projects derived from Orion start without it.

- Read the [business specification](../../../../docs/domains/approval-request.md) and [implementation conventions](../../../../docs/domains/approval-request-implementation.md) before changing behavior.
- Keep the workflow's routes, pages, credential handling, styles, and wording in this folder. Shared shell and portal code must not import it; only `src/modules.tsx` composes it.
- Its browser journeys live in `test/e2e/approval-requests/` and start their own disposable stack.
