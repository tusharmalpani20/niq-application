-- Expired invitation links do not reserve seats.
CREATE OR REPLACE FUNCTION "enforce_organization_user_limit"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_organization_id varchar(26);
  configured_limit integer;
  consumed_seats bigint;
BEGIN
  target_organization_id := NEW.organization_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(target_organization_id::text, 0));

  SELECT entitlement.user_limit
    INTO configured_limit
    FROM organization_entitlements entitlement
   WHERE entitlement.organization_id = target_organization_id
     AND entitlement.effective_from <= now()
     AND (entitlement.effective_until IS NULL OR entitlement.effective_until > now())
   ORDER BY entitlement.effective_from DESC, entitlement.created_at DESC
   LIMIT 1;

  IF configured_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    (SELECT count(*) FROM organization_memberships membership
      WHERE membership.organization_id = target_organization_id AND membership.is_active)
    +
    (SELECT count(*) FROM invitations invitation
      WHERE invitation.organization_id = target_organization_id AND invitation.status = 'PENDING' AND invitation.expires_at > now())
    INTO consumed_seats;

  IF consumed_seats > configured_limit THEN
    RAISE EXCEPTION 'organization user limit exceeded'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
