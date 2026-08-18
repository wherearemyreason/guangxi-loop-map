# Supabase infrastructure

This directory is the private-data foundation for ooolj.fun. It contains schema and edge-function skeletons only; it contains **no usable key or credential**.

## Apply safely

1. Create a Supabase project and enable Email/Password authentication. Disable public sign-ups after creating the two accounts.
2. Install and authenticate the Supabase CLI locally, link the intended project, then apply `migrations/202608180001_initial_memory_archive.sql` with `supabase db push`.
3. Bootstrap the first owner profile and membership using the Supabase SQL editor with the owner Auth user UUID. Create the contributor through an owner-only administrative workflow; do not make a client-side signup page.
4. Add the secrets in `.env.example` to Supabase Edge Function secrets and deployment variables. Never commit an `.env` file.
5. Deploy function stubs only after replacing each `TODO` with R2/Stream logic and validation. A stub returns HTTP 501 and cannot issue a URL or mutate content.

## Required cloud configuration

- **Supabase:** Auth email confirmation/recovery, a custom SMTP provider for reliable password mail, MFA for the owner, and backups/PITR appropriate to the plan.
- **Cloudflare R2:** private bucket only; CORS limited to `https://ooolj.fun` and its approved preview domain; an API token scoped only to that bucket.
- **Cloudflare Stream:** allowed origins restricted to the site; signed URLs/tokens required.
- **Backblaze B2:** a separate private backup bucket with object-lock/retention policy, plus an encrypted off-site backup process.
- **Vercel:** configure only public `VITE_*` values for the browser. Server secrets belong in Supabase functions or a controlled backend, never Vite variables.

## Policy model

`owner` can manage all records and recovery. `contributor` can read and insert, but cannot update or delete existing content. All table access is protected by RLS. Originals are soft-deleted in Postgres first; no function should immediately delete R2 data.

## Review before production

The included baseline is deliberately strict but needs an end-to-end Supabase SQL test after project provisioning. In particular, validate owner bootstrapping, RLS insert paths, media association rules, service-role backup jobs, and the exact R2/Stream SDK calls before enabling uploads.
