# MiniLedger

A small React Native app for keeping track of money lent to friends. Built with **Expo, TypeScript, Node.js, Express, and PostgreSQL**.

![MiniLedger preview with an overdue entry](docs/screenshots/ledger.png)

## Assignment coverage

- Phone login with a six-digit mock OTP printed only in the backend terminal.
- Add a loan with friend name, INR amount, and due date.
- List loans, highlight overdue entries, and mark a loan fully repaid.
- Summary of total lent, total repaid, overdue, and outstanding amounts.
- Bonus: optional JPEG/PNG receipt photos, input validation, and automated tests.
- Persisted login on native devices, pull to refresh, filters, loading/error/empty states.

This is a phone app. The backend runs on your computer. Expo Go runs the React Native app on your phone, or you can use a simulator/emulator. A web preview is included for convenience.

## Prerequisites

- Node.js **22.13 or newer** (Node 24 LTS recommended), with npm.
- PostgreSQL 17, or Docker Desktop running Linux containers.
- Expo Go compatible with **Expo SDK 57** on Android, or an Android emulator/iOS simulator. iOS simulators require macOS.

SDK 57 is intentional. If the installed Expo Go shows an SDK mismatch, install the SDK 57 Android build from [Expo Go downloads](https://expo.dev/go). The Apple App Store build does not support SDK 57 on a physical iPhone; Expo documents a separate TestFlight build process that requires an Apple Developer Program membership. For a quick phone demo, use Android; otherwise use an Android emulator or an iOS simulator on macOS. See [Expo Go compatibility](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/).

## Run locally

Run commands from the repository root unless a step says otherwise. PowerShell users can use `npm.cmd` / `npx.cmd` if script execution policy blocks `npm` / `npx`.

### 1. Install dependencies

```sh
npm ci
```

### 2. Start PostgreSQL

With Docker Desktop running:

```sh
docker compose up -d db
```

This creates database `miniledger`, user `miniledger`, and local development password `miniledger` on port `5432`. Data persists in a Docker volume. These are local development credentials.

Alternatively create a database and role in your existing PostgreSQL installation and put that connection string in `backend/.env`. No SQLite or in-memory fallback is used.

### 3. Configure the backend

Copy `backend/.env.example` to `backend/.env`:

```powershell
Copy-Item backend/.env.example backend/.env
```

On macOS/Linux use `cp backend/.env.example backend/.env` instead. Generate a secret:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Paste that output into `JWT_SECRET` in `backend/.env`. Keep `.env` out of Git. The example `DATABASE_URL` matches Docker Compose.

```sh
npm run db:migrate
npm run dev:api
```

Leave this terminal open. Check `http://localhost:4000/health`; it should return `{"status":"ok"}`. The server listens on all interfaces so a phone on the same Wi-Fi can reach it.

### 4. Configure the phone app

Copy `mobile/.env.example` to `mobile/.env`. Set `EXPO_PUBLIC_API_URL` for your device:

| Device                                   | API URL                            |
| ---------------------------------------- | ---------------------------------- |
| Physical Android/iPhone                  | `http://YOUR_COMPUTER_LAN_IP:4000` |
| Android Studio emulator                  | `http://10.0.2.2:4000`             |
| iOS simulator / browser on this computer | `http://localhost:4000`            |

On Windows run `ipconfig` and use your Wi-Fi adapter's IPv4 address, e.g. `http://192.168.1.10:4000`. The phone and computer must be on the same network. If Windows asks, allow Node.js on your **private** network. Test `http://YOUR_COMPUTER_LAN_IP:4000/health` in the phone browser before opening the app. `localhost` on a physical phone means the phone itself.

In a second terminal:

```sh
npm run dev:app
```

Scan the QR code with Expo Go on Android. Press `a` for a running Android emulator. Restart Expo after changing `.env` (use `npx expo start --clear` from `mobile/` if necessary). Physical iPhone setup for SDK 57 requires the separate Expo Go/TestFlight process linked above.

If you change Wi-Fi or switch to a phone hotspot, check the computer's IPv4 address again, update `EXPO_PUBLIC_API_URL`, and restart Expo. Keep the backend running in its own terminal. Normal entry saves and receipt viewing update automatically without restarting Expo or reloading the app.

For an optional desktop preview:

```sh
npm run web
```

Open `http://localhost:8081`. Browser origins are configured in `backend/.env` with `CORS_ORIGINS`. CORS does not apply to native phone requests. An Expo tunnel exposes the bundler only; it does **not** automatically expose your backend.

### 5. Use the app

1. Enter a phone number with country code, e.g. the fictitious demo number `+919876540001`.
2. Read `[MOCK OTP] +919876540001: 123456 ...` in the **backend terminal**. The actual code is random.
3. Enter the six-digit code. No real SMS is sent.
4. Add a future-due entry and a past-due entry. The past-due entry is highlighted.
5. Optionally choose a JPEG/PNG receipt from your photos (maximum 5 MB).
6. Mark an entry repaid and confirm. Totals update immediately after the API reload.
7. Sign out and sign back in with the same phone to see persisted entries.

## Business rules

- All money is **INR**. The API receives `amount` as a decimal **string**, such as `"1250.50"`; the database stores `125050` integer paise. The allowed amount is ₹0.01–₹10,00,000 per entry.
- **Total lent**: all recorded loan principal, including loans already repaid.
- **Total repaid**: principal of fully repaid loans.
- **Outstanding**: total lent minus total repaid.
- **Overdue**: unpaid principal where `due_date < today` in `BUSINESS_TIMEZONE` (default `Asia/Kolkata`). Due today is not overdue. A past-date loan is allowed so existing debts can be recorded.
- A repayment settles the **entire loan**. Partial repayments, interest, edits, and deletion are intentionally outside the assignment.
- Repeated repayment requests keep the original repayment timestamp and never double count.
- OTPs expire after five minutes, allow five wrong attempts, and have a 30-second resend cooldown. Requesting a replacement invalidates the previous code. Login creates an account automatically on the first successful verification.
- JWTs expire after seven days. Native devices store the session in Expo SecureStore; browser preview uses per-tab session storage. Signing out clears the local session; it does not revoke an already-issued token on the server.

## API

All protected endpoints use `Authorization: Bearer <token>`. JSON errors have an `error` message; validation errors also include `issues`. Money in responses is in **paise**.

| Method | Endpoint             | Body / behavior                                                           |
| ------ | -------------------- | ------------------------------------------------------------------------- |
| GET    | `/health`            | Database health check                                                     |
| POST   | `/auth/request-otp`  | `{ "phone": "+919876540001" }`                                            |
| POST   | `/auth/verify-otp`   | `{ "phone": "+919876540001", "otp": "123456" }` → token and user          |
| GET    | `/me`                | Current user                                                              |
| GET    | `/loans`             | Current user's entries and business date                                  |
| POST   | `/loans`             | `{ "friendName": "Aditi", "amount": "1500.50", "dueDate": "2026-11-15" }` |
| PATCH  | `/loans/:id/repay`   | Mark fully repaid; no body                                                |
| GET    | `/loans/:id/receipt` | Private JPEG/PNG response                                                 |
| GET    | `/summary`           | Lent, repaid, outstanding, overdue, entry count, date/timezone            |

For receipt uploads, send `multipart/form-data` to `POST /loans` with text fields `friendName`, `amount`, `dueDate` and file field `receipt`. Let your HTTP client set the multipart boundary.

Example summary:

```json
{
  "totalLentPaise": 200050,
  "totalRepaidPaise": 50000,
  "outstandingPaise": 150050,
  "overduePaise": 150050,
  "entryCount": 2,
  "currency": "INR",
  "today": "2026-10-24",
  "timezone": "Asia/Kolkata"
}
```

## Checks and tests

```sh
npm run typecheck
npm test
npm run build:api
npm run format:check
```

Unit tests require no database. Integration tests exercise a **real PostgreSQL database** with Supertest, including ownership, OTPs, exact totals, date boundaries, uploads, and idempotent repayment.

Create a **separate** database named `miniledger_test`:

```sh
docker compose exec db createdb -U miniledger miniledger_test
```

PowerShell:

```powershell
$env:DATABASE_URL="postgresql://miniledger:miniledger@localhost:5432/miniledger_test"
npm run test:integration
Remove-Item Env:DATABASE_URL
```

macOS/Linux:

```sh
DATABASE_URL=postgresql://miniledger:miniledger@localhost:5432/miniledger_test npm run test:integration
```

The test suite creates its schema and removes its own fixtures. It refuses database names that do not end in `_test`. Do not run suites concurrently against the same test database.

GitHub Actions runs type checks, unit tests, PostgreSQL integration tests, and backend compilation on pushes and pull requests. Use `npm run format` to apply the shared code style. See [verification notes](docs/VERIFICATION.md) for the checks performed and toolchain audit findings.

Build an optional web bundle from `mobile/` with `npx expo export --platform web`. Build Android/iOS bundles with `npx expo export --platform android` / `ios`; this checks bundling but does not produce an APK or replace testing on a device.

## Project map

```text
backend/
  migrations/001_init.sql   PostgreSQL tables, constraints, index
  src/config.ts            Environment validation
  src/db.ts                PostgreSQL connection pool
  src/domain.ts            Money, date, phone, OTP helpers
  src/auth.ts              JWT creation and verification middleware
  src/app.ts               HTTP routes and error handling
  src/server.ts            Startup and graceful shutdown
  src/migrate.ts           Schema setup transaction
  test/                    Unit and PostgreSQL API tests
  uploads/                 Private receipt files (ignored by Git)
mobile/
  App.tsx                  Session restoration and screen selection
  src/LoginScreen.tsx      Phone + OTP flow
  src/LedgerScreen.tsx     Summary, list, filters, repayment
  src/AddLoanModal.tsx     Validated entry form and receipt picker
  src/ReceiptModal.tsx     Authenticated photo viewer
  src/api.ts               HTTP calls, timeout, upload handling
  src/session.ts           SecureStore / browser session storage
  src/types.ts             Client data shapes
  src/format.ts            Currency and date display helpers
  src/ui.tsx               Shared controls and visual styles
docs/
  CODE_WALKTHROUGH.md       File-by-file explanation and request traces
  INTERVIEW_PREP.md         Questions, tradeoffs, learning exercises
  DEMO_SCRIPT.md            Exact narration, screen actions, and demo totals
  SUBMISSION_GUIDE.md       GitHub push and video submission steps
  VERIFICATION.md           Checks and reported Android testing
```

## Development limitations

Mock OTP logging is for this assignment only. A real deployment needs an SMS provider, HTTPS, stronger phone-abuse controls, and log redaction. Receipts live on the backend filesystem, so preserve `backend/uploads` along with database backups. A production deployment should use private object storage; signature checks here are basic format checks, not malware scanning or full image decoding. Rate limits use process memory and reset on restart. OTP challenges themselves are persisted in PostgreSQL.

The schema script is idempotent for the initial tables, not a versioned migration framework. Adding future columns requires a new migration. Lists are unpaginated for this small assignment. Loan creation has no idempotency key; after an ambiguous network failure, refresh the list before retrying a save.

## Learn and submit

Read [the code walkthrough](docs/CODE_WALKTHROUGH.md), then work through [interview preparation](docs/INTERVIEW_PREP.md). Use [the word-for-word recording script](docs/DEMO_SCRIPT.md) for the exact screen to show and what to say during the demo. Follow [the submission guide](docs/SUBMISSION_GUIDE.md) to push the repository and submit both links. Add your recording link after uploading the video; no publication is performed automatically.
