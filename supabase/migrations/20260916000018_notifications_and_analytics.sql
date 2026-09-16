-- Phase 7: Notifications & Analytics Schema Enhancements

-- 1. Add subscription_tier to shops table with default 'FREE'
ALTER TABLE public.shops 
ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(10) DEFAULT 'FREE';

-- 2. Create persistent notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    reference_id VARCHAR(100),
    reference_code VARCHAR(50),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notifications
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = recipient_id);

-- Policy: Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = recipient_id)
WITH CHECK (auth.uid() = recipient_id);

-- Policy: Authenticated users can insert notifications for valid workflows
CREATE POLICY "Users can create operational notifications"
ON public.notifications FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_shop ON public.notifications(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_shop_analytics ON public.requests(shop_id, current_state, created_at DESC);
