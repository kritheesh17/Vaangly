-- Migration: 20260919000028_remove_public_bucket_read_policy.sql
-- Description: Drop unnecessary public read policy on storage.buckets to enforce tight metadata security

DROP POLICY IF EXISTS "Public read storage buckets" ON storage.buckets;
