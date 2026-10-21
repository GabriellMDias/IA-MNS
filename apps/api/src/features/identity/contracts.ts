import { Type, type TSchema } from "typebox";
import type { ApiOperation } from "../../module.js";
import { errorEnvelopeSchema } from "../../errors.js";
import { parameterKeys } from "../../parameters.js";

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
    {
      kind: Type.Literal("mfa_required"),
      challenge: Type.String(),
      rememberDeviceDays: Type.Integer({
        minimum: 0,
        description:
          "Days this browser may skip the code after it is confirmed; 0 means the option is not offered.",
      }),
    },
    object,
  ),
  Type.Object(
    {
      kind: Type.Literal("mfa_enrollment_required"),
      challenge: Type.String({
        description:
          "Single-use enrollment challenge: the policy requires a second factor this account has not set up.",
      }),
    },
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
const sourceSchema = nullable(
  Type.Object({ id: Type.String(), title: Type.String() }, object),
);
const catalogSchema = Type.Array(
  Type.Object(
    {
      permission: Type.String(),
      code: Type.String({
        description:
          "Stable identification given to support, for example SNK-VEN-01.",
      }),
      title: Type.String(),
      description: Type.String(),
      source: sourceSchema,
      capability: nullable(Type.String()),
      access: Type.Union([
        Type.Literal("read"),
        Type.Literal("write"),
        Type.Literal("sensitive"),
      ]),
      autoGrantProviders: Type.Array(provider),
      restrictions: Type.Array(
        Type.Object(
          {
            id: Type.String(),
            code: Type.String(),
            title: Type.String(),
            description: Type.String(),
            hierarchical: Type.Boolean({
              description: "Selecting a value also admits the values below it.",
            }),
          },
          object,
        ),
      ),
    },
    object,
  ),
);
const conditionSchema = Type.Object(
  {
    dimension: Type.String(),
    values: Type.Array(
      Type.Object({ value: Type.String(), label: Type.String() }, object),
    ),
  },
  object,
);
const grantSchema = Type.Object(
  {
    permission: Type.String(),
    grantedAt: Type.String({ format: "date-time" }),
    restrictions: Type.Array(conditionSchema, {
      description: "Empty: every row of the source.",
    }),
  },
  object,
);
const accessSchema = Type.Array(
  Type.Object(
    {
      permission: Type.String(),
      code: Type.String(),
      title: Type.String(),
      source: sourceSchema,
      dimensions: Type.Array(
        Type.Object(
          { id: Type.String(), code: Type.String(), title: Type.String() },
          object,
        ),
        {
          description: "Restriction dimensions of the permission, for display.",
        },
      ),
      rules: nullable(
        Type.Array(Type.Array(conditionSchema), {
          description:
            "Rows admitted by at least one rule; every condition of a rule must match.",
        }),
      ),
      origins: Type.Array(
        Type.Object(
          {
            kind: Type.Union([
              Type.Literal("owner"),
              Type.Literal("grant"),
              Type.Literal("group"),
              Type.Literal("provider"),
            ]),
            group: nullable(
              Type.Object({ id: uuid, name: Type.String() }, object),
            ),
            provider: nullable(provider),
          },
          object,
        ),
      ),
    },
    object,
  ),
  {
    description:
      "Effective catalog permissions with their identification, data scope (null rules: unrestricted) and where each comes from.",
  },
);
const personSchema = Type.Object(
  {
    id: uuid,
    displayName: Type.String(),
    status: Type.Union([Type.Literal("active"), Type.Literal("disabled")]),
    owner: Type.Boolean(),
    grants: Type.Array(grantSchema),
    groups: Type.Array(Type.Object({ id: uuid, name: Type.String() }, object)),
    permissions: Type.Array(Type.String()),
    access: accessSchema,
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
    whatsapp: nullable(
      Type.Object(
        {
          number: Type.String({
            description:
              "Linked number in international display form, for example +55 11 98765-4321.",
          }),
          linkedAt: Type.String({ format: "date-time" }),
          updatedAt: Type.String({ format: "date-time" }),
          confirmedAt: nullable(
            Type.String({
              format: "date-time",
              description:
                "First accepted WhatsApp message from this number; null until one arrives.",
            }),
          ),
        },
        {
          ...object,
          description:
            "The WhatsApp number that an owner linked to this Person; only owners change it.",
        },
      ),
    ),
  },
  object,
);
const policyFields = {
  sessionMaxMinutes: Type.Integer({
    description: "Longest a direct session lasts from sign-in.",
  }),
  idleTimeoutMinutes: Type.Integer({
    description: "Longest a direct session survives without user activity.",
  }),
  recentAuthMinutes: Type.Integer({
    description:
      "How long a sign-in or confirmation allows sensitive changes to one's own account.",
  }),
  adminRecentAuthMinutes: Type.Integer({
    description:
      "How long a strong sign-in or confirmation allows administrative changes.",
  }),
  mfaRequirement: Type.Union(
    [
      Type.Literal("everyone"),
      Type.Literal("administrators"),
      Type.Literal("none"),
    ],
    {
      description:
        "Who must use a second factor with an IA-MNS password; none is refused in production.",
    },
  ),
  rememberDeviceDays: Type.Integer({
    description:
      "Days a browser skips the second factor at sign-in; 0 asks every time. Owners only when the second factor is optional (never in production).",
  }),
};
const policySchema = Type.Object(policyFields, object);
const limitSchema = Type.Object(
  {
    min: Type.Integer(),
    max: Type.Integer(),
    recommendedMax: Type.Integer(),
  },
  object,
);
export const meSchema = Type.Object(
  {
    person: personSchema,
    rememberedDevices: Type.Integer({
      minimum: 0,
      description: "Browsers currently remembered to skip the second factor.",
    }),
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
  "Sign-in methods offered on the direct URL and embedded host origins. Public; no account data. There is no public account creation: local credentials come only from owner invitations.",
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
  "Complete a local sign-in with a TOTP code or a single-use recovery code. When the policy offers it, `rememberDevice` lets this browser skip the code at later sign-ins (HttpOnly cookie).",
  {
    body: Type.Object(
      {
        challenge: secret,
        code: codeField,
        rememberDevice: Type.Optional(Type.Boolean()),
      },
      object,
    ),
    response: { 200: outcomeSchema, ...errors },
  },
);
const enrollmentSecret = Type.Object(
  { setup: Type.String(), secret: Type.String(), otpauthUri: Type.String() },
  object,
);
const recoveryCodeList = Type.Array(Type.String(), {
  minItems: 10,
  maxItems: 10,
});
export const signInEnrollmentStartOperation = operation(
  "POST",
  "/identity/login/mfa-enrollment",
  "startSignInMfaEnrollment",
  "When the policy requires a second factor the account lacks, start its setup after the password. Returns the secret once.",
  {
    body: Type.Object({ challenge: secret }, object),
    response: { 200: enrollmentSecret, ...errors },
  },
);
export const signInEnrollmentConfirmOperation = operation(
  "POST",
  "/identity/login/mfa-enrollment/confirm",
  "confirmSignInMfaEnrollment",
  "Confirm the second factor set up during sign-in: enables it, returns single-use recovery codes once and opens a strong session.",
  {
    body: Type.Object(
      { challenge: secret, setup: secret, code: codeField },
      object,
    ),
    response: {
      200: Type.Object(
        {
          recoveryCodes: recoveryCodeList,
          accessToken: Type.String(),
          expiresIn: Type.Integer({ minimum: 1 }),
        },
        object,
      ),
      ...errors,
    },
  },
);
export const refreshOperation = operation(
  "POST",
  "/identity/session/refresh",
  "refreshSession",
  "Rotate the direct-URL refresh cookie and return a new access token. `active` reports user activity since the last renewal; only activity postpones the inactivity deadline. A concurrent renewal by another tab within a short grace window gets a token without rotation; later reuse of a rotated credential revokes the session.",
  {
    body: Type.Object(
      { active: Type.Optional(Type.Boolean({ default: true })) },
      object,
    ),
    response: { 200: tokenSchema, ...errors },
  },
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
export const forgetDevicesOperation = operation(
  "DELETE",
  "/identity/me/remembered-devices",
  "forgetRememberedDevices",
  "Stop skipping the second factor on every browser remembered for the signed-in Person.",
  {
    response: {
      200: Type.Object({ forgotten: Type.Integer({ minimum: 0 }) }, object),
      ...errors,
    },
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
const groupParams = Type.Object({ groupId: uuid }, object);
export const adminProviderGroupsOperation = operation(
  "GET",
  "/identity/admin/provider-groups",
  "getIdentityProviderGroups",
  "Owner: the default group selected for each external sign-in provider. Verified sign-in joins the group before issuing a token. No selection means no automatic membership.",
  {
    response: {
      200: Type.Object(
        {
          items: Type.Array(
            Type.Object(
              {
                provider,
                groupId: nullable(uuid),
                version: Type.Integer({ minimum: 0 }),
              },
              object,
            ),
            { minItems: 2, maxItems: 2 },
          ),
        },
        object,
      ),
      ...errors,
    },
  },
  true,
);
export const adminUpdateProviderGroupOperation = operation(
  "PUT",
  "/identity/admin/provider-groups/:provider",
  "setIdentityProviderGroup",
  "Owner with recent strong authentication: select an existing default group or clear the selection, conditionally on the version read. Existing memberships remain; future verified provider sign-ins join the selected group. The selection and audit commit together.",
  {
    params: Type.Object({ provider }, object),
    body: Type.Object(
      {
        groupId: nullable(uuid),
        version: Type.Integer({ minimum: 0, maximum: 2147483646 }),
      },
      object,
    ),
    response: { 200: ok, ...errors },
  },
  true,
);
const restrictionInput = Type.Array(
  Type.Object(
    {
      dimension: Type.String({ pattern: "^[a-z][a-z_]{1,30}$" }),
      values: Type.Array(Type.String({ pattern: "^-?[0-9]{1,15}$" }), {
        minItems: 1,
        maxItems: 100,
      }),
    },
    object,
  ),
  {
    maxItems: 8,
    description:
      "Data restrictions: values of one dimension are alternatives; every listed dimension must match. Empty admits every row of the source. Values are ERP codes chosen from GET /identity/admin/restriction-values; labels are read from the source.",
  },
);
const grantBody = Type.Object({ restrictions: restrictionInput }, object);
const groupFields = {
  name: Type.String({ minLength: 2, maxLength: 80 }),
  description: nullable(Type.String({ maxLength: 300 })),
};
export const adminCatalogOperation = operation(
  "GET",
  "/identity/admin/catalog",
  "getIdentityPermissionCatalog",
  "Owner: the grantable permissions grouped by source, with their identification codes, restriction dimensions. The legacy automatic-grant field is empty; provider sign-in joins owner-selected groups.",
  {
    response: {
      200: Type.Object(
        {
          catalog: catalogSchema,
          restrictionsAvailable: Type.Boolean({
            description:
              "Restriction values can be read from the sources; without it, only unrestricted grants can be saved.",
          }),
        },
        object,
      ),
      ...errors,
    },
  },
  true,
);
export const adminRestrictionValuesOperation = operation(
  "GET",
  "/identity/admin/restriction-values",
  "searchIdentityRestrictionValues",
  "Owner: real values of one restriction dimension of a permission, read-only from its source; at most 30, by code or name. Labels may be personal names (sellers, buyers).",
  {
    querystring: Type.Object(
      {
        permission: Type.String({ maxLength: 80 }),
        dimension: Type.String({ maxLength: 32 }),
        query: Type.Optional(Type.String({ maxLength: 60 })),
      },
      object,
    ),
    response: {
      200: Type.Object(
        {
          items: Type.Array(
            Type.Object(
              {
                value: Type.String(),
                label: Type.String(),
                detail: nullable(Type.String()),
              },
              object,
            ),
            { maxItems: 30 },
          ),
        },
        object,
      ),
      ...errors,
    },
  },
  true,
);
export const adminGroupsOperation = operation(
  "GET",
  "/identity/admin/groups",
  "listIdentityGroups",
  "Owner: every group with its member count and granted permissions.",
  {
    response: {
      200: Type.Object(
        {
          items: Type.Array(
            Type.Object(
              {
                id: uuid,
                name: Type.String(),
                description: nullable(Type.String()),
                version: Type.Integer({ minimum: 1 }),
                members: Type.Integer({ minimum: 0 }),
                permissions: Type.Array(Type.String()),
              },
              object,
            ),
            { maxItems: 200 },
          ),
        },
        object,
      ),
      ...errors,
    },
  },
  true,
);
export const adminCreateGroupOperation = operation(
  "POST",
  "/identity/admin/groups",
  "createIdentityGroup",
  "Owner: create a group of Persons whose grants every member holds. Names are unique regardless of case. Audited.",
  {
    body: Type.Object(groupFields, object),
    response: {
      201: Type.Object({ groupId: uuid }, object),
      ...errors,
    },
  },
  true,
);
const groupSchema = Type.Object(
  {
    id: uuid,
    name: Type.String(),
    description: nullable(Type.String()),
    version: Type.Integer({ minimum: 1 }),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
    members: Type.Array(
      Type.Object(
        {
          personId: uuid,
          displayName: Type.String(),
          status: Type.Union([
            Type.Literal("active"),
            Type.Literal("disabled"),
          ]),
          addedAt: Type.String({ format: "date-time" }),
        },
        object,
      ),
    ),
    grants: Type.Array(grantSchema),
  },
  object,
);
export const adminGroupOperation = operation(
  "GET",
  "/identity/admin/groups/:groupId",
  "getIdentityGroup",
  "Owner: a group's members, grants with their restrictions, and the grantable catalog.",
  {
    params: groupParams,
    response: {
      200: Type.Object(
        {
          group: groupSchema,
          catalog: catalogSchema,
          restrictionsAvailable: Type.Boolean(),
        },
        object,
      ),
      ...errors,
    },
  },
  true,
);
export const adminUpdateGroupOperation = operation(
  "PATCH",
  "/identity/admin/groups/:groupId",
  "updateIdentityGroup",
  "Owner: rename or redescribe the version of the group that was read. Audited.",
  {
    params: groupParams,
    body: Type.Object(
      { ...groupFields, version: Type.Integer({ minimum: 1 }) },
      object,
    ),
    response: { 200: ok, ...errors },
  },
  true,
);
export const adminDeleteGroupOperation = operation(
  "DELETE",
  "/identity/admin/groups/:groupId",
  "deleteIdentityGroup",
  "Owner: delete a group; its members lose the group's grants at their next access token and next agent turn. Audited.",
  { params: groupParams, response: { 200: ok, ...errors } },
  true,
);
export const adminAddGroupMemberOperation = operation(
  "PUT",
  "/identity/admin/groups/:groupId/members/:personId",
  "addIdentityGroupMember",
  "Owner: add an active Person to a group. Idempotent. Audited.",
  {
    params: Type.Object({ groupId: uuid, personId: uuid }, object),
    response: { 200: ok, ...errors },
  },
  true,
);
export const adminRemoveGroupMemberOperation = operation(
  "DELETE",
  "/identity/admin/groups/:groupId/members/:personId",
  "removeIdentityGroupMember",
  "Owner: remove a Person from a group. Audited.",
  {
    params: Type.Object({ groupId: uuid, personId: uuid }, object),
    response: { 200: ok, ...errors },
  },
  true,
);
export const adminGroupGrantOperation = operation(
  "PUT",
  "/identity/admin/groups/:groupId/grants/:permission",
  "grantIdentityGroupPermission",
  "Owner: grant a registered permission to a group, optionally restricted, or replace the restrictions of its grant. Audited.",
  {
    params: Type.Object(
      { groupId: uuid, permission: Type.String({ maxLength: 80 }) },
      object,
    ),
    body: grantBody,
    response: { 200: ok, ...errors },
  },
  true,
);
export const adminRevokeGroupGrantOperation = operation(
  "DELETE",
  "/identity/admin/groups/:groupId/grants/:permission",
  "revokeIdentityGroupPermission",
  "Owner: revoke a group's grant. Audited.",
  {
    params: Type.Object(
      { groupId: uuid, permission: Type.String({ maxLength: 80 }) },
      object,
    ),
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
    restrictions: Type.Boolean({
      description:
        "Owners can restrict grants by values read from the sources.",
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
export const adminPolicyOperation = operation(
  "GET",
  "/identity/admin/security-policy",
  "getSecurityPolicy",
  "Owner: the authentication policy as configured and as enforced (production never lets administrators skip the second factor), its defaults, limits, the settings that reduce security and recent changes.",
  {
    response: {
      200: Type.Object(
        {
          configured: policySchema,
          effective: policySchema,
          defaults: policySchema,
          limits: Type.Object(
            {
              sessionMaxMinutes: limitSchema,
              idleTimeoutMinutes: limitSchema,
              recentAuthMinutes: limitSchema,
              adminRecentAuthMinutes: limitSchema,
              rememberDeviceDays: limitSchema,
            },
            object,
          ),
          production: Type.Boolean(),
          warnings: Type.Array(Type.String()),
          updatedAt: nullable(Type.String({ format: "date-time" })),
          updatedBy: nullable(Type.String()),
          history: Type.Array(
            Type.Object(
              {
                occurredAt: Type.String({ format: "date-time" }),
                actorName: nullable(Type.String()),
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
export const adminUpdatePolicyOperation = operation(
  "PUT",
  "/identity/admin/security-policy",
  "updateSecurityPolicy",
  "Owner: change the authentication policy (strong, recent authentication). Values outside the limits are refused; settings that significantly reduce security require `acknowledgeReducedSecurity`. Open direct sessions follow the new durations immediately. Audited with previous and new values.",
  {
    body: Type.Object(
      {
        ...policyFields,
        acknowledgeReducedSecurity: Type.Optional(Type.Boolean()),
      },
      object,
    ),
    response: {
      200: Type.Object(
        {
          endedSessions: Type.Integer({ minimum: 0 }),
          currentSessionEnded: Type.Boolean(),
        },
        object,
      ),
      ...errors,
    },
  },
  true,
);
const historySchema = Type.Array(
  Type.Object(
    {
      occurredAt: Type.String({ format: "date-time" }),
      actorName: nullable(Type.String()),
      details: Type.Record(
        Type.String(),
        Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]),
      ),
    },
    object,
  ),
);
const parameterValue = Type.Union([
  Type.String({ maxLength: 200 }),
  Type.Array(Type.String({ maxLength: 200 }), { maxItems: 32 }),
]);
const parameterControl = Type.Union([
  Type.Object(
    {
      kind: Type.Literal("text"),
      pattern: Type.String(),
      maxLength: Type.Integer({ minimum: 1 }),
    },
    object,
  ),
  Type.Object(
    {
      kind: Type.Literal("choice"),
      options: Type.Array(Type.String()),
      refused: Type.Array(Type.String()),
    },
    object,
  ),
  Type.Object(
    {
      kind: Type.Literal("set"),
      options: Type.Array(
        Type.Object({ value: Type.String(), label: Type.String() }, object),
      ),
    },
    object,
  ),
]);
export const adminParametersOperation = operation(
  "GET",
  "/identity/admin/parameters",
  "listOperationalParameters",
  "Owner: the operational parameters (product behavior administered at run time, never secrets or bootstrap settings) with the value in use, the installation default, whether an owner value or the default applies, when a change takes effect, the concurrency version and recent changes.",
  {
    response: {
      200: Type.Object(
        {
          production: Type.Boolean(),
          parameters: Type.Array(
            Type.Object(
              {
                key: Type.Union(parameterKeys.map((key) => Type.Literal(key))),
                group: Type.Union([
                  Type.Literal("ai"),
                  Type.Literal("access"),
                  Type.Literal("channels"),
                ]),
                effect: Type.Union([
                  Type.Literal("next_turn"),
                  Type.Literal("next_access_token"),
                  Type.Literal("next_message"),
                ]),
                control: parameterControl,
                value: parameterValue,
                defaultValue: parameterValue,
                source: Type.Union([
                  Type.Literal("administration"),
                  Type.Literal("default"),
                ]),
                storedInvalid: Type.Boolean(),
                version: Type.Integer({ minimum: 0 }),
                updatedAt: nullable(Type.String({ format: "date-time" })),
                updatedBy: nullable(Type.String()),
              },
              object,
            ),
          ),
          history: historySchema,
        },
        object,
      ),
      ...errors,
    },
  },
  true,
);
export const adminUpdateParameterOperation = operation(
  "PUT",
  "/identity/admin/parameters/:key",
  "updateOperationalParameter",
  "Owner: change one operational parameter (strong, recent authentication), or restore its installation default with `null`. Applies only to the `version` that was read; values outside the parameter's domain or refused in this environment are rejected. Takes effect without a restart. Audited with previous and new values.",
  {
    params: Type.Object(
      { key: Type.String({ pattern: "^[A-Za-z0-9._-]{1,64}$" }) },
      object,
    ),
    body: Type.Object(
      {
        // Null first: request coercion would otherwise turn it into "".
        value: Type.Union([Type.Null(), parameterValue]),
        version: Type.Integer({ minimum: 0 }),
      },
      object,
    ),
    response: {
      200: Type.Object({ version: Type.Integer({ minimum: 1 }) }, object),
      ...errors,
    },
  },
  true,
);
export const adminGrantOperation = operation(
  "PUT",
  "/identity/admin/persons/:personId/grants/:permission",
  "grantIdentityPermission",
  "Owner: grant a registered permission, optionally restricted, or replace the restrictions of an existing grant. Personal and group grants are united; external links alone grant nothing. Audited.",
  {
    params: Type.Object(
      { personId: uuid, permission: Type.String({ maxLength: 80 }) },
      object,
    ),
    body: grantBody,
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
export const adminSetWhatsappOperation = operation(
  "PUT",
  "/identity/admin/persons/:personId/whatsapp",
  "setIdentityPersonWhatsapp",
  "Owner: link or replace an active Person's WhatsApp number, the only authorization of the WhatsApp channel. International form with country code; Brazilian mobiles need the ninth digit. A number belongs to at most one Person. A change revokes the previous number at once. Audited.",
  {
    params: personParams,
    body: Type.Object(
      { number: Type.String({ minLength: 1, maxLength: 32 }) },
      object,
    ),
    response: { 200: ok, ...errors },
  },
  true,
);
export const adminRemoveWhatsappOperation = operation(
  "DELETE",
  "/identity/admin/persons/:personId/whatsapp",
  "removeIdentityPersonWhatsapp",
  "Owner: remove a Person's WhatsApp number; the channel stops answering it at once, including messages already being processed. Audited.",
  { params: personParams, response: { 200: ok, ...errors } },
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
  signInEnrollmentStartOperation,
  signInEnrollmentConfirmOperation,
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
  forgetDevicesOperation,
  revokeSessionOperation,
  adminListOperation,
  adminDetailOperation,
  adminCreateOperation,
  adminDirectoryOperation,
  adminLinkSankhyaOperation,
  adminLinkInvitationOperation,
  adminEnrollmentOperation,
  adminMergeOperation,
  adminPolicyOperation,
  adminUpdatePolicyOperation,
  adminParametersOperation,
  adminUpdateParameterOperation,
  adminGrantOperation,
  adminRevokeGrantOperation,
  adminCatalogOperation,
  adminRestrictionValuesOperation,
  adminGroupsOperation,
  adminProviderGroupsOperation,
  adminUpdateProviderGroupOperation,
  adminCreateGroupOperation,
  adminGroupOperation,
  adminUpdateGroupOperation,
  adminDeleteGroupOperation,
  adminAddGroupMemberOperation,
  adminRemoveGroupMemberOperation,
  adminGroupGrantOperation,
  adminRevokeGroupGrantOperation,
  adminOwnerOperation,
  adminRemoveOwnerOperation,
  adminStatusOperation,
  adminUnlinkOperation,
  adminSetWhatsappOperation,
  adminRemoveWhatsappOperation,
  adminResetOperation,
  adminRevokeSessionsOperation,
];
