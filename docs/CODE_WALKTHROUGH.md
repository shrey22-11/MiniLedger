# Understand MiniLedger, from request to database

Read this with the actual files open. The goal is to explain each statement's purpose, then change small pieces yourself. Memorizing an explanation without running the code will not prepare you for follow-up questions.

## 1. The whole system

```text
Phone (React Native / Expo)
  → HTTP request + JSON or multipart photo + bearer token
Express API (Node.js / TypeScript)
  → validate input → verify identity → parameterized SQL
PostgreSQL
  → rows → JSON response → React state → screen rerender
```

The phone never connects to PostgreSQL directly. Database credentials and the JWT secret belong only in the backend environment. `EXPO_PUBLIC_API_URL` is public configuration bundled into the app; never put secrets in an `EXPO_PUBLIC_` variable.

**Node.js** runs JavaScript on the server. **TypeScript** catches many shape/type mistakes during development but its types disappear at runtime. **Express** maps HTTP methods and paths to functions. **PostgreSQL** persists data and enforces constraints. **React Native** renders native phone controls from React components. **Expo** provides the development tooling and native modules such as SecureStore and image selection.

The root `package.json` declares two npm workspaces. Dependencies install with one lockfile. Root scripts delegate to the appropriate workspace. `package-lock.json` records exact resolved dependency versions; `npm ci` reproduces them.

## 2. Backend foundations

### `backend/src/config.ts`

- `import 'dotenv/config'` loads `backend/.env` because backend scripts run from that workspace directory.
- A Zod object describes required environment values. `z.coerce.number()` converts the port string into a number; bounds reject invalid ports.
- `DATABASE_URL` is required. `JWT_SECRET` must be at least 32 characters. Length validation does not itself guarantee randomness, so the README generates a random secret.
- Defaults apply when optional values are absent. `parse(process.env)` throws early if configuration is invalid.
- `Intl.DateTimeFormat` validates the timezone name immediately. A misspelled timezone should stop startup rather than fail during a user's request.
- `config` is the validated object exported to other files.

### `backend/src/db.ts`

`new pg.Pool(...)` manages reusable connections. Opening a new PostgreSQL connection for every query would add work and latency. `max: 10` limits the pool size for this small service. `pool.query` borrows a connection automatically for one statement; `pool.connect` reserves one for a transaction. Release reserved clients in `finally` so errors do not exhaust the pool.

The pool's `error` listener handles errors from idle connections. Query failures still reject their promises and reach Express's error handler.

### `backend/migrations/001_init.sql`

There are three tables:

| Table            | Purpose                                 | Key fields                                                                       |
| ---------------- | --------------------------------------- | -------------------------------------------------------------------------------- |
| `users`          | One account per normalized phone string | UUID primary key; unique phone                                                   |
| `otp_challenges` | Current OTP state per phone             | Phone primary key; hash, expiry, failures, request time                          |
| `loans`          | A user's lending records                | Owner foreign key, name, amount, due date, repayment timestamp, receipt filename |

- UUIDs identify rows without sequential public IDs. Random IDs are not access control; the owner condition in SQL provides that.
- `phone UNIQUE` prevents duplicate accounts even if two successful logins race.
- `TIMESTAMPTZ` represents an instant; `DATE` represents a calendar date without a time of day. That is why a due date is a `DATE` and repayment is a timestamp.
- `amount_paise BIGINT` stores whole paise. The check constraint rejects nonpositive and over-limit amounts even if another code path bypasses request validation.
- `repaid_at IS NULL` means unpaid. Setting one timestamp records both the state and when it changed; a second status column could disagree with it.
- The foreign key ensures a loan references an existing user. `ON DELETE CASCADE` removes dependent loans if a user is deleted at database level; the app has no delete-account feature. Files would need explicit cleanup in such a feature.
- The `(user_id, due_date)` index helps find one user's loans by due date. It has a storage/write cost but fits the main query. The database can still sort some results because the full ordering contains other expressions.
- `receipt_path` stores a generated filename, not image bytes or a public URL. Files live in `backend/uploads`.

