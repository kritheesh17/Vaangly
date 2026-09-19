-- Migration: 20260919000026_customer_profile_address.sql
-- Purpose: Additive column for customer delivery and fulfillment address on profiles table
-- DO NOT APPLY AUTOMATICALLY - Run via Supabase Migration CLI or SQL Editor when ready

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS address TEXT;

COMMENT ON COLUMN public.profiles.address IS 'Customer physical address used for pre-order delivery, fulfillment, and appointment contact';

-- Preserves existing Row Level Security:
-- "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
-- "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
-- "Admins can read all profiles" ON public.profiles FOR SELECT USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
