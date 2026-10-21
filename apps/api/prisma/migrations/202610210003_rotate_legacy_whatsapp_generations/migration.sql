BEGIN;

-- Earlier runtimes could reuse a deleted link's version. Retained work cannot
-- prove which incarnation it belongs to, so active links start a fresh epoch.
-- Re-read every generation in case an older worker ran after the counter
-- migration. Removed links must also reserve all generations of retained work.
LOCK TABLE identity_persons IN ACCESS EXCLUSIVE MODE;
LOCK TABLE identity_whatsapp_links, whatsapp_inbound_messages,
  whatsapp_outbound_messages IN SHARE ROW EXCLUSIVE MODE;

WITH generations AS (
  SELECT id AS person_id, whatsapp_link_version AS version FROM identity_persons
  UNION ALL
  SELECT person_id, version FROM identity_whatsapp_links
  UNION ALL
  SELECT person_id, link_version FROM whatsapp_inbound_messages
  UNION ALL
  SELECT person_id, link_version FROM whatsapp_outbound_messages
), latest AS (
  SELECT person_id, MAX(version) AS version FROM generations GROUP BY person_id
)
UPDATE identity_persons p SET whatsapp_link_version = latest.version +
  CASE WHEN EXISTS (
    SELECT 1 FROM identity_whatsapp_links l WHERE l.person_id = p.id
  ) THEN 1 ELSE 0 END
FROM latest WHERE p.id = latest.person_id;

UPDATE identity_whatsapp_links l SET version = p.whatsapp_link_version
FROM identity_persons p WHERE p.id = l.person_id;

COMMIT;