### `backend/src/migrate.ts`

The script reads the SQL file relative to its own module URL, reserves a database connection, begins a transaction, executes the schema, and commits. If execution fails, rollback avoids a half-applied initial schema. `finally` releases the connection and closes the pool so the one-off process exits. `CREATE ... IF NOT EXISTS` makes this initial setup rerunnable; it is not a complete future migration system.

### `backend/src/server.ts`

`await pool.query('SELECT 1')` checks database access before accepting requests. `listen(..., '0.0.0.0')` makes the API reachable from a phone on the local network. `app.ts` exports the Express app separately so tests can exercise it without starting the production listener.

On SIGINT/SIGTERM, `shutdown` stops accepting new requests and closes the pool after the server closes. The `stopping` flag prevents duplicate shutdown work. The timeout ends a stuck shutdown; `unref()` stops that timeout alone from keeping the process alive.

## 3. Validation and exact money

### `backend/src/domain.ts`

`phoneSchema` trims outside whitespace and requires `+`, a nonzero first digit, then digits, with an overall phone-length bound. This is an E.164-style syntax check, not proof that the phone exists. A real SMS flow would verify ownership.

`dateSchema` first checks `YYYY-MM-DD`. It then constructs a UTC date and compares the ISO date back to the input. JavaScript normalizes some invalid dates, so the round-trip catches values such as February 30. The year bounds keep the assignment's input reasonable.

`amountSchema` expects a string. The regular expression rejects negatives, exponent notation, and more than two decimal places. Its transform splits the decimal and computes:

```text
"1500.50" → rupees = "1500", paise = "50"
1500 × 100 + 50 = 150050
"12.3" → 12 × 100 + 30 = 1230
```

This avoids relying on a calculation like `0.1 + 0.2` for money. The resulting integer goes through `pipe(...)` to check the permitted minimum and maximum. The per-entry range is well below JavaScript's maximum safe integer.

`loanSchema` combines the friend name, transformed amount, and due date. The transformed field is still named `amount`, but its value is now **integer paise** inside the route. This is why the insert uses `input.amount` for `amount_paise`.

`businessToday` asks `Intl` for year/month/day parts in one timezone and assembles an ISO date string. It does not use the phone's clock or the server's default timezone. `isOverdue` compares ISO date strings; their fixed-width year-month-day format sorts in calendar order. It also requires an unpaid loan.

`hashOtp` uses HMAC-SHA256 with the server secret. Including both phone and code binds the challenge to that phone. Plain hashes of six-digit values would be easy to enumerate if the database leaked; keyed HMAC requires the secret too. A database-plus-secret compromise still defeats this protection. Mock OTPs are deliberately logged for the assignment.

## 4. Authentication

### `backend/src/auth.ts`

The Express request type is extended to allow `userId`. This gives TypeScript a name for the value middleware attaches; it does not verify identity by itself.

`signToken` signs a JWT with HS256. `subject` holds the user UUID. `expiresIn` bounds validity. Issuer and audience restrict where this app accepts the token. A JWT is signed, not encrypted: its contents can be read, but changing them makes verification fail.

`requireAuth` is middleware: it runs before a protected route. It requires the Bearer scheme, verifies the signature/algorithm/expiry/issuer/audience, and checks the subject. Success sets `req.userId` then calls `next()`. Failure responds with 401 and returns. Never trust a user ID supplied in the request body.

### OTP request in `app.ts`

1. Validate the phone.
2. Generate a cryptographically random six-digit value using `randomInt`.
3. Compute its HMAC.
4. Insert an OTP challenge expiring in five minutes.
5. If a row already exists, replace it only when its request timestamp is at least 30 seconds old.
6. If the conditional upsert changes no row, return 429.
7. Print the code in the server log and return metadata, without returning the code to the client.

The cooldown check is inside SQL, so two simultaneous requests cannot both pass a separate “read then write” check. Replacing a challenge resets failed attempts and changes the code.

### OTP verification in `app.ts`

1. Validate phone and six-digit OTP format.
2. Reserve a connection and begin a transaction.
3. Select the challenge `FOR UPDATE`. This locks that row until commit/rollback.
4. Check database-clock expiry and the failure count.
5. Compare equal-length hash buffers with `timingSafeEqual`.
6. On success, insert or retrieve the user and delete the challenge.
7. On a wrong valid challenge, increment attempts.
8. Commit, release the connection, then return a JWT or a generic 401.

The row lock makes successful verification single-use under concurrency: the second verifier waits, then finds no challenge. Failed attempts must be committed too; rolling back a failed attempt would undo the counter. Never send the raw database error or hash to the phone.

The phone cooldown display improves the experience. The database cooldown actually enforces the rule. Anyone can bypass app-only controls by calling an API directly.

## 5. HTTP middleware and route details

### Setup in `backend/src/app.ts`

- `express()` creates the app; disabling `x-powered-by` removes an unnecessary framework header.
- Helmet sets standard HTTP security headers. This is useful hardening, not a replacement for authentication or HTTPS.
- CORS permits configured browser origins. It is a browser policy; native callers and scripts still require token verification.
- `express.json({ limit: '16kb' })` parses bounded JSON bodies. Multer separately handles multipart uploads.
- A global per-IP rate limiter bounds ordinary request volume; a stricter limiter covers `/auth`. This demo uses the default process-memory store. Clients behind a shared IP share those limits.
- Express 5 forwards rejected async route promises to the error handler automatically.

### `GET /loans`

The SELECT maps SQL snake_case names into client camelCase aliases. `to_char` returns due dates explicitly as `YYYY-MM-DD`, avoiding accidental driver timezone conversion of a calendar date. PostgreSQL's `BIGINT` normally comes back as a string through `pg`; the explicit `float8` cast gives JavaScript a number. Per-loan constraints keep values safe; extremely large future aggregate datasets would need a decimal/string strategy.

`WHERE user_id = $1` limits rows to the JWT's user. `$1` is a bound SQL parameter, keeping user input separate from SQL syntax. Ordering puts unpaid rows first, then nearest due dates. Each returned row gets a server-computed `overdue` flag. The response also includes the authoritative date and timezone.

### `POST /loans`

`requireAuth` runs before `upload.single('receipt')`, so unauthenticated users cannot submit receipt data to the upload handler. Multer stores at most one 5 MB image in memory and accepts only a small number of text fields. Both JSON-only and multipart inputs reach the same loan validator.

For a file, the route checks JPEG/PNG magic bytes rather than trusting an extension or MIME string. It generates a UUID filename, creates the private upload folder, and writes the bytes. Only then does it insert the row. If the insert fails, it removes the just-written file before propagating the error. A process crash between write and insert can still leave an orphan file; database transactions cannot atomically commit filesystem writes. That is an acknowledged small-app tradeoff.

The INSERT includes the authenticated owner. `RETURNING` fetches the inserted entry without another round trip. Success returns HTTP 201. Photos are never served as a public static directory.

### `PATCH /loans/:id/repay`

The route validates a UUID and updates only the matching owner's row. `COALESCE(repaid_at, NOW())` keeps an existing timestamp; if it is null, the current timestamp is used. This is **idempotence**: repeating the same action produces the same stored repayment state. Concurrent updates cannot create two repayment records because there is only one timestamp on the row. A missing or somebody else's row produces the same 404, without revealing ownership.

### `GET /summary`

One aggregate query calculates all totals for the authenticated owner:

- `SUM(amount_paise)` → lent.
- `FILTER (WHERE repaid_at IS NOT NULL)` → repaid.
- `FILTER (WHERE repaid_at IS NULL)` → outstanding.
- Unpaid plus `due_date < businessToday` → overdue.
- `COALESCE(..., 0)` converts SQL's empty-set null into zero.

One SQL statement reads its values from one consistent statement snapshot. The mobile app requests summary and list separately, so a concurrent change could briefly put them out of sync; the app refreshes after its own writes. An atomic combined ledger endpoint would be a future improvement if needed.

### Private receipts, `/me`, and errors

`GET /loans/:id/receipt` checks both UUID and owner before calling `sendFile` with the private root directory. The stored filename was generated on the server. `Cache-Control: private, no-store` asks browsers not to retain sensitive receipt responses. `/me` looks up the current account and rejects a token for a user that no longer exists.

The fallback returns JSON 404. The error middleware recognizes Zod errors, upload errors, malformed JSON, and missing receipt files. Unexpected errors are logged server-side and return a generic 500. `return` after responding prevents sending a second response.

Status meanings: **200** success, **201** created, **400** invalid request, **401** missing/invalid login, **404** unavailable resource, **429** rate limit, **500** unexpected server error.

## 6. Mobile foundations

### `mobile/index.ts`, `app.json`, and `App.tsx`

`registerRootComponent(App)` registers the entry component with Expo. `app.json` supplies the name, platform identifiers, orientation, and native plugin configuration. Image access is for library receipt selection; the app does not request camera/microphone functionality.

`App.tsx` owns the session and restoration state. Its first effect loads saved login state once. Until that resolves it shows a loading state. With a session it renders the ledger; otherwise it renders login. `login` waits for storage before displaying the signed-in app. `logout` removes storage before clearing state. `useCallback` keeps these callback identities stable so effects in child components do not rerun merely because a new function object was created.

`SafeAreaProvider`/`SafeAreaView` keep content clear of phone notches and system bars. The status bar uses a dark style against the light background.

### `mobile/src/types.ts`

Types describe API response fields, the session, summary, and selected receipt. For example `repaidAt: string | null` says a loan may be unpaid. These types make editor/compiler checks helpful but do not validate server responses at runtime. The API is controlled by the same project; a larger application could validate responses too.

### `mobile/src/session.ts`

Native sessions use Expo SecureStore, backed by operating-system storage. Browser preview uses `sessionStorage`, which is per tab and is accessible to JavaScript on that origin. `loadSession` catches missing/corrupt storage and validates the minimum expected shape. An expired token is rejected by the server when the ledger loads; the 401 handler signs out. No password or OTP is persisted.

### `mobile/src/api.ts`

`API_URL` reads public Expo configuration and removes a trailing slash. Android defaults to the emulator alias `10.0.2.2`; a physical phone needs the computer's LAN address.

`request<T>` is a reusable typed HTTP helper. It creates an AbortController and 15-second timer, merges headers, adds a bearer token, and adds JSON content type only for JSON bodies. With FormData, fetch must generate its own boundary. It parses the response, turns non-success status codes into `ApiError`, and distinguishes these from connection failures. `finally` always clears the timer. The `T` generic describes the expected response at compile time.

`api` names the app's operations. For JSON bodies it uses `JSON.stringify`. `addLoan` uses multipart only if a receipt exists. In a browser the selected URI becomes a Blob. On native devices, `expo-file-system` makes a File from the picker URI and `expo/fetch` streams it as multipart data. React Native's older URI descriptor upload path failed on the tested Android phone. The server still validates the file independently.

### `mobile/src/format.ts` and `ui.tsx`

`money` divides paise by 100 only for display and uses the Indian locale. `dateLabel` constructs a local midday date from a calendar string; it does not treat midnight UTC as the due date. `validDate` mirrors server calendar rules for immediate feedback. Server validation remains authoritative.

`Button`, `Field`, and `ErrorNote` share styling and behavior. Button disables itself while busy, preventing rapid taps. Field forwards native input properties. Accessibility labels expose the purpose of inputs and actions. Shared colors keep the interface consistent without introducing a UI framework.

## 7. Screens and React state

### `LoginScreen.tsx`

`useState` tracks phone, OTP, which stage is visible, busy state, errors, and resend countdown. Updating state asks React to rerender the component; it does not reload the page.

`send` checks the phone format, clears the error, awaits the API, then moves to OTP mode and starts the cooldown. Its `finally` restores the button. `verify` checks six digits, calls the API, and passes the new session to `App`. The countdown effect installs one timeout and cleans it up when the value changes or the component unmounts. The code is never read from an API response; the human reads the terminal.

`KeyboardAvoidingView` adjusts layout for the iOS keyboard; `ScrollView` allows smaller screens to reach the form. `keyboardShouldPersistTaps="handled"` lets buttons work when the keyboard is open. Changing phone returns to the first stage without persisting an OTP.

### `LedgerScreen.tsx`

- State holds fetched entries/summary, selected filter, initial/refresh loading, errors, modal visibility, and repayment state.
- `refresh` runs list and summary calls concurrently with `Promise.all`. It updates React state only while mounted and signs out on 401.
- A `useRef` tracks mount status without causing renders. Effect cleanup marks it false, removes the AppState listener, and clears the timer.
- The first effect fetches data, refreshes when the app returns to the foreground, and refreshes every minute while mounted so overdue labels eventually change across midnight. This is a small polling tradeoff.
- `visible` is a derived array based on the filter. No new database query is needed to switch filters on this small list.
- `FlatList` renders entries with stable loan UUID keys. It supports refresh, header summary, empty state, and footer. Pagination would be needed for a much larger ledger.
- The entry's name initials, status badge, dates, and color derive from its values. Repaid loans lose their overdue styling. The summary uses server totals, rather than totals from just the visible filter.
- Tapping repayment opens a confirmation modal. `repay` calls the API once while busy, closes the dialog, and refreshes list/totals. Confirmation is deliberate because this app has no undo flow.
- Add success and repayment success display temporary feedback. Fetch errors preserve previously loaded data and offer a retry. If a write succeeded but refresh failed, the user sees the fetch error and can reload.

### `AddLoanModal.tsx`

The modal owns a temporary draft. Closing and reopening it creates fresh state. The default due date comes from the server's business date.

`pickReceipt` opens the system photo library and checks type/size. The app shows a preview and lets the user remove or replace it. The backend independently checks the upload. `save` validates and trims the name, checks money/date rules, disables inputs, sends the entry, refreshes the ledger, then closes the modal. It displays server errors without discarding the draft. A past date is valid by design.

### `ReceiptModal.tsx`

The viewer first fetches the private image with the bearer Authorization header. On native devices it uses `expo/fetch`, writes the returned bytes into a temporary file in `Paths.cache`, and gives that local URI to Image. This keeps authentication and HTTP out of the native image loader, which failed to display the protected URL on the tested Android phone. In the browser it creates a temporary Blob URL instead. Closing the modal aborts pending work and deletes the temporary file or revokes the Blob URL. The original remains on the server. The image endpoint never becomes public, and the token is never placed in a URL. Download and image-decoding failures have separate messages to make diagnosis clearer.

## 8. Trace these three flows aloud

### Login

`LoginScreen.send → api.requestOtp → Express route → Zod → OTP upsert → server log → human enters code → verify route transaction → user + JWT → saveSession → App renders LedgerScreen`.

### Add a loan

`AddLoanModal.save → client validation → api.addLoan → Bearer middleware → JSON/Multer → server validation → INSERT with authenticated user ID → 201 → refresh list + summary → React state update → new entry on screen`.

### Mark repaid

`Entry button → confirmation modal → api.repay → JWT verification → UUID validation → owner-scoped UPDATE with COALESCE → response → refresh → summary counts settled principal and excludes it from overdue`.

## 9. What the tests prove

`backend/test/unit.test.ts` isolates pure rules: exact paise conversion, rejected decimals, calendar validity, due-today behavior, timezone midnight, phone syntax, trimmed names, and keyed OTP hashing. It uses Node's built-in test runner and strict assertions.

`backend/test/integration.test.ts` uses Supertest to send real HTTP requests through Express and real SQL to PostgreSQL. It checks database health, authentication failures, empty totals, invalid input, overdue/due-today creation, exact aggregates, account isolation, repayment retries, private image access and upload limits, route errors, logged OTP/cooldown/single use, expiry, and five-failure lockout. Fixtures are removed in `finally`; the suite requires a dedicated `_test` database.

Tests do not prove native layout, photo permission behavior on every phone, production load handling, or a real SMS integration. Device rehearsal and the screen recording cover the actual demonstration environment.
