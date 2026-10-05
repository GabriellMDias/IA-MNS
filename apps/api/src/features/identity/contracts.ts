import { Type, type TSchema } from "typebox";
import type { ApiOperation } from "../../module.js";
import { errorEnvelopeSchema } from "../../errors.js";

const object = { additionalProperties: false };
const nullable = <T extends TSchema>(schema: T) =>
  Type.Union([schema, Type.Null()]);
const errors = Object.fromEntries(
  [400, 401, 403, 404, 409, 429, 500, 503].map((status) => [
    status,
    errorEnvelopeSchema,
  ]),
);
const secret = Type.String({ pattern: "^[A-Za-z0-9_-]{32,128}$" });
const uuid = Type.String({ format: "uuid" });
const provider = Type.Union([Type.Literal("pdt"), Type.Literal("sankhya")]);
const surface = Type.Union([
  Type.Literal("direct"),
  Type.Literal("pdt"),
  Type.Literal("sankhya"),
]);
const signInMethod = Type.Union([
  Type.Literal("local"),
  Type.Literal("pdt"),
  Type.Literal("sankhya"),
]);
const codusu = Type.String({ pattern: "^[1-9][0-9]{0,9}$" });
const loginField = Type.String({ minLength: 1, maxLength: 64 });
const passwordField = Type.String({ minLength: 1, maxLength: 1024 });
const codeField = Type.String({ minLength: 6, maxLength: 16 });

export const tokenSchema = Type.Object(
  { accessToken: Type.String(), expiresIn: Type.Integer({ minimum: 1 }) },
  object,
);
const provisionReason = Type.Union([
  Type.Literal("candidate"),
  Type.Literal("signed_in"),
]);
export const outcomeSchema = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("authenticated"),
      accessToken: Type.String(),
      expiresIn: Type.Integer({ minimum: 1 }),
      provisioned: Type.Boolean({
        description: "This first access created the Person automatically.",
      }),
    },
    object,
  ),
  Type.Object(
    { kind: Type.Literal("mfa_required"), challenge: Type.String() },
    object,
  ),
  Type.Object(
    {
      kind: Type.Literal("provision_required"),
      ticket: Type.String(),
      provider,
      label: nullable(Type.String()),
      reason: provisionReason,
      methods: Type.Array(signInMethod),
    },
    object,
  ),
  Type.Object(
    {
      kind: Type.Literal("merge_available"),
      ticket: Type.String(),
      provider,
    },
    object,
  ),
  Type.Object({ kind: Type.Literal("linked"), provider }, object),
  Type.Object({ kind: Type.Literal("reauthenticated") }, object),
]);

const linkSchema = Type.Object(
  {
    id: uuid,
    provider,
    label: nullable(Type.String()),
    establishedBy: Type.Union([
      Type.Literal("proof"),
      Type.Literal("directory"),
    ]),
    linkedAt: Type.String({ format: "date-time" }),
    lastVerifiedAt: Type.String({ format: "date-time" }),
  },
  object,
);
const sessionSchema = Type.Object(
  {
    id: uuid,
    method: Type.String(),
    surface,
    assurance: Type.Union([Type.Literal("single"), Type.Literal("mfa")]),
    createdAt: Type.String({ format: "date-time" }),
    lastSeenAt: Type.String({ format: "date-time" }),
    expiresAt: Type.String({ format: "date-time" }),
    current: Type.Boolean(),
  },
  object,
);
const catalogSchema = Type.Array(
  Type.Object(
    {
      permission: Type.String(),
      title: Type.String(),
      access: Type.Union([
        Type.Literal("read"),
        Type.Literal("write"),
        Type.Literal("sensitive"),
      ]),
      autoGrantProviders: Type.Array(provider),
    },
    object,
  ),
);
const personSchema = Type.Object(
  {
    id: uuid,
    displayName: Type.String(),
    status: Type.Union([Type.Literal("active"), Type.Literal("disabled")]),
    owner: Type.Boolean(),
    grants: Type.Array(Type.String()),
    permissions: Type.Array(Type.String()),
    links: Type.Array(linkSchema),
    local: nullable(
      Type.Object(
        {
          login: Type.String(),
          totpEnabled: Type.Boolean(),
          recoveryCodesRemaining: Type.Integer({ minimum: 0 }),
        },
        object,
      ),
    ),
    sessions: Type.Array(sessionSchema),
  },
  object,
);
export const meSchema = Type.Object(
  {
    person: personSchema,
    session: Type.Object(
      {
        id: uuid,
        method: Type.String(),
        surface,
        assurance: Type.Union([Type.Literal("single"), Type.Literal("mfa")]),
        authenticatedAt: Type.String({ format: "date-time" }),
      },
      object,
    ),
    linkableProviders: Type.Array(provider),
  },
  object,
);
const ok = Type.Object({ ok: Type.Literal(true) }, object);

