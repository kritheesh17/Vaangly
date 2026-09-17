-- VAANGLY SECURITY HARDENING
-- Client-facing roles must never be able to TRUNCATE application tables.

REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM authenticated;
