-- Data (ADR-0037): sales and product lookup permissions are now one per
-- source. `sales:read` and `products:read` became capability permissions that
-- identity derives from any source permission and that owners no longer
-- grant. Each existing explicit grant of the former permissions becomes the
-- grants of both sources it covered, and an owner-saved automatic grant of
-- Sankhya sales becomes the automatic grants of both sales sources, so
-- nobody gains or loses access. Restrictions do not exist yet. Irreversible
-- in place: the former names are no longer in the catalog; restore a backup to
-- run an older application.
BEGIN;
INSERT INTO "identity_capability_grants" ("person_id", "permission", "granted_by", "granted_at")
SELECT g."person_id", s."permission", g."granted_by", g."granted_at"
FROM "identity_capability_grants" g
JOIN (VALUES
  ('sales:read', 'sales_sankhya:read'),
  ('sales:read', 'sales_vrmaster:read'),
  ('products:read', 'products_sankhya:read'),
  ('products:read', 'products_vrmaster:read')
) AS s("former", "permission") ON s."former" = g."permission"
ON CONFLICT ("person_id", "permission") DO NOTHING;
DELETE FROM "identity_capability_grants" WHERE "permission" IN ('sales:read', 'products:read');

UPDATE "operational_parameters"
SET "value" = (
  SELECT COALESCE(jsonb_agg(DISTINCT item ORDER BY item), '[]'::jsonb)
  FROM (
    SELECT jsonb_array_elements_text("value") AS item
    UNION ALL
    SELECT unnest(ARRAY['sankhya:sales_sankhya:read', 'sankhya:sales_vrmaster:read'])
    WHERE "value" ? 'sankhya:sales:read'
  ) AS items
  WHERE item <> 'sankhya:sales:read'
),
  "version" = "version" + 1
WHERE "key" = 'access.providerGrants'
  AND "value" IS NOT NULL
  AND jsonb_typeof("value") = 'array'
  AND "value" ? 'sankhya:sales:read';
COMMIT;