function operation(
  method: ApiOperation["method"],
  url: string,
  operationId: string,
  description: string,
  schema: ApiOperation["schema"],
  authenticated = false,
): ApiOperation {
  return {
    method,
    url,
    operationId,
    description,
    schema,
    ...(authenticated ? { authentication: "bearer" as const } : {}),
  };
}

export const statusOperation = operation(
  "GET",
  "/identity/status",
  "getIdentityStatus",
  "Available sign-in methods and embedded host origins. Public; no account data. There is no public account creation: local credentials come only from owner invitations.",
  {
    response: {
      200: Type.Object(
        {
          configured: Type.Boolean(),
          methods: Type.Object(
            {
              local: Type.Boolean(),
              pdt: Type.Boolean(),
              sankhya: Type.Boolean(),
            },
            object,
          ),
          sankhyaSessionTrust: Type.Union([
            Type.Literal("pending"),
            Type.Literal("approved"),
          ]),
          embedHosts: Type.Object(
            { pdt: nullable(Type.String()), sankhya: nullable(Type.String()) },
            object,
          ),
        },
        object,
      ),
    },
  },
);
export const localLoginOperation = operation(
  "POST",
  "/identity/login/local",
  "loginLocal",
  "Sign in with an IA-MNS login and password. Returns an access token or a second-factor challenge; direct sessions also receive an HttpOnly refresh cookie. Uniform failure for unknown or wrong credentials.",
  {
    body: Type.Object(
      {
        login: loginField,
        password: passwordField,
        surface: Type.Optional(surface),
      },
      object,
    ),
    response: { 200: outcomeSchema, ...errors },
  },
);
export const mfaOperation = operation(
  "POST",
  "/identity/login/mfa",
  "completeMfa",
  "Complete a local sign-in with a TOTP code or a single-use recovery code.",
  {
    body: Type.Object({ challenge: secret, code: codeField }, object),
    response: { 200: outcomeSchema, ...errors },
  },
);
export const refreshOperation = operation(
  "POST",
  "/identity/session/refresh",
  "refreshSession",
  "Rotate the direct-URL refresh cookie and return a new access token. Reuse of a rotated credential revokes the session.",
  { body: Type.Object({}, object), response: { 200: tokenSchema, ...errors } },
);
export const logoutOperation = operation(
  "POST",
  "/identity/logout",
  "logout",
  "Revoke the current session (bearer or refresh cookie) and clear the cookie.",
  { body: Type.Object({}, object), response: { 200: ok, ...errors } },
);
export const providerStartOperation = operation(
  "POST",
  "/identity/providers/:provider/start",
  "startProviderSignIn",
  "Start a PDT Connect or Sankhya proof. Direct mode returns the provider URL and binds the flow to an HttpOnly cookie; embedded mode returns a pending identifier and PKCE/nonce values for the host bridge. Link and reauthentication intents require a bearer; the invite intent requires an owner-issued link invitation.",
  {
    params: Type.Object({ provider }, object),
    body: Type.Object(
      {
        intent: Type.Union([
          Type.Literal("login"),
          Type.Literal("link"),
          Type.Literal("reauth"),
          Type.Literal("invite"),
        ]),
        mode: Type.Union([Type.Literal("direct"), Type.Literal("embedded")]),
        invitation: Type.Optional(secret),
        resumeFirstAccess: Type.Optional(
          Type.Boolean({
            description:
              "Direct login that proves a profile suggested by a pending first access; the callback returns to that first access.",
          }),
        ),
      },
      object,
    ),
    response: {
      200: Type.Union([
        Type.Object(
          { mode: Type.Literal("direct"), redirectUrl: Type.String() },
          object,
        ),
        Type.Object(
          {
            mode: Type.Literal("embedded"),
            pendingId: Type.String(),
            hostOrigin: nullable(Type.String()),
            state: Type.Optional(Type.String()),
            codeChallenge: Type.Optional(Type.String()),
            clientId: Type.Optional(Type.String()),
            redirectUri: Type.Optional(Type.String()),
            nonce: Type.Optional(Type.String()),
          },
          object,
        ),
      ]),
      ...errors,
    },
  },
);
export const pdtCallbackOperation = operation(
  "GET",
  "/identity/pdt/callback",
  "pdtCallback",
  "PDT Connect redirect target. Validates state, issuer and the browser binding cookie, redeems the code server-side and redirects into the web application. The query is never logged.",
  {
    querystring: Type.Object(
      {
        code: Type.Optional(Type.String({ maxLength: 200 })),
        state: Type.Optional(Type.String({ maxLength: 200 })),
        iss: Type.Optional(Type.String({ maxLength: 500 })),
      },
      { additionalProperties: true },
    ),
    response: { 303: Type.Null() },
  },
);
export const sankhyaCallbackOperation = operation(
  "POST",
  "/identity/sankhya/callback",
  "sankhyaCallback",
  "Form-post target of the Om identity add-on. Verifies the host assertion against pinned keys, the flow state and the browser binding cookie, then redirects into the web application.",
  {
    body: Type.Object(
      {
        assertion: Type.String({ maxLength: 4096 }),
        state: Type.String({ maxLength: 200 }),
      },
      object,
    ),
    bodyContentType: "application/x-www-form-urlencoded",
    response: { 303: Type.Null() },
  },
);
export const embeddedCompleteOperation = operation(
  "POST",
  "/identity/providers/:provider/complete",
  "completeEmbeddedSignIn",
  "Complete an embedded proof delivered by the host bridge (PDT code or Sankhya assertion). No cookies; the access token is returned to the in-memory client.",
  {
    params: Type.Object({ provider }, object),
    body: Type.Object(
      {
        pendingId: secret,
        state: Type.Optional(Type.String({ maxLength: 300 })),
        code: Type.Optional(Type.String({ maxLength: 200 })),
        iss: Type.Optional(Type.String({ maxLength: 500 })),
        assertion: Type.Optional(Type.String({ maxLength: 4096 })),
      },
      object,
    ),
    response: { 200: outcomeSchema, ...errors },
  },
);
export const provisionCreateOperation = operation(
  "POST",
  "/identity/provision/create",
  "createProvisionedPerson",
  "First access that stopped for confirmation: the person states the suggested profile is not theirs (or wants a separate profile) and a new Person is created for the verified external identity. Ticket from the body or the provisioning cookie.",
  {
    body: Type.Object({ ticket: Type.Optional(secret) }, object),
    response: { 200: outcomeSchema, ...errors },
  },
);
export const provisionLinkOperation = operation(
  "POST",
  "/identity/provision/link",
  "linkProvisionedIdentity",
  "First access that stopped for confirmation: attach the verified external identity to the Person the caller just signed in to with another method (recent authentication).",
  {
    body: Type.Object({ ticket: Type.Optional(secret) }, object),
    response: { 200: outcomeSchema, ...errors },
  },
  true,
);
export const provisionInspectOperation = operation(
  "POST",
  "/identity/provision/inspect",
  "inspectProvision",
  "Describe a pending first access without consuming it: provider, reported name, why automatic creation stopped and which sign-in methods can prove an existing profile.",
  {
    body: Type.Object({ ticket: Type.Optional(secret) }, object),
    response: {
      200: Type.Object(
        {
          provider,
          label: nullable(Type.String()),
          reason: provisionReason,
          methods: Type.Array(signInMethod),
        },
        object,
      ),
      ...errors,
    },
  },
);
export const mergeOperation = operation(
  "POST",
  "/identity/merge",
  "mergeProvenProfile",
  "Consolidate into the caller's Person a profile whose only sign-in method is the external account the caller just proved; conversations and links move. Recent authentication; ticket from the body or the merge cookie.",
  {
    body: Type.Object({ ticket: Type.Optional(secret) }, object),
    response: { 200: outcomeSchema, ...errors },
  },
  true,
);
export const invitationInspectOperation = operation(
  "POST",
  "/identity/invitations/inspect",
  "inspectInvitation",
  "Validate a bootstrap, enrollment, reset or link invitation without consuming it.",
  {
    body: Type.Object(
      {
        purpose: Type.Union([
          Type.Literal("bootstrap"),
          Type.Literal("enrollment"),
          Type.Literal("reset"),
          Type.Literal("link"),
        ]),
        token: secret,
      },
      object,
    ),
    response: {
      200: Type.Object(
        { displayName: nullable(Type.String()), provider: nullable(provider) },
        object,
      ),
      ...errors,
    },
  },
);
export const bootstrapOperation = operation(
  "POST",
  "/identity/bootstrap",
  "completeBootstrap",
  "Consume a server-issued bootstrap invitation: create the first owner with a local credential. A second factor must be enrolled before administration.",
  {
    body: Type.Object(
      {
        token: secret,
        displayName: Type.String({ minLength: 1, maxLength: 120 }),
        login: loginField,
        password: passwordField,
      },
      object,
    ),
    response: { 200: outcomeSchema, ...errors },
  },
);
export const invitationCompleteOperation = operation(
  "POST",
  "/identity/invitations/complete",
  "completeInvitation",
  "Consume an owner-issued enrollment or reset invitation and create the local credential.",
  {
    body: Type.Object(
      {
        purpose: Type.Union([
          Type.Literal("enrollment"),
          Type.Literal("reset"),
        ]),
        token: secret,
        login: loginField,
        password: passwordField,
      },
      object,
    ),
    response: { 200: outcomeSchema, ...errors },
  },
);
export const meOperation = operation(
  "GET",
  "/identity/me",
  "getIdentityMe",
  "The signed-in Person: profile, sign-in methods, links, effective permissions and active sessions.",
  { response: { 200: meSchema, ...errors } },
  true,
);
export const renameOperation = operation(
  "PATCH",
  "/identity/me",
  "updateIdentityMe",
  "Change the Person's display name.",
  {
    body: Type.Object(
      { displayName: Type.String({ minLength: 1, maxLength: 120 }) },
      object,
    ),
    response: { 200: ok, ...errors },
  },
  true,
);
export const reauthenticateOperation = operation(
  "POST",
  "/identity/me/reauthenticate",
  "reauthenticate",
  "Step-up with the local password and, when enrolled, a second factor. Refreshes the recent-authentication time.",
  {
    body: Type.Object(
      { password: passwordField, code: Type.Optional(codeField) },
      object,
    ),
    response: { 200: tokenSchema, ...errors },
  },
  true,
);
export const passwordOperation = operation(
  "PUT",
  "/identity/me/password",
  "setLocalPassword",
  "Add a local credential (with a login) as another sign-in method of the signed-in Person, or change the password; requires recent authentication and revokes other sessions on change. Never creates a Person.",
  {
    body: Type.Object(
      { password: passwordField, login: Type.Optional(loginField) },
      object,
    ),
    response: { 200: ok, ...errors },
  },
  true,
);
export const totpStartOperation = operation(
  "POST",
  "/identity/me/totp",
  "startTotpSetup",
  "Start second-factor setup. Returns the secret once for the authenticator app.",
  {
    body: Type.Object({}, object),
    response: {
      200: Type.Object(
        {
          setup: Type.String(),
          secret: Type.String(),
          otpauthUri: Type.String(),
        },
        object,
      ),
      ...errors,
    },
  },
  true,
);
export const totpConfirmOperation = operation(
  "POST",
  "/identity/me/totp/confirm",
  "confirmTotpSetup",
  "Confirm the second factor with a current code; returns single-use recovery codes once and upgrades the session to strong assurance.",
  {
    body: Type.Object({ setup: secret, code: codeField }, object),
    response: {
      200: Type.Object(
        {
          recoveryCodes: Type.Array(Type.String(), {
            minItems: 10,
            maxItems: 10,
          }),
          accessToken: Type.String(),
          expiresIn: Type.Integer({ minimum: 1 }),
        },
        object,
      ),
      ...errors,
    },
  },
  true,
);
export const totpDisableOperation = operation(
  "DELETE",
  "/identity/me/totp",
  "disableTotp",
  "Remove the second factor (not allowed for owners). Requires recent strong authentication.",
  { response: { 200: ok, ...errors } },
  true,
);
export const recoveryCodesOperation = operation(
  "POST",
  "/identity/me/recovery-codes",
  "regenerateRecoveryCodes",
  "Replace all recovery codes; requires recent strong authentication.",
  {
    body: Type.Object({}, object),
    response: {
      200: Type.Object(
        {
          recoveryCodes: Type.Array(Type.String(), {
            minItems: 10,
            maxItems: 10,
          }),
        },
        object,
      ),
      ...errors,
    },
  },
  true,
);
export const unlinkOperation = operation(
  "DELETE",
  "/identity/me/links/:linkId",
  "removeIdentityLink",
  "Remove one of the Person's external links (recent authentication; never the last sign-in method). Audited.",
  {
    params: Type.Object({ linkId: uuid }, object),
    response: { 200: ok, ...errors },
  },
  true,
);
export const revokeSessionOperation = operation(
  "DELETE",
  "/identity/me/sessions/:sessionId",
  "revokeIdentitySession",
  "Revoke one of the Person's sessions.",
  {
    params: Type.Object({ sessionId: uuid }, object),
    response: { 200: ok, ...errors },
  },
  true,
);
const personParams = Type.Object({ personId: uuid }, object);
const adminCapabilities = Type.Object(
  {
    sankhyaDirectory: Type.Boolean({
      description:
        "Owners can select real Sankhya users from the ERP directory.",
    }),
    linkInvitations: Type.Array(provider, {
      description: "Providers whose sign-in can complete a link invitation.",
    }),
  },
  object,
);
const invitationList = Type.Array(
  Type.Object({ provider, token: Type.String() }, object),
);
export const adminListOperation = operation(
  "GET",
  "/identity/admin/persons",
  "listIdentityPersons",
  "Owner: bounded, name-ordered Person listing with optional search. Requires strong authentication.",
  {
    querystring: Type.Object(
      {
        query: Type.Optional(Type.String({ maxLength: 120 })),
        cursor: Type.Optional(Type.String({ maxLength: 500 })),
      },
      object,
    ),
    response: {
      200: Type.Object(
        {
          items: Type.Array(
            Type.Object(
              {
                id: uuid,
                displayName: Type.String(),
                status: Type.Union([
                  Type.Literal("active"),
                  Type.Literal("disabled"),
                ]),
                owner: Type.Boolean(),
                providers: Type.Array(provider),
                login: nullable(Type.String()),
              },
              object,
            ),
            { maxItems: 30 },
          ),
          nextCursor: nullable(Type.String()),
          capabilities: adminCapabilities,
        },
        object,
      ),
      ...errors,
    },
  },
  true,
);
export const adminDetailOperation = operation(
  "GET",
  "/identity/admin/persons/:personId",
  "getIdentityPerson",
  "Owner: a Person's methods, links, grants, effective permissions, sessions, recent audit and the grantable catalog.",
  {
    params: personParams,
    response: {
      200: Type.Object(
        {
          person: personSchema,
          capabilities: adminCapabilities,
          catalog: catalogSchema,
          audit: Type.Array(
            Type.Object(
              {
                action: Type.String(),
                occurredAt: Type.String({ format: "date-time" }),
                byOwner: Type.Boolean(),
                details: Type.Record(
                  Type.String(),
                  Type.Union([
                    Type.String(),
                    Type.Number(),
                    Type.Boolean(),
                    Type.Null(),
                  ]),
                ),
              },
              object,
            ),
          ),
        },
        object,
      ),
      ...errors,
    },
  },
  true,
);
export const adminCreateOperation = operation(
  "POST",
  "/identity/admin/persons",
  "createIdentityPerson",
  "Owner: create a Person with any combination of a one-time local enrollment invitation, a real Sankhya user selected from the directory (validated server-side) and one-time link invitations the person completes by proving a PDT Connect or Sankhya account. Invitations expire in 72 hours.",
  {
    body: Type.Object(
      {
        displayName: Type.String({ minLength: 1, maxLength: 120 }),
        localInvitation: Type.Boolean(),
        sankhyaUser: Type.Optional(codusu),
        linkInvitations: Type.Optional(
          Type.Array(provider, { maxItems: 2, uniqueItems: true }),
        ),
      },
      object,
    ),
    response: {
      201: Type.Object(
        {
          personId: uuid,
          enrollmentToken: nullable(Type.String()),
          linkInvitations: invitationList,
        },
        object,
      ),
      ...errors,
    },
  },
  true,
);
export const adminDirectoryOperation = operation(
  "GET",
  "/identity/admin/sankhya-users",
  "searchSankhyaUsers",
  "Owner: search real Sankhya users (code, login, name, e-mail, access expiry) by login or name, with the IA-MNS profile already linked to each. Read-only; at most 20 results.",
  {
    querystring: Type.Object(
      { query: Type.String({ minLength: 2, maxLength: 60 }) },
      object,
    ),
    response: {
      200: Type.Object(
        {
          items: Type.Array(
            Type.Object(
              {
                codusu,
                login: Type.String(),
                name: nullable(Type.String()),
                email: nullable(Type.String()),
                accessExpired: Type.Boolean(),
                linkedTo: nullable(
                  Type.Object(
                    { personId: uuid, displayName: Type.String() },
                    object,
                  ),
                ),
              },
              object,
            ),
            { maxItems: 20 },
          ),
        },
        object,
      ),
      ...errors,
    },
  },
  true,
);
export const adminLinkSankhyaOperation = operation(
  "POST",
  "/identity/admin/persons/:personId/links/sankhya",
  "linkSankhyaUser",
  "Owner: associate a real Sankhya user selected from the directory; the account is re-read and must exist and still allow access. Audited as an owner attestation.",
  {
    params: personParams,
    body: Type.Object({ codusu }, object),
    response: { 200: ok, ...errors },
  },
  true,
);
export const adminLinkInvitationOperation = operation(
  "POST",
  "/identity/admin/persons/:personId/link-invitations",
  "issueLinkInvitation",
  "Owner: issue a one-time 72-hour invitation the person completes by proving a PDT Connect or Sankhya account; replaces a pending invitation for the same provider.",
  {
    params: personParams,
    body: Type.Object({ provider }, object),
    response: {
      200: Type.Object({ token: Type.String() }, object),
      ...errors,
    },
  },
  true,
);
export const adminEnrollmentOperation = operation(
  "POST",
  "/identity/admin/persons/:personId/enrollment",
  "issueEnrollmentInvitation",
  "Owner: issue a one-time 72-hour invitation for a Person without a local credential to create one.",
  {
    params: personParams,
    body: Type.Object({}, object),
    response: {
      200: Type.Object({ enrollmentToken: Type.String() }, object),
      ...errors,
    },
  },
  true,
);
export const adminMergeOperation = operation(
  "POST",
  "/identity/admin/persons/:personId/merge",
  "mergeIdentityPersons",
  "Owner: consolidate another Person of the same individual into this one. Links, the local credential (when this Person has none), grants and conversations move; the other Person stops signing in. Not for owners or overlapping providers. Audited.",
  {
    params: personParams,
    body: Type.Object({ sourcePersonId: uuid }, object),
    response: { 200: ok, ...errors },
  },
  true,
);
export const adminGrantOperation = operation(
  "PUT",
  "/identity/admin/persons/:personId/grants/:permission",
  "grantIdentityPermission",
  "Owner: grant a registered capability permission. Audited.",
  {
    params: Type.Object(
      { personId: uuid, permission: Type.String({ maxLength: 80 }) },
      object,
    ),
    response: { 200: ok, ...errors },
  },
  true,
);
export const adminRevokeGrantOperation = operation(
  "DELETE",
  "/identity/admin/persons/:personId/grants/:permission",
  "revokeIdentityPermission",
  "Owner: revoke an explicit grant. Provider-policy grants follow the links. Audited.",
  {
    params: Type.Object(
      { personId: uuid, permission: Type.String({ maxLength: 80 }) },
      object,
    ),
    response: { 200: ok, ...errors },
  },
  true,
);
export const adminOwnerOperation = operation(
  "PUT",
  "/identity/admin/persons/:personId/owner",
  "assignIdentityOwner",
  "Owner: assign the principal administrator role. Audited.",
  { params: personParams, response: { 200: ok, ...errors } },
  true,
);
export const adminRemoveOwnerOperation = operation(
  "DELETE",
  "/identity/admin/persons/:personId/owner",
  "removeIdentityOwner",
  "Owner: remove the principal administrator role; the last active owner cannot be removed. Audited.",
  { params: personParams, response: { 200: ok, ...errors } },
  true,
);
export const adminStatusOperation = operation(
  "PATCH",
  "/identity/admin/persons/:personId",
  "setIdentityPersonStatus",
  "Owner: enable or disable a Person; disabling revokes sessions. Audited.",
  {
    params: personParams,
    body: Type.Object(
      {
        status: Type.Union([Type.Literal("active"), Type.Literal("disabled")]),
      },
      object,
    ),
    response: { 200: ok, ...errors },
  },
  true,
);
export const adminUnlinkOperation = operation(
  "DELETE",
  "/identity/admin/persons/:personId/links/:linkId",
  "removeIdentityPersonLink",
  "Owner: remove a Person's external link (never the last sign-in method). Audited.",
  {
    params: Type.Object({ personId: uuid, linkId: uuid }, object),
    response: { 200: ok, ...errors },
  },
  true,
);
export const adminResetOperation = operation(
  "POST",
  "/identity/admin/persons/:personId/reset",
  "resetIdentityLocalCredential",
  "Owner: remove another Person's local password and second factor, revoke sessions and issue a one-time reset invitation.",
  {
    params: personParams,
    body: Type.Object({}, object),
    response: {
      200: Type.Object({ resetToken: Type.String() }, object),
      ...errors,
    },
  },
  true,
);
export const adminRevokeSessionsOperation = operation(
  "DELETE",
  "/identity/admin/persons/:personId/sessions",
  "revokeIdentityPersonSessions",
  "Owner: revoke all of a Person's sessions (except the caller's current one).",
  {
    params: personParams,
    response: {
      200: Type.Object({ revoked: Type.Integer({ minimum: 0 }) }, object),
      ...errors,
    },
  },
  true,
);

export const identityOperations: readonly ApiOperation[] = [
  statusOperation,
  localLoginOperation,
  mfaOperation,
  refreshOperation,
  logoutOperation,
  providerStartOperation,
  pdtCallbackOperation,
  sankhyaCallbackOperation,
  embeddedCompleteOperation,
  provisionInspectOperation,
  provisionCreateOperation,
  provisionLinkOperation,
  mergeOperation,
  invitationInspectOperation,
  bootstrapOperation,
  invitationCompleteOperation,
  meOperation,
  renameOperation,
  reauthenticateOperation,
  passwordOperation,
  totpStartOperation,
  totpConfirmOperation,
  totpDisableOperation,
  recoveryCodesOperation,
  unlinkOperation,
  revokeSessionOperation,
  adminListOperation,
  adminDetailOperation,
  adminCreateOperation,
  adminDirectoryOperation,
  adminLinkSankhyaOperation,
  adminLinkInvitationOperation,
  adminEnrollmentOperation,
  adminMergeOperation,
  adminGrantOperation,
  adminRevokeGrantOperation,
  adminOwnerOperation,
  adminRemoveOwnerOperation,
  adminStatusOperation,
  adminUnlinkOperation,
  adminResetOperation,
  adminRevokeSessionsOperation,
];
