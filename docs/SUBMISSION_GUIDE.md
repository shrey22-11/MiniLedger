# Submission guide

The assignment requests **two links**: your GitHub repository and a 2–3 minute recording. Public hosting and a face-camera recording are not requested. Use [the exact demo script](DEMO_SCRIPT.md).

## Before publishing

- Keep your local `.env` files for running the app. Publish the `.env.example` files instead.
- `.gitignore` excludes environment files, dependencies, `.local` database files, uploaded receipts, Expo caches, and compiled output.
- Include source code, `package-lock.json`, Docker Compose, the GitHub Actions workflow, README, and docs.
- Run these checks from the project root in a separate VS Code terminal:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build:api
npm.cmd run format:check
```

The README explains database integration tests, which require a separate database whose name ends in `_test`.

## First push from VS Code

These commands assume the folder is not already a Git repository. If already initialized or connected to a remote, inspect `git status` and `git remote -v` and reuse that setup.

1. Create an empty GitHub repository named `MiniLedger`. Do not initialize the remote with a README, license, or gitignore, because this project already has its own files. Choose public if the reviewer needs a freely accessible link, or give the reviewer access to a private repository.
2. Run from your project root:

```powershell
git init -b main
git add .
git status --short
git diff --cached --stat
```

3. Inspect the staged list. It must not contain `backend/.env`, `mobile/.env`, `.local`, `node_modules`, or actual receipt files in `backend/uploads` (only `.gitkeep` belongs there). Confirm exclusion:

```powershell
git check-ignore backend/.env mobile/.env .local node_modules
```

4. If correct, commit and push. Replace `YOUR_USERNAME` with your GitHub username, or use the repository URL GitHub provides:

```powershell
git commit -m "Build MiniLedger with login, loans, receipts, and tests"
git remote add origin https://github.com/YOUR_USERNAME/MiniLedger.git
git push -u origin main
```

If Git asks for your author identity, set your own name and email for this repository with `git config user.name "Your Name"` and `git config user.email "Your GitHub email"`, then retry the commit. Complete GitHub's sign-in flow if prompted.

5. Open your GitHub repository. Confirm the README renders and the Actions check passes. A local test pass does not mean GitHub CI has already passed.
6. Clone into a separate folder and follow the README to check reviewer setup. Do not overwrite your working copy or its configuration. Stop duplicate servers before running the clone on the same ports.

## Upload the video

Upload the finished recording to Loom or Google Drive. Give the reviewer viewing access and test the shared link in a signed-out/private browser. Check playback and audio. Your servers do not need to stay running for someone to watch an uploaded recording.

## Submission message

Replace both placeholders before sending:

> Hi,
>
> Here is my MiniLedger assignment submission.
>
> GitHub repository: [paste your repository link]
>
> App demo (2–3 minutes): [paste your Loom or Google Drive link]
>
> The project includes phone login with a mock OTP, loan creation and repayment, summary totals, overdue highlighting, receipt uploads, input validation, and automated tests. Setup instructions are in the README.
>
> Thank you for reviewing my submission.

## Interview preparation

Read [CODE_WALKTHROUGH.md](CODE_WALKTHROUGH.md) alongside VS Code, then answer [INTERVIEW_PREP.md](INTERVIEW_PREP.md) without looking at the notes. Trace one request from the phone to PostgreSQL and back. Understand the choices you explain and be honest about AI assistance if asked.
