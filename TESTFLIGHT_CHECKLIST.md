# Flowvault — TestFlight Deployment Checklist

Use this as a sequential checklist when importing to a0 for TestFlight.

---

## 1. SUPABASE DASHBOARD SETUP

### Database
- [ ] Run `supabase_schema.sql` in SQL Editor (creates moves table + RLS + storage policies)
- [ ] Run `supabase_migration_practice.sql` in SQL Editor (creates practice_goals, practice_sessions, move_drills tables + RLS + indexes)

### Storage
- [ ] Create bucket named **`moves`** (Dashboard → Storage → New Bucket)
- [ ] Set bucket to **Public** (read access for serving media)
- [ ] Set file size limit to **50MB** (for video uploads)
- [ ] Allowed MIME types: `image/jpeg, image/png, image/webp, video/mp4, video/quicktime`

### Auth Settings (Dashboard → Auth → Settings)
- [ ] **Email Auth** → Enabled
- [ ] **Confirm email** → **OFF** for TestFlight (instant signup), ON for production
- [ ] **Site URL** → `flowvault://auth-callback` (your app's deep link scheme)
- [ ] **Redirect URLs** → Add: `flowvault://auth-callback`, `flowvault://**`, `exp://*/auth-callback`
- [ ] **Email templates** → Customize Confirm Signup and Reset Password templates if desired
- [ ] **Rate limits** → Default is fine for TestFlight

### Edge Function
- [ ] Deploy the `sign-upload` Edge Function:
  ```bash
  supabase functions deploy sign-upload
  ```
- [ ] Verify it's running: Dashboard → Edge Functions → sign-upload should show "Active"

---

## 2. APP CONFIGURATION

### Keys (already hardcoded for TestFlight)
The Supabase URL and anon key are set in `App.tsx` lines 34-35.
For production, move to EAS secrets:
```bash
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://your-project.supabase.co"
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-anon-key"
```

### Bundle Identifier
- [ ] `app.json` → `ios.bundleIdentifier` is set to `com.flowvault.app`
- [ ] Change if needed to match your Apple Developer account

### EAS Build Config
- [ ] Fill in `eas.json` → `submit.production.ios`:
  - `appleId`: your Apple ID email
  - `ascAppId`: App Store Connect app ID
  - `appleTeamId`: your Team ID

---

## 3. BUILD & SUBMIT

```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Build for TestFlight (internal distribution)
eas build --platform ios --profile preview

# Or build for App Store
eas build --platform ios --profile production

# Submit to TestFlight
eas submit --platform ios
```

---

## 4. POST-BUILD VERIFICATION

Test these flows on a real device:

### New User
- [ ] Open app → AuthScreen appears
- [ ] Tap "Create one" → signup form
- [ ] Enter email + password → "Create Account"
- [ ] If email confirmation OFF: auto-navigates to Onboarding → Main app
- [ ] If email confirmation ON: green success banner with "Resend" link → check email → confirm → sign in
- [ ] Onboarding screen shows tips → "Get Started" → Main tabs

### Existing User
- [ ] Sign in with email + password → navigates to Library
- [ ] Wrong password → clear error message
- [ ] Forgot password → modal → sends reset email

### Core Features
- [ ] Library: empty state → Create tab → add a move with photo
- [ ] Library: move appears with thumbnail
- [ ] Library: tap move → MoveDetails → edit → save
- [ ] Practice (Quick Shuffle): generate random set → reorder → save as routine
- [ ] Practice (Drill): set goals → generate session → complete moves → streak updates
- [ ] Routines: view saved routines → edit → delete
- [ ] Settings: sign out → back to AuthScreen
- [ ] Settings: delete account → 2-step confirmation → account removed

### Media Upload
- [ ] Upload photo from library → appears on move
- [ ] Upload video from library → plays in MoveDetails
- [ ] Take photo with camera → uploads and saves
- [ ] Large video (30MB+) → shows progress bar → completes

---

## 5. KNOWN ITEMS FOR LATER

These are not blockers for TestFlight but should be addressed before public launch:

- **Accessibility**: Add `accessibilityLabel` and `accessibilityRole` to all Pressable components
- **expo-av deprecation**: SDK 52 recommends migrating to `expo-video` (expo-av still works)
- **RandomizerScreen.tsx**: Dead code — the Practice tab's "Quick Shuffle" mode replaced it. Safe to delete.
- **Custom SMTP**: Set up custom email sender for auth emails (default is Supabase's domain)
- **Error monitoring**: Add Sentry or similar crash reporting
- **App Store assets**: Screenshots, description, privacy policy URL
