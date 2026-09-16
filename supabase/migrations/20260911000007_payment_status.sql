-- Track in-person customer payment separately from request completion.
ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS customer_paid BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_requests_customer_paid ON public.requests(customer_paid);