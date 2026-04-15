# BugDetector V1 Smoke Test Suite

Manual smoke test checklist covering all 15 critical paths of the platform.

Run automated tests (where implemented) with:

```bash
pnpm --filter @nobug/web test:e2e
```

---

## ST-001: Registration and Login Flow

**Prerequisites:** Clean database or unique email. App running at localhost:3000.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/auth/register` | Registration form loads with Name, Email, Password fields |
| 2 | Fill in a unique name, email, and password (min 8 chars, mixed case + symbol) | Fields accept input; no validation errors |
| 3 | Click "Register" / "Sign Up" | Account is created; user is redirected to onboarding or dashboard |
| 4 | Log out (user menu -> Sign Out) | Session ends; redirected to `/auth/login` |
| 5 | Log back in with the same credentials | Login succeeds; redirected to dashboard |
| 6 | Attempt login with wrong password | Error message displayed; no redirect |

---

## ST-002: Company Creation and Project Setup

**Prerequisites:** Logged-in user (ST-001 completed).

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/onboarding` or click "Create Company" | Company creation form appears |
| 2 | Enter company name and slug | Slug auto-generates or accepts custom value |
| 3 | Submit the form | Company created; user becomes OWNER; redirected to company dashboard |
| 4 | Navigate to "New Project" | Project creation form appears |
| 5 | Enter project name and key (e.g., "BUG") | Key is validated as uppercase alphanumeric |
| 6 | Submit the form | Project created; appears in sidebar project list |

---

## ST-003: Team Invitation (Send, Accept, Verify Member)

**Prerequisites:** Company exists (ST-002 completed). Second user email available.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/{companySlug}/settings/members` | Members list page loads; current user shown as OWNER |
| 2 | Click "Invite" / "Add Member" | Invitation dialog opens |
| 3 | Enter invitee email and select role (MEMBER or ADMIN) | Fields accept input |
| 4 | Click "Send Invite" | Invitation created; appears in pending invitations list with PENDING status |
| 5 | (As invitee) Register or log in, then visit the invitation accept link | Invitation accept page loads |
| 6 | Accept the invitation | Invitee becomes a member of the company with selected role |
| 7 | Verify invitee appears in the members list | New member shown with correct role |

---

## ST-004: Issue Creation (Title, Description, Priority, Assignee)

**Prerequisites:** Company with project exists (ST-002 completed).

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/{companySlug}/projects/{projectKey}/issues/new` | Issue creation form loads |
| 2 | Enter title: "Smoke test bug" | Title field accepts input |
| 3 | Enter description in editor | Rich text or plain text accepted |
| 4 | Select priority: HIGH | Priority dropdown shows options; HIGH selected |
| 5 | Select assignee (current user or agent) | Assignee dropdown lists members and agents |
| 6 | Click "Create" | Issue created with auto-generated number (e.g., BUG-1); redirected to issue detail |
| 7 | Verify issue detail shows correct title, description, priority, assignee | All fields match input values |

---

## ST-005: Issue Board View and Status Changes

**Prerequisites:** At least one issue exists (ST-004 completed).

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to `/{companySlug}/projects/{projectKey}/board` | Kanban board renders with status columns (Backlog, Open, In Progress, etc.) |
| 2 | Locate "Smoke test bug" card | Card visible in the initial status column (Open or Backlog) |
| 3 | Click on the issue card | Issue detail or inline edit opens |
| 4 | Change status to "In Progress" | Status updates; card moves to In Progress column |
| 5 | Verify column counts update | Source column count decreases by 1; target column count increases by 1 |
| 6 | Navigate to issue list view | Issue shows updated "In Progress" status |

---

## ST-006: Extension -- Install, Authenticate, Consent Dialog

**Prerequisites:** Extension built (`pnpm --filter @nobug/extension build`). Chrome or Chromium available.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load unpacked extension from `apps/extension/.output/chrome-mv3` | Extension icon appears in browser toolbar |
| 2 | Click extension icon | Popup opens showing "Not Logged In" state with login prompt |
| 3 | Click "Log in" and authenticate in the web app | Popup refreshes to show authenticated state with company name |
| 4 | First time after auth: consent dialog appears | GDPR consent dialog with data collection categories |
| 5 | Accept consent | Consent recorded in `chrome.storage.local`; popup shows capture controls |
| 6 | Decline consent | Recording controls remain disabled; user informed recording requires consent |

---

## ST-007: Extension -- Quick Capture Flow (Capture -> Share Link)

**Prerequisites:** Extension installed and authenticated (ST-006 completed). Consent given.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to any web page | Page loads normally |
| 2 | Click extension icon, then "Quick Capture" | Popup transitions to capture mode; badge shows recording indicator |
| 3 | Interact with the page (scroll, click, type) for 5-10 seconds | rrweb recording runs; console and network capture active |
| 4 | Click "Stop & Submit" in the popup | Capture form appears with optional note field |
| 5 | Add a note and submit | Upload starts; progress shown |
| 6 | Upload completes | Shareable link displayed with "Copy" button |
| 7 | Open the shareable link in an incognito window | Public viewer loads without login; shows recording, console, network, environment tabs |

---

## ST-008: Extension -- Full Platform Capture (Create Issue from Extension)

**Prerequisites:** Extension installed with company and project selected (ST-006 completed).

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click extension icon, then "Capture Bug" | Full capture form opens with project dropdown, title, priority, assignee |
| 2 | Select project, enter title "Ext-created bug", set priority HIGH | Fields populate correctly; projects and assignees loaded from API |
| 3 | Click "Capture & Create" | Recording captured; data uploaded; issue created via `/api/extension/create-issue` |
| 4 | Success message shows with issue link | Link to the new issue in the web app |
| 5 | Open the issue link in the web app | Issue detail page shows title, priority, and attached recording |
| 6 | Verify recording plays in the bug viewer | rrweb replay loads; console and network data present |

---

## ST-009: Bug Viewer -- Replay, Console Panel, Network Panel

**Prerequisites:** Issue with recording attachment exists (ST-008 or manual upload completed).

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to an issue with a recording | Issue detail page loads |
| 2 | Click "View Recording" or recording thumbnail | Bug viewer opens with rrweb replay player |
| 3 | Click play | Recording replays DOM interactions; progress bar advances |
| 4 | Switch to Console tab | Console log entries render with level icons (info, warn, error) |
| 5 | Filter console to "error" only | Only error-level entries shown |
| 6 | Switch to Network tab | Network requests render with method, URL, status code, duration |
| 7 | Click a network entry | Expanded detail shows headers and timing breakdown |
| 8 | Click a timeline marker (red = error) | Playback seeks to the marker timestamp; console/network panels scroll to match |

---

## ST-010: Public Shareable Link -- Accessible Without Login

**Prerequisites:** QuickCapture exists with a shareable link (ST-007 completed).

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Copy the shareable link from the QuickCapture | Link copied to clipboard |
| 2 | Open in incognito or private browsing (no session) | Public viewer page loads without login |
| 3 | Verify Recording tab | rrweb player loads and plays the recording |
| 4 | Verify Console tab | Console entries render |
| 5 | Verify Network tab | Network requests render |
| 6 | Verify Environment tab | Browser, OS, viewport, URL shown |
| 7 | Verify Screenshot tab | Screenshots display (if captured) |
| 8 | Navigate to Share Settings, set a password | Password saved |
| 9 | Open link in fresh incognito window | Password prompt appears before viewer loads |
| 10 | Enter correct password | Viewer loads normally |

---

## ST-011: Promote Quick Capture to Issue

**Prerequisites:** QuickCapture exists (ST-007 completed). User has a company and project.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to captures list (`/{companySlug}/captures`) | List of QuickCaptures displayed |
| 2 | Click on a QuickCapture | Detail/viewer opens |
| 3 | Click "Promote to Issue" | Promotion dialog opens with project, priority, assignee fields |
| 4 | Select project, set priority, optionally assign | Fields accept input |
| 5 | Confirm promotion | New issue created; recording data transferred from QuickCapture |
| 6 | Verify new issue exists in the project issues list | Issue appears with correct title and recording |
| 7 | Verify original QuickCapture is marked as promoted | Capture shows "Promoted" badge or status |

---

## ST-012: Dev Testing -- Attach Recording, Mark Ready for QA

**Prerequisites:** Issue exists and is assigned to a developer (ST-004 completed).

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open an issue in IN_PROGRESS status | Issue detail page loads |
| 2 | Attach a recording (via extension or upload) | Recording appears in the issue's recordings section |
| 3 | Change status to READY_FOR_QA | Status dropdown/button updates |
| 4 | Verify board view reflects new status | Issue card is in the READY_FOR_QA column |
| 5 | Verify activity log | Entry showing "Status changed from IN_PROGRESS to READY_FOR_QA" |

---

## ST-013: QA Testing -- Pass/Fail Verdict, Close/Reopen

**Prerequisites:** Issue in READY_FOR_QA status (ST-012 completed).

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open the READY_FOR_QA issue | Issue detail loads with QA action controls |
| 2 | Submit verdict: PASS | Issue status transitions to CLOSED |
| 3 | Verify issue is in CLOSED column on board | Card moved to CLOSED column |
| 4 | Reopen the issue | Status reverts to OPEN or REOPENED |
| 5 | Submit verdict: FAIL on a different READY_FOR_QA issue | Issue status transitions to IN_PROGRESS or REOPENED |
| 6 | Verify activity log records all transitions | PASS, CLOSE, REOPEN, FAIL events logged |

---

## ST-014: MCP Server -- search_bugs and get_bug Return Data

**Prerequisites:** API key generated (via Settings > API Keys). At least one issue exists.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate an API key from company settings | Key displayed once; copy it |
| 2 | `GET /api/v1/bugs` with `Authorization: Bearer {key}` | 200 response with paginated issue list (items array, total count) |
| 3 | `GET /api/v1/bugs/{issueId}` | 200 response with full issue detail (title, description, priority, status, comments, recordings, labels) |
| 4 | `GET /api/v1/bugs/search?q=smoke` | 200 response with issues matching "smoke" in title or description |
| 5 | `POST /api/v1/bugs` with title/description/priority in body | 201 response; new issue created |
| 6 | `PATCH /api/v1/bugs/{issueId}` with status update | 200 response; issue status updated |

---

## ST-015: Regression -- Create Suite, Add Test Cases, Run, Submit Results

**Prerequisites:** Project exists (ST-002 completed). User has manage_projects permission.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to project regression page | Regression suites list (possibly empty) |
| 2 | Click "Create Suite" | Suite creation form appears |
| 3 | Enter suite name and description; submit | Suite created; appears in list |
| 4 | Open the suite; click "Add Test Case" | Test case form appears |
| 5 | Add 3 test cases with titles and steps | Test cases appear in suite detail |
| 6 | Click "Start Run" | New regression run created in PENDING status |
| 7 | Submit results: PASS for case 1, PASS for case 2, FAIL for case 3 | Results recorded; run progress updates |
| 8 | Complete the run | Run status changes to COMPLETED |
| 9 | View run summary | Shows 2/3 passed (66% pass rate) |
| 10 | Verify failed test case can be linked to a new issue | Link created between test case and issue |
