# Verification notes

Verified on this Windows development machine with Node.js 24 and PostgreSQL 17.

| Check                          | Result                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Backend TypeScript             | Passed                                                                                                                    |
| React Native TypeScript        | Passed                                                                                                                    |
| Backend production compilation | Passed                                                                                                                    |
| Pure rule tests                | 8 passed                                                                                                                  |
| Real PostgreSQL API scenarios  | 12 passed (13 test-runner results including parent)                                                                       |
| Web export                     | Passed                                                                                                                    |
| Android and iOS exports        | Passed; Hermes bundles generated (not device installs)                                                                    |
| Browser flow                   | Mock OTP request/login, empty ledger, add past/future loans, summary update, repayment confirmation, repaid filter passed |

The browser flow used fictitious names and a fictitious phone number. It exercised the same React Native screens through React Native Web and the real API/database. It is **not** a substitute for testing Expo Go on the phone/emulator used for the submission recording.

On October 25, 2026, the user confirmed on their Android phone that loan creation, receipt upload, and opening saved receipts work. The backend was reachable over the phone's hotspot. This is user-reported physical-device verification, separate from the automated and browser checks above.

Native uploads use Expo's File and fetch APIs. The viewer fetches the protected image with authentication and displays a temporary local cache file, which is cleaned up when closed. Saving an entry refreshes the ledger automatically. Routine uploads and receipt viewing do not require reloading the app; development reloads were needed to pick up code changes.

## Dependency audit

The backend runtime audit (`npm audit --workspace backend --omit=dev`) reported **zero advisories** at implementation time. The full workspace audit reported **five high-severity findings** in the Expo development-tool dependency chain, involving `node-forge` and Expo CLI's Zod 3 dependency. These are upstream toolchain dependencies; the backend's Zod 4 dependency is separate. The available audit suggestion would downgrade Expo across major versions, so it was not applied blindly. Re-check upstream compatible fixes before upgrading the SDK. Audit results can change as advisories and packages change.

## Still requires the submitter

- Rehearse the complete recording flow on the target phone with a fresh demo account.
- Record a real 2–3 minute demonstration and upload it to Loom/Google Drive.
- Push to your GitHub account, check the clean-clone instructions, and submit both links.

No APK, Loom/Drive video link, GitHub publication, or clean-clone verification is claimed by these notes. Native export success does not claim an iOS device test.
