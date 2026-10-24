# MiniLedger interview preparation

## How to study

1. Run the app yourself from the README. Explain the phone-to-server connection before studying any framework detail.
2. Read `domain.ts` and its tests. Predict each expected result before running them.
3. Read the SQL schema and draw the relationships on paper.
4. Trace login, creation, and repayment using `CODE_WALKTHROUGH.md` with the code open.
5. Explain a file without reading the notes. When you get stuck, inspect the actual statement and run a small experiment.
6. Do the exercises below yourself. Being able to modify and debug the project matters more than recalling every line number.

AI assistance is allowed in this assignment. Describe that honestly: explain what you used it for, what you verified, and which decisions you understand. Do not claim to have manually written or independently tested something you did not.

## Your opening explanation

“MiniLedger tracks loans I make to friends. A phone logs in using a mock OTP, then can add loans, attach a receipt, and mark loans repaid. The React Native client talks to a TypeScript Express API backed by PostgreSQL. I used integer paise for money, a single business timezone for due dates, and owner-scoped database queries. I kept repayment idempotent and tested the main rules and API behavior.”

## Questions you should be able to answer

### Why React Native and Expo?

React Native is specified in the assignment. Expo provides a practical way to run the same React Native code on Android and iOS and supplies native photo selection and secure storage. It reduces native setup for this small project. A browser preview is useful for development, but a web check does not establish that a phone build works.

### Why TypeScript if you already validate with Zod?

TypeScript checks code while developing: wrong properties, mismatched arguments, and nullable fields. It disappears at runtime. Zod validates untrusted request values when the server runs. A malicious client can send anything regardless of the TypeScript types in our source.

### Why PostgreSQL and direct SQL instead of an ORM?

PostgreSQL is required and provides constraints, transactions, aggregates, and persistence. Direct SQL through `pg` makes this small data model explicit and easy to trace. An ORM could improve generated types and migrations in a larger application, but adds concepts and tooling that are unnecessary for three tables.

### Why store paise instead of decimal rupees?

Binary floating point cannot represent all decimal fractions exactly. Parsing a decimal string into whole paise avoids rounding during storage and summation. The schema bounds the per-entry amount. PostgreSQL BIGINT has a larger exact range than JavaScript Number; for very large datasets, the API should use strings or a decimal library for aggregates instead of casting to float8.

### What does “total lent” mean after repayment?

It remains the total principal ever recorded. Repaid increases, outstanding decreases, overdue decreases if that loan was overdue. For a ₹1,500.50 overdue loan and a ₹500 pending loan, repaying the first leaves lent ₹2,000.50, repaid ₹1,500.50, outstanding ₹500, overdue ₹0.

### What happens on the due date itself?

It is pending, not overdue. The rule is strictly `due_date < today`, with today computed in Asia/Kolkata by default. The backend supplies the rule and business date, so phone clocks and different phone timezones do not change accounting behavior. The screen refreshes periodically and on foreground return.

### Why is an OTP stored in PostgreSQL rather than a Map?

It survives server restarts and gives transactions and row locking. A Map would disappear on restart and differ between instances. Rate limiter counters still use process memory in this small app; a production multi-instance deployment would use shared rate-limit storage such as Redis.

### How do you stop OTP reuse and brute force?

Five-minute expiry, five wrong attempts, 30-second resend cooldown, per-IP request limits, and deletion after success. Verification locks the challenge row in a transaction so parallel requests cannot both consume it. HMAC protects the stored code if only the database leaks. This is still a mock login: real deployment requires actual SMS delivery and broader abuse protections.

### Is a JWT encrypted? Can someone change the user ID?

The payload is readable. The signature detects changes. The server checks signature, expiry, HS256 algorithm, issuer, and audience before using the subject as the user ID. Decoding a token without verifying it would be unsafe. The signing secret stays on the backend.

### How do you prevent users seeing somebody else's loans?

Every loan read/update/receipt lookup includes `user_id = authenticated subject`. IDs alone are never authorization. Integration tests create two users and prove the second gets no rows and cannot repay or fetch the first user's receipt. A request body cannot choose the owner.

### What is SQL injection? Where is it prevented?

It occurs when untrusted text becomes part of executable SQL syntax. The app uses placeholders such as `$1` and passes values separately. SQL snippets in the code are fixed. Input validation is also useful, but parameterized queries are the key protection.

### Why is repayment safe to retry?

There is one `repaid_at` field. `COALESCE(repaid_at, NOW())` sets it only when null and keeps the first timestamp otherwise. Summaries add loan principal once for each repaid loan. A retry cannot add a second repayment or change the original settlement time. Creation has no equivalent request key, so an ambiguous failed save should be checked in the list before retrying.

### What does a database transaction do here?

It groups related statements into an all-or-nothing change. OTP verification must consume the code and find/create the user together, with a row lock during the decision. A failed attempt is committed so its counter persists. A single repayment UPDATE is already atomic and does not need an explicit multi-statement transaction.

### What happens when saving a receipt fails?

The app validates before sending. The backend limits file size and checks JPEG/PNG signatures. It writes a generated filename and inserts the loan; if insertion fails, it deletes the newly written file. A process crash between those steps can leave an orphan. Production storage would need a cleanup strategy or staged object lifecycle. Files and database rows cannot share a native PostgreSQL transaction.

### Are receipt URLs public?

No. The image endpoint verifies login and ownership. The filesystem folder is not exposed with `express.static`. Native Image sends a bearer header; browser preview fetches a private Blob with that header. Tokens are not included in image URL query parameters.

### Why validate on both client and server?

The client gives immediate friendly feedback. The server is the trust boundary because clients can be modified or bypassed. Database constraints add a final integrity layer. The rules are small enough to duplicate explicitly; a shared package could reduce drift in a larger codebase.

### Explain `async`, `await`, and `Promise.all` in this app.

An async operation returns a Promise. `await` pauses that async function until it settles while Node can process other work. It does not make network/database work instantaneous. `Promise.all` starts independent list and summary requests concurrently and rejects if one fails. A PostgreSQL transaction uses one reserved connection because BEGIN and COMMIT must apply to the same session.

### Explain `useState`, `useEffect`, `useRef`, and `useCallback`.

`useState` holds values that affect the screen and triggers rerenders. `useEffect` runs side effects such as initial fetches and subscriptions, with cleanup. `useRef` keeps a mutable value across renders without rerendering, here for mounted status. `useCallback` keeps a function reference stable until its dependencies change, helping avoid unnecessary effect resubscription. State is local to component instances.

### Why not store summary totals in separate columns?

They can be calculated from loan rows with one aggregate query. Stored totals would introduce another value to keep consistent on every write. For this assignment the query is straightforward; a very large system might use carefully maintained aggregates after measuring performance.

### What would you improve for production?

Real SMS, HTTPS, shared abuse controls, refresh/revocation strategy, private object storage, full image decoding/scanning, versioned migrations, pagination, monitored logs, backups, and deployed device testing. Do not describe these as already implemented. Choose improvements based on actual requirements rather than adding infrastructure just for appearance.

### What did you deliberately leave out?

Partial repayments, loan edits/deletion, interest, reminders, multi-currency conversion, contact access, and real payments. The assignment asks for a small tracker. A “mark repaid” action records a fact; it does not transfer money.

## Practical exercises

Do these in a separate Git branch after saving the working submission:

1. **Money:** predict the output for `"0.01"`, `"12.3"`, `"1.001"`, and `"1e3"`; run the unit tests and explain why each passes/fails.
2. **Dates:** change the business timezone to UTC and test a time close to midnight in India. Explain why due-today remains non-overdue.
3. **SQL:** write a SELECT for just one user's unpaid loans. Then explain what breaks if you remove the owner condition.
4. **UI state:** add a small count beside each filter, using derived data without extra API calls.
5. **API:** add a validated optional note of at most 200 characters. Identify schema migration, request validation, response type, form, and display changes before coding.
6. **Debugging:** deliberately use the wrong API port. Read the message, check `/health`, and fix the configuration without guessing.
7. **Ownership:** use the integration test to demonstrate that a second account cannot repay the first account's entry.
8. **Concurrency:** explain how two verify requests interact with `FOR UPDATE`, and how two repay requests interact with `COALESCE`.

## Final self-check

You are ready when you can start from a clean terminal, explain all three main request flows, reproduce the totals with a calculator, locate the relevant code for a question, make a small change yourself, and state the project's limitations accurately. No document can guarantee an internship or replace this practice.
