# Voto Secreto - Mobile App (Expo / React Native)

## Stack
- **Framework**: Expo SDK 54 (React Native 0.81)
- **Auth**: Supabase Auth (email OTP + Google OAuth)
- **DB**: Supabase PostgreSQL (RLS, RPCs)
- **Storage**: Supabase Storage (avatars)
- **Push**: Expo Push Service + Supabase Edge Function `send-push`
- **Ads**: Google AdMob Rewarded
- **i18n**: es/en/it/fr/de
- **Routing**: expo-router (file-based)
- **Animations**: react-native-reanimated v4
- **Gestures**: react-native-gesture-handler

## Project structure
- `/app/` - expo-router pages (index, groups, profile, vote/[groupId], create-encuesta, complete-profile, crear-grupo, grupo/[id], auth/callback)
- `/lib/` - shared utils (supabase, notifications, i18n, profile, adManager, rewardedAd, uploadAvatar, phoneNormalize, countries, encuestasCache, versionCheck)
- `/context/` - React contexts (createEncuestaContext)
- `/supabase/` - SQL files (schema.sql, encuestas.sql)
- `/ios/` - native iOS project (manual Xcode builds)
- `/android/` - native Android project (manual builds)
- `/scripts/build-android.sh` - Android build pipeline

## Tables (encuestas.sql)

### encuestas
id, titulo, owner (phone), owner_nick, finalizada, votantes, multiopcion, personas_a_votar, personas_votadas, created_at, finalizada_at

### encuestas_opciones
id, id_encuesta (FK), opcion_texto, total_votos

### encuestas_usuarios
id_encuesta (FK), phone_usuario, nick_usuario. PK: (id_encuesta, phone_usuario)

### encuestas_votos
id, id_encuesta (FK), opcion_id (FK), created_at

### encuestas_ha_votado
id_encuesta (FK), user_id (FK). PK: (id_encuesta, user_id)

### encuestas_lecturas
id_encuesta (FK), user_id (FK), leida_at. PK: (id_encuesta, user_id)

### encuestas_eliminadas
id_encuesta (FK), user_id (FK). PK: (id_encuesta, user_id)

### grupos
id, user_id (FK), nombre, imagen_url, created_at

### grupos_miembros
id_grupo (FK), phone, nick. PK: (id_grupo, phone)

### profiles (schema.sql)
id (FK auth.users), email, phone (unique), nick, avatar_url, created_at, updated_at

### push_tokens
user_id (PK FK), token, platform, created_at, updated_at

### app_config
key (PK), value

## Key identifiers
- Package/bundle ID: `com.termibululu.vhortosecreto`
- Supabase project: `jheujtrgjwoflanbmzqu.supabase.co`
- EAS project ID: `39b9d279-72d2-4793-9fdc-8de00d760785`
- Version: 1.0.3 (Android versionCode: 5)

## Auth flow
- Login: email → OTP → verify → check profile completeness → redirect
- Google OAuth: WebBrowser → deep link → setSession → redirect
- Profile check: `isProfileComplete()` checks phone + nick exist (avatar optional)
- Trigger `on_auth_user_created` was DROPPED — profiles created only via registration form

## RLS policies
Tables use RLS. Notable policies:
- `encuestas_select_participantes`: owner or participant (by phone) can see encuesta
- `encuestas_update_owner`: only owner can update
- `encuestas_delete_owner`: only owner can delete
- `encuestas_usuarios_update_self`: user can update rows where phone_usuario = own phone
- `grupos_miembros_update_self`: user can update rows where phone = own phone
- `grupos_miembros_delete_own_group`: group owner can delete members
- `profiles_update_own`: user can update own profile
- `profiles_select_authenticated`: any authenticated user can read profiles
- `push_tokens_insert/update/select_own`: user manages own push token

## RPCs (security definer)
- `create_encuesta_bundle(text, boolean, text[], text[])` → uuid
- `votar_encuesta(uuid, uuid[])` → void
- `salir_encuesta(uuid)` → void
- `eliminar_encuesta_finalizada(uuid)` → void
- `crear_grupo(text, text[], text)` → uuid
- `is_encuesta_visible(uuid, text)` → boolean (helper)

## Badge notifications
- Badge cleared on: app start, notification tap, app foreground (`AppState`)
- Push payload includes `badge: 1`
- `setBadgeCountAsync(0)` called via `clearBadge()` helper

## Test login (@test.com)
- Emails ending in `@test.com` bypass OTP flow
- Edge Function `create-test-user` creates user with `email_confirm: true`, generates phone `+34XXXXXXXXX`, sets nick from email prefix
- If user already exists, logs in directly
- To disable: remove the `@test.com` check in `index.tsx` and/or delete the Edge Function

## Push notifications
- Token saved via `savePushToken(userId)` — called from _layout, login, and profile completion
- Edge function `/supabase/functions/send-push` sends via Expo Push API
- iOS APNs key uploaded via EAS credentials (key ID: D24JM6LY4J, team: VY93Z2D6Y4)

## Nick sync
When user changes nick in profile.tsx or completes profile in complete-profile.tsx:
1. UPDATE profiles SET nick WHERE id = user.id
2. UPDATE encuestas SET owner_nick WHERE owner = phone
3. UPDATE encuestas_usuarios SET nick_usuario WHERE phone_usuario = phone
4. UPDATE grupos_miembros SET nick WHERE phone = phone

## Builds
- **Android**: `bash scripts/build-android.sh` → AAB + APK
- **iOS**: `npx expo prebuild --clean` → open Xcode → Product → Archive → Distribute
- Keystore: `release.keystore` (alias: vhortosecreto, pass: julian1234)

## Admin panel (separate project)
- `/Volumes/dev/Projects/React/admin-vhortosecreto/`
- Next.js deployed on Vercel (`admin-vhortosecreto`)
- Custom JWT auth (bcrypt + cookie), not Supabase Auth
- Login: `admin@ejemplo.com` / `julian12`
- Dashboard: users CRUD with cascade delete, surveys list
