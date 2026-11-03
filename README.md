# Smart Study Material Organizer
Next.js 14 + TypeScript + Tailwind + Supabase (Auth, Postgres+RLS, private Storage).

## Setup
1. Create a project at supabase.com.
2. SQL Editor: paste and run `supabase/schema.sql` (tables, RLS, sample folders trigger, private `materials` bucket + policies).
3. Authentication > URL Configuration: set Site URL to your app URL (http://localhost:3000, later your Vercel URL) and add it to Redirect URLs (needed for password-reset emails).
4. `cp .env.example .env.local` and fill URL + anon key (Project Settings > API).
5. `npm install && npm run dev`, open http://localhost:3000, register.
## Deploy (Vercel)
Push to GitHub, import in Vercel, add the same two env vars, deploy. Add the Vercel URL to Supabase redirect URLs.
## Test checklist (do this before relying on it)
Register 2 accounts; confirm each sees only its own folders/files; upload a PDF and a photo; preview, download, rename, delete; reset password by email.
