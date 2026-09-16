# Supabase Auth Email Configuration & Setup Guide

## 1. Supabase Dashboard Configuration

To enable native email OTP verification in your Supabase project:

1. Go to the **Supabase Dashboard** -> **Authentication** -> **Providers** -> **Email**:
   - Enable **"Enable Email provider"** (Turn ON).
   - Enable **"Confirm email"** (Turn ON).
   - Ensure **"Secure email change"** is enabled.
2. In **Authentication** -> **Email Templates**:
   - Open **"Magic Link"** template (used by `supabase.auth.signInWithOtp`).
   - Replace Subject with: `Your Vaango Verification Code: {{ .Token }}`.
   - Replace the HTML body with the content of `supabase/email_templates/email_verification.html`.
   - Ensure `{{ .Token }}` is present (Supabase injects the 6-digit OTP code into `{{ .Token }}`).
3. Under **Authentication** -> **URL Configuration**:
   - Set **Site URL** to your deployment URL (e.g. `https://vaango.in` or `http://localhost:3000` for development).
   - Add redirect URLs (e.g. `http://localhost:3000/**`, `https://vaango.in/**`).

---

## 2. Default Supabase Development Service Limitations

- **Development Rate Limits**: By default, Supabase's built-in email service has a strict rate limit of **3 emails per hour**.
- **Production Requirement**: For staging or production, you **MUST configure a custom SMTP provider** (such as SendGrid, AWS SES, Resend, Postmark, or Mailgun).
- Navigate to **Authentication** -> **SMTP Settings** in the Supabase Dashboard:
  - Sender email: `noreply@yourdomain.com`
  - Sender name: `Vaango`
  - Host: e.g. `smtp.resend.com` / `smtp.sendgrid.net`
  - Port: `587` / `465`
  - Username & Password (configured in Supabase Dashboard only — **never in frontend .env**).

---

## 3. Environment Variables

Only public client variables belong in `.env`:

```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- **DO NOT** put SMTP passwords, email provider API keys, or Supabase `service_role` secrets in frontend `.env`.

---

## 4. Phone OTP Status

- Phone OTP remains isolated in `AuthContext.tsx` (`requestPhoneOtp`, `verifyPhoneOtp`).
- Phone OTP will display a notice to the user:
  > **Phone OTP Notice:** Phone OTP is temporarily unavailable until the SMS provider is configured. Please use Email verification.
- To activate Phone OTP in the future, configure Twilio or MessageBird under **Authentication** -> **Providers** -> **Phone** in the Supabase Dashboard.
