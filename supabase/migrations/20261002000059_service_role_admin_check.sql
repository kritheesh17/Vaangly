-- Migration: 20261002000059_service_role_admin_check.sql
-- Description: Allow service_role to be recognized in is_admin helper

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT (
    current_setting('role', true) = 'service_role'
    OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
