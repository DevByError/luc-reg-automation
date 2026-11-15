# LUC Registration Portal

A unified staff workspace for new student registration at Lincoln University College.

![Status](https://img.shields.io/badge/status-live%20in%20production-2ea043)
![In use at](https://img.shields.io/badge/in%20use%20at-Lincoln%20University%20College-0F766E)
![Platform](https://img.shields.io/badge/platform-Windows-0078D6)
![React](https://img.shields.io/badge/React%2018-TypeScript-3178C6)
![Playwright](https://img.shields.io/badge/automation-Playwright-45ba4b)

---

## Overview

The Registration Portal brings the entire student registration workflow into a single screen. Registration staff enter a student's passport number once, and the portal guides them through every stage of the process, collecting documents, filling in records and checking the results along the way.

The system is **live and currently used by Lincoln University College** for student registration.

## Impact

| Measure | Before | With the portal |
| --- | --- | --- |
| Time to register one student | About 15 minutes | About 3 minutes |
| Screens staff work across | 7 or more separate browser tabs | One screen |
| Data entry | The same details re-typed on every page | Entered once |
| Document handling | Downloaded and renamed by hand | Saved and organised automatically |

By removing repetitive navigation and re-typing, the portal makes registration faster, more consistent and easier for staff, including new team members.

---

## Features

- **Single point of entry.** One passport number starts the whole registration.
- **Guided, step-by-step workflow.** Each stage of registration is presented in order, and stages that do not depend on each other run in parallel.
- **Staff remain in control.** Every record-changing action is confirmed by a staff member. The portal handles the routine steps in between.
- **Built-in verification.** Before any record is saved, the portal checks that the entered values match what was intended and stops if anything differs. No action is ever submitted twice.
- **Review mode.** Staff can preview each save before it happens and approve or cancel it.
- **Document management.** All documents gathered during registration are displayed side by side and stored in a dedicated folder for each student, ready to print.
- **Robust error handling.** Unusual cases, such as missing documents, duplicate records, incomplete applicant details or session timeouts, are detected and explained in plain language, with a clear way to continue.
- **Training mode.** A built-in sample mode with fictitious data lets staff practise safely without affecting live records.
- **Private by design.** The application runs locally on the staff computer, uses the staff member's own login, and never stores credentials.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Front end | React 18, TypeScript, Tailwind CSS |
| Build and dev server | Vite 5 |
| Workflow automation | Playwright with Microsoft Edge |
| Runtime | Node.js (LTS) |
| Testing | Unit tests and browser-based practice tests |

---

## Project Structure

```
portal/
├── server/          Automation services and workflow steps
├── shared/          Shared definitions between interface and server
├── src/
│   ├── components/  User interface
│   ├── state/       Workflow logic and safety rules
│   ├── site/        Live and sample data connections
│   └── mock/        Sample environment for training
├── public/          Static assets and sample documents
├── scripts/         Test runners
└── tests/           Automated tests
```

---

## Getting Started

### Requirements

- Windows 10 or 11 with Microsoft Edge
- Node.js LTS
- An authorised staff account

### Installation for staff

1. Install Node.js LTS (one time only).
2. Copy the `portal` folder to the computer.
3. Run `start-portal.bat`. The first launch installs the required packages and then opens the portal in the browser.
4. Keep the launcher window open while using the portal, and close it to stop.

### Installation for developers

```bash
git clone https://github.com/DevByError/luc-reg-automation.git
cd luc-reg-automation/portal
npm install
npm run dev
```

---

## Configuration

No secrets or environment files are required. Staff sign in with their own accounts, and the portal never handles passwords.

General preferences, including the student document location, live or sample mode, and review mode, are managed from the in-app **Settings** panel.

---

## Usage

1. Start the portal.
2. Sign in to your staff account when prompted.
3. Enter the student's passport number and select **Start**.
4. Follow the steps on screen. Each step reports its progress and asks only for decisions that require a staff member.
5. Print the collected documents directly from the portal.

To practise without affecting live records, switch to **Sample** mode in Settings.

---

## Development

Run these commands from the `portal` directory:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run check` | Run type checks |
| `npm run build` | Type-check and create a production build |
| `node scripts/run-tests.mjs` | Run unit tests |

---

## Data Protection

This repository contains source code only. Student documents, logs and screenshots contain personal information and are excluded from version control through `.gitignore`. Never commit student data.

---

## License

Developed for Lincoln University College. All rights reserved.
