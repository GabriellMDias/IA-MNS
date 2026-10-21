BEGIN;

-- Persons survive unlinking. Their generation counter must survive it too.
-- Block channel writers while incorporating generations retained by old work.
LOCK TABLE identity_persons IN ACCESS EXCLUSIVE MODE;
LOCK TABLE identity_whatsapp_links, whatsapp_inbound_messages,
  whatsapp_outbound_messages IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE identity_persons
  ADD COLUMN whatsapp_link_version integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT identity_persons_whatsapp_link_version_check
    CHECK (whatsapp_link_version >= 0);

WITH generations AS (
  SELECT person_id, version FROM identity_whatsapp_links
  UNION ALL
  SELECT person_id, link_version FROM whatsapp_inbound_messages
  UNION ALL
  SELECT person_id, link_version FROM whatsapp_outbound_messages
), latest AS (
  SELECT person_id, MAX(version) AS version FROM generations GROUP BY person_id
)
UPDATE identity_persons p SET whatsapp_link_version = latest.version
FROM latest WHERE p.id = latest.person_id;

COMMENT ON COLUMN identity_persons.whatsapp_link_version IS
  'Last allocated WhatsApp link generation; retained after number removal so queued work cannot become authorized by a later link.';

COMMIT;
