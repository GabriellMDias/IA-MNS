# Approval Request Reference Module

This module is Orion's executable reference implementation. It exists only in the Orion foundation repository; projects derived from Orion start without it.

- Read the [business specification](../../../../../docs/domains/approval-request.md) and [implementation conventions](../../../../../docs/domains/approval-request-implementation.md) before changing behavior.
- Keep the module self-contained: `module.ts` declares its contract, `errors.ts` its public codes, and its Prisma model, metadata, runtime grants, migration, tests, and smoke stay in the module-named locations listed by the API-local instructions.
- Shared runtime files must not import this module; only `src/modules.ts` composes it.
