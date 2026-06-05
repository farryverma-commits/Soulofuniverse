# Remove Forgot Password Flow

## Why keep the edge function

The `admin-reset-password` edge function is necessary because only `supabase.auth.admin.updateUserById()` (service role API) can properly set a new password with correct bcrypt hashing. A Postgres function can't call the Admin API. The edge function follows the same pattern as the existing `create-mentor` function.

## What to remove

### Files to delete
- `frontend/src/features/auth/ForgotPasswordPage.tsx`
- `frontend/src/features/auth/ResetPasswordPage.tsx`

### Files to modify

**`frontend/src/App.tsx`:**
1. Remove imports:
   - `import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage'`
   - `import { ResetPasswordPage } from './features/auth/ResetPasswordPage'`
2. Remove routes:
   - `<Route path="/forgot-password" element={...} />`
   - `<Route path="/reset-password" element={...} />`

**`frontend/src/features/auth/LoginPage.tsx`:**
1. Remove the "Forgot?" link: `<Link to="/forgot-password" className="text-[11px]...">Forgot?</Link>`

**`AGENTS.md`:**
1. Remove `| Forgot Password | Built | ...` row from the features table
2. Shorten the password reset architecture note to remove forgot-password mention

## Verification
- Run `npx vite build` — should compile without errors
- Login page should no longer show the "Forgot?" link
