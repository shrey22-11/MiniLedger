# MiniLedger: exact screen-by-screen demo

Target: **2 minutes 45 seconds**, maximum 3 minutes. Read only the **Say** paragraphs aloud. **Show / do** tells you which screen to open. Times are rehearsal targets.

Your face is **not required by the assignment**. Record your Android screen with microphone audio. Public deployment is not requested: keep your laptop backend and Expo running while recording the phone.

## Before recording

1. Keep the backend and Expo running in two separate VS Code terminals. Open MiniLedger in Expo Go.
2. Rehearse saving and opening a receipt on your existing test account, then sign out.
3. For the actual take, use a different demo phone number that you have never used in this app, with country code, so its ledger starts empty. No SMS is sent. Keep the laptop backend terminal beside you to read the OTP. You do not need to switch the video to the laptop.
4. Have a sample JPEG/PNG receipt under 5 MB ready in the gallery, without personal information. Grant photo access during rehearsal if prompted.
5. Enable microphone audio in the phone screen recorder and silence notifications.
6. Use these entries; type amounts without commas or the rupee symbol.

| Friend | Amount    | Due date      | Receipt      |
| ------ | --------- | ------------- | ------------ |
| Aditi  | `1500.50` | Yesterday     | None         |
| Rahul  | `500`     | A future date | Sample photo |

**If recording on October 25, 2026:** use `2026-10-24` for Aditi and `2026-11-01` for Rahul. If recording later, adjust the dates so Aditi is overdue and Rahul is future-due. Use `YYYY-MM-DD`.

## 0:00–0:15 — Phone login screen

**Show / do:** Start on “Good friends. Clear accounts.” Enter the fresh demo phone number and tap **Continue →** while speaking.

**Say:**

“Hi, this is MiniLedger, an app for tracking money lent to friends. I built the mobile app with React Native and TypeScript, and the backend with Node.js and PostgreSQL.”

## 0:15–0:35 — Verification code screen

**Show / do:** On “One small check.”, read the latest six-digit OTP from your laptop backend terminal. Enter it under **Verification code**, then tap **Open my ledger →**.

**Say:**

“Login uses a phone number and a mock OTP. The code is printed in the backend terminal instead of being sent by SMS. It expires after five minutes.”

## 0:35–1:05 — New entry form, then ledger

**Show / do:** Briefly show the empty ledger. Tap **+ New entry**. Enter **Aditi**, **1500.50**, and yesterday's date. Tap **Save entry →**, then show Aditi's overdue badge.

**Say:**

“This is a new account with an empty ledger. I'll add a loan to Aditi for one thousand five hundred rupees and fifty paise, due yesterday. Past dates let me record existing loans. After saving, the app highlights this entry as overdue.”

## 1:05–1:40 — Second entry with photo, then summary

**Show / do:** Tap **+ New entry**. Enter **Rahul**, **500**, and the future date. Tap **+ Add photo**, choose the sample image, and tap **Save entry →**. Show the top summary card; scroll upward if necessary.

**Say:**

“Next, I'll add five hundred rupees lent to Rahul, with a future due date, and attach a receipt photo. The summary updates automatically. Total lent is now two thousand rupees and fifty paise, nothing is repaid, and Aditi's amount is overdue.”

## 1:40–1:55 — Receipt viewer

**Show / do:** On the **All** filter, find Rahul and tap **Receipt ↗**. Let the photo appear, then tap **Close receipt**. Do not reload the app.

**Say:**

“The saved receipt opens here without reloading the app. The backend checks that the signed-in account owns the loan before returning its image.”

## 1:55–2:20 — Overdue filter and repayment confirmation

**Show / do:** Tap **Overdue**. On Aditi's entry tap **Mark repaid ✓**. In “All settled?”, tap **Yes, mark repaid**. The overdue list becomes empty. Show the summary at the top.

**Say:**

“The overdue filter shows loans that need attention. When Aditi pays me back, I confirm repayment. Total lent stays the same, repaid becomes one thousand five hundred rupees and fifty paise, outstanding becomes five hundred, and overdue becomes zero.”

## 2:20–2:45 — Repaid filter, then All and summary

**Show / do:** Tap **Repaid** to show Aditi's settled entry. Then tap **All** to show both entries. End with the summary visible.

**Say:**

“The repaid filter keeps settled entries visible. Records are stored in PostgreSQL, and each account has its own ledger. I also added input validation and automated tests for money calculations, authentication, ownership, receipts, and repayment. The README explains how to run the project. Thank you.”

Stop recording. You do not need to open source files or restart servers in this short demo. The code walkthrough is for interview preparation.

## Expected totals

| Point                | Total lent | Repaid    | Outstanding | Overdue   |
| -------------------- | ---------- | --------- | ----------- | --------- |
| Fresh account        | ₹0         | ₹0        | ₹0          | ₹0        |
| After Aditi          | ₹1,500.50  | ₹0        | ₹1,500.50   | ₹1,500.50 |
| After Rahul          | ₹2,000.50  | ₹0        | ₹2,000.50   | ₹1,500.50 |
| After repaying Aditi | ₹2,000.50  | ₹1,500.50 | ₹500        | ₹0        |

If numbers differ, check whether the account already had entries and whether the dates are correct. Use a fresh account for a retake; the app has no delete button. Do not say a step succeeded until the app shows it.

Pause speaking while completing actions if typing takes longer. Rehearse once and keep the final video between 2 and 3 minutes. Read naturally rather than rushing to match individual timestamps.

## Review and submit

Watch the recording fully. Check voice volume, readable text, the visible receipt, and final totals. Upload to Loom or Google Drive, enable reviewer viewing access, and test the link signed out. Follow [the submission guide](SUBMISSION_GUIDE.md) for GitHub steps and a submission message.
