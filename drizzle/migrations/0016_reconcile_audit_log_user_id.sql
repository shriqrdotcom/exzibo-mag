-- 0016: Reconcile the remaining Better Auth identity column drift.
--
-- The repair branch has the other Better Auth identity columns as TEXT, but
-- audit_logs.user_id is still UUID. Better Auth IDs are TEXT and may contain
-- non-UUID characters. This is intentionally a narrow forward-only repair;
-- it does not replay the stale migration ledger or change application-owned
-- UUID columns.
--
-- The guard fails closed for an unexpected schema. It permits only the two
-- reviewed source states:
--   * uuid: convert it to text while preserving values and indexes
--   * text: already repaired; leave it unchanged
DO $$
DECLARE
  actual_type text;
BEGIN
  SELECT c.udt_name
    INTO actual_type
    FROM information_schema.columns AS c
   WHERE c.table_schema = 'public'
     AND c.table_name = 'audit_logs'
     AND c.column_name = 'user_id';

  IF actual_type IS NULL THEN
    RAISE EXCEPTION
      '0016 audit_logs.user_id reconciliation refused: column is missing';
  END IF;

  IF actual_type NOT IN ('uuid', 'text') THEN
    RAISE EXCEPTION
      '0016 audit_logs.user_id reconciliation refused: unexpected type %',
      actual_type;
  END IF;

  IF actual_type = 'uuid' THEN
    ALTER TABLE public.audit_logs
      ALTER COLUMN user_id TYPE text USING user_id::text;
  END IF;
END
$$;