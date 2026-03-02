# Flowvault — Dance Move Library & Routine Generator

**Flowvault** is a React Native mobile app that lets dancers organize, tag, and randomize their training clips into creative practice routines. Built with Expo, TypeScript, and Supabase.

---

## 🎯 Features

✅ **Email/OTP Authentication** — Passwordless login via magic link  
✅ **User-scoped Move Library** — Each user sees only their own moves (RLS enforced)  
✅ **Media Upload** — Upload videos and images from camera or gallery (cross-platform)  
✅ **Tagging & Difficulty Levels** — Organize moves by tags and difficulty (Beginner, Intermediate, Advanced)  
✅ **Randomizer** — Generate random practice routines from your library  
✅ **Storage Diagnostics** — Test storage health directly from Settings  
✅ **Clean UI** — Bottom tab navigation with Library, Create, Randomizer, and Settings  

---

## 🏗 Tech Stack

- **Frontend**: React Native (Expo SDK)
- **Language**: TypeScript
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Storage**: Supabase Storage (public bucket with RLS for user-scoped uploads)
- **Local State**: AsyncStorage (synced with Supabase on focus)
- **Navigation**: React Navigation (bottom tabs + stack)

---

## 📁 Project Structure

```
flowvault/
├── App.tsx                   # Entry point with auth flow and navigation
├── screens/
│   ├── AuthScreen.tsx        # Email/OTP login
│   ├── LibraryScreen.tsx     # Browse moves and routines
│   ├── MoveEditScreen.tsx    # Create/edit moves with upload
│   ├── RandomizerScreen.tsx  # Generate random routines
│   └── SettingsScreen.tsx    # Profile, diagnostics, storage test
├── components/
│   ├── MoveCard.tsx          # Move list item with thumbnail
│   └── PrimaryButton.tsx     # Reusable button component
├── hooks/
│   ├── useMoves.ts           # Moves & routines local state provider
│   └── useAuth.ts            # Supabase auth session management
├── lib/
│   ├── supabase.ts           # Lazy Supabase client with safe stubs
│   ├── upload.ts             # Cross-platform file→blob conversion & upload
│   ├── theme.ts              # Design tokens (colors, spacing, radii)
│   └── uuid.ts               # UUID generation helper
├── types/
│   └── move.ts               # TypeScript types for Move, Routine, Difficulty
├── supabase_schema.sql       # Database schema & RLS policies
└── SETUP_INSTRUCTIONS.md     # Step-by-step Supabase setup guide
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- Expo CLI installed globally (`npm install -g expo-cli`)
- A Supabase account and project

### 1. Clone the repo

```bash
git clone <your-repo-url>
cd flowvault
npm install
```

### 2. Set up Supabase

Follow the detailed instructions in **[SETUP_INSTRUCTIONS.md](./SETUP_INSTRUCTIONS.md)** to:

1. Create a Supabase project
2. Apply the database schema (`supabase_schema.sql`)
3. Create the `moves` storage bucket
4. Get your Supabase URL and anon key

### 3. Configure your app

Open `App.tsx` and replace the placeholder values with your Supabase credentials:

```typescript
;(globalThis as any).SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co'
;(globalThis as any).SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE'
```

### 4. Run the app

```bash
npm start
# or
npx expo start
```

Then press:
- `i` for iOS simulator
- `a` for Android emulator
- Scan QR code with Expo Go app on your phone

---

## 🔐 Authentication Flow

1. User opens app → sees **AuthScreen**
2. Enter email → tap "Send Magic Link"
3. Check email → click magic link
4. Supabase validates → user is authenticated
5. App shows **Library** (MainTabs)

Session is persisted via Supabase JS SDK — users stay logged in across app restarts.

---

## 📸 Upload Flow

1. User taps **Create** tab
2. Fill in move name, difficulty, tags, notes
3. Tap "Pick Video" or "Pick Image"
4. App requests permissions (camera/gallery)
5. User selects media
6. App converts picker output → Blob (cross-platform: file://, content://, ph://, data:, blob:)
7. Validates size (images ≤5MB, videos ≤50MB/≤5min)
8. Uploads to `moves/{user_id}/{YYYY-MM-DD}/{timestamp}-{random}.{ext}`
9. Gets public URL
10. Inserts record into `moves` table (user_id auto-filled via RLS)
11. Navigates to Library → new move appears at top

---

## 🗂 Database Schema

### Table: `moves`

| Column       | Type          | Description                              |
|--------------|---------------|------------------------------------------|
| `id`         | UUID          | Primary key (auto-generated)             |
| `user_id`    | UUID          | Foreign key to auth.users (auto-filled)  |
| `name`       | TEXT          | Move name                                |
| `difficulty` | TEXT          | Beginner, Intermediate, or Advanced      |
| `tags`       | TEXT[]        | Array of tag strings                     |
| `notes`      | TEXT          | Optional notes                           |
| `video_url`  | TEXT          | Public URL to uploaded video             |
| `image_url`  | TEXT          | Public URL to uploaded image/thumbnail   |
| `created_at` | TIMESTAMPTZ   | Auto-set on insert                       |

### RLS Policy

Single policy `user_owns_moves` grants users full access (SELECT, INSERT, UPDATE, DELETE) only to rows where `user_id = auth.uid()`.

### Storage Bucket: `moves`

- **Public**: Yes (allows public read of uploaded media)
- **File size limit**: 100 MB
- **Policies**:
  - `public_read_moves` — anyone can SELECT (read) objects
  - `user_write_own` — authenticated users can INSERT/UPDATE/DELETE only under `moves/{user_id}/...`

---

## 🛠 Troubleshooting

### "Failed to derive file/blob from input"
- Grant photo library and camera permissions when prompted
- On iOS: Check Settings > Flowvault > Photos
- On Android: Check Settings > Apps > Flowvault > Permissions

### "violates row-level security policy"
- Make sure you're signed in (check Settings > Diagnostics > Auth User ID)
- Verify RLS policies were applied correctly

### "Storage upload failed"
- Check bucket name is exactly `moves`
- Verify bucket is set to public
- Check storage policies are applied (see `supabase_schema.sql`)

### "Not authenticated"
- Sign out and sign in again
- Check email for magic link
- Verify Supabase project is active

---

## 📦 Dependencies

Key packages used:

- `expo` — React Native framework
- `@supabase/supabase-js` — Supabase client
- `react-navigation` — Navigation (bottom tabs + stack)
- `expo-image-picker` — Camera & gallery access
- `expo-video-thumbnails` — Video thumbnail generation
- `expo-file-system` — File system access (for Android content:// URIs)
- `@react-native-async-storage/async-storage` — Local persistence
- `@react-native-community/slider` — Slider for Randomizer

---

## 🎨 Design Principles

- **Bottom tab navigation** for clear intent per screen
- **Hierarchy, spacing, and contrast** over visual clutter
- **Progressive disclosure** — show only what's needed
- **Color roles** (primary, onPrimary, surface, etc.) from `lib/theme.ts`
- **Accessibility** — clear touch targets, readable text, error messages

---

## 🚢 Production Deployment

Before shipping to users:

1. **Move secrets to environment variables**:
   ```js
   // app.config.js
   export default {
     expo: {
       extra: {
         SUPABASE_URL: process.env.SUPABASE_URL,
         SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
       }
     }
   }
   ```

2. **Build for iOS/Android**:
   ```bash
   eas build --platform ios
   eas build --platform android
   ```

3. **Enable Supabase production settings**:
   - Set up custom SMTP for emails
   - Configure custom domain for auth redirects
   - Review RLS policies
   - Set up monitoring & alerts

---

## 🧑‍💻 Contributing

This project was built by a0.dev (YC W25) as a mobile-first MVP for dancers to organize and randomize their training clips.

To contribute:
1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## 📄 License

MIT License — see LICENSE file for details.

---

## 🙏 Acknowledgments

Built with:
- [Expo](https://expo.dev)
- [Supabase](https://supabase.com)
- [React Navigation](https://reactnavigation.org)

Created by **a0.dev** (YC W25) — founded by Ayomide Omolewa & Seth Setse.

---

✨ **Enjoy building with Flowvault!** If you have questions or need help, check `SETUP_INSTRUCTIONS.md` or open an issue.