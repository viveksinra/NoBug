import { test, expect, type Page } from '@playwright/test';
import {
  createTestUser,
  loginAs,
  createCompanyAndProject,
  generateApiKey,
} from './helpers';

// ---------------------------------------------------------------------------
// Shared state across serial tests
// ---------------------------------------------------------------------------
let userEmail: string;
let userPassword: string;
let userName: string;
let companySlug: string;
let companyName: string;
let projectName: string;
let projectKey: string;

// =========================================================================
// 1. Registration and Login Flow
// =========================================================================
test.describe.serial('ST-001: Registration and Login', () => {
  test('register a new user', async ({ page }) => {
    const creds = await createTestUser(page);
    userEmail = creds.email;
    userPassword = creds.password;
    userName = creds.name;

    // Should no longer be on the register page
    expect(page.url()).not.toContain('/register');
  });

  test('log out and log back in', async ({ page }) => {
    // Login with the credentials we just created
    await loginAs(page, userEmail, userPassword);
    expect(page.url()).not.toContain('/login');
  });

  test('reject invalid credentials', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel('Email').fill(userEmail);
    await page.getByLabel('Password').fill('WrongPassword999!');
    await page.getByRole('button', { name: /log in|sign in/i }).click();

    // Should show an error and NOT redirect
    await expect(
      page.getByText(/invalid|incorrect|wrong|failed/i),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// =========================================================================
// 2. Company Creation and Project Setup
// =========================================================================
test.describe.serial('ST-002: Company and Project Setup', () => {
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAs(page, userEmail, userPassword);
    await page.close();
  });

  test('create a company and project', async ({ page }) => {
    await loginAs(page, userEmail, userPassword);

    const result = await createCompanyAndProject(page);
    companySlug = result.companySlug;
    companyName = result.companyName;
    projectName = result.projectName;
    projectKey = result.projectKey;

    // Verify project page loads
    await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
  });

  test('company appears in the sidebar switcher', async ({ page }) => {
    await loginAs(page, userEmail, userPassword);
    await page.goto(`/${companySlug}/dashboard`);

    // Company name should be visible somewhere in the sidebar / header
    await expect(page.getByText(companyName)).toBeVisible({ timeout: 10_000 });
  });
});

// =========================================================================
// 3. Team Invitation
// =========================================================================
test.describe.serial('ST-003: Team Invitation', () => {
  test('send an invitation', async ({ page }) => {
    await loginAs(page, userEmail, userPassword);
    await page.goto(`/${companySlug}/settings/members`);

    await page
      .getByRole('button', { name: /invite|add member/i })
      .click();
    await page.getByLabel(/email/i).fill('invited-member@test.bugdetector.dev');

    // Select a role if dropdown is present
    const roleSelect = page.getByLabel(/role/i);
    if (await roleSelect.isVisible()) {
      await roleSelect.selectOption({ label: 'DEVELOPER' });
    }

    await page.getByRole('button', { name: /send|invite/i }).click();

    // Invitation should appear in the list
    await expect(
      page.getByText('invited-member@test.bugdetector.dev'),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// =========================================================================
// 4. Issue Creation
// =========================================================================
test.describe.serial('ST-004: Issue Creation', () => {
  test('create an issue with title, description, and priority', async ({
    page,
  }) => {
    await loginAs(page, userEmail, userPassword);
    await page.goto(`/${companySlug}/projects/${projectKey}/issues/new`);

    await page.getByLabel(/title/i).fill('Smoke test bug');
    // Description might be a textarea or rich editor
    const descField = page.getByLabel(/description/i).or(
      page.locator('[contenteditable="true"]').first(),
    );
    await descField.fill('Created by the smoke test suite');

    // Set priority if selector exists
    const prioritySelect = page.getByLabel(/priority/i);
    if (await prioritySelect.isVisible()) {
      await prioritySelect.selectOption({ label: 'HIGH' });
    }

    await page.getByRole('button', { name: /create|submit/i }).click();

    // Should redirect to issue detail or list
    await expect(page.getByText('Smoke test bug')).toBeVisible({
      timeout: 15_000,
    });
  });
});

// =========================================================================
// 5. Issue Board View and Status Changes
// =========================================================================
test.describe.serial('ST-005: Board View and Status Changes', () => {
  test('board view shows the created issue', async ({ page }) => {
    await loginAs(page, userEmail, userPassword);
    await page.goto(`/${companySlug}/projects/${projectKey}/board`);

    await expect(page.getByText('Smoke test bug')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('change issue status from the board', async ({ page }) => {
    await loginAs(page, userEmail, userPassword);
    await page.goto(`/${companySlug}/projects/${projectKey}/board`);

    // Click into the issue
    await page.getByText('Smoke test bug').click();

    // Find a status dropdown or button and change it
    const statusTrigger = page.getByLabel(/status/i).or(
      page.getByRole('button', { name: /open|to do|backlog/i }),
    );
    if (await statusTrigger.isVisible()) {
      await statusTrigger.click();
      await page.getByText(/in progress/i).click();

      await expect(page.getByText(/in progress/i)).toBeVisible({
        timeout: 10_000,
      });
    }
  });
});

// =========================================================================
// 6. Extension: Install, Authenticate, Consent Dialog
// =========================================================================
test.describe('ST-006: Extension Auth and Consent', () => {
  test.skip(true, 'TODO: Requires browser extension loading via chromium args. Steps: load unpacked extension, open popup, verify login prompt, authenticate via web app session, verify consent dialog appears before first recording.');
});

// =========================================================================
// 7. Extension: Quick Capture Flow
// =========================================================================
test.describe('ST-007: Quick Capture Flow', () => {
  test.skip(true, 'TODO: Load extension, click Quick Capture, fill optional note, submit. Verify shareable link is returned. Open shareable link in incognito — verify viewer loads with recording tab, console panel, network panel.');
});

// =========================================================================
// 8. Extension: Full Platform Capture
// =========================================================================
test.describe('ST-008: Full Platform Capture', () => {
  test.skip(true, 'TODO: Load extension, select project, fill title/priority, click Capture Bug. Verify issue is created in the web app with recording attachment. Navigate to issue detail and confirm recording, console, network data present.');
});

// =========================================================================
// 9. Bug Viewer: Replay, Console Panel, Network Panel
// =========================================================================
test.describe('ST-009: Bug Viewer', () => {
  test.skip(true, 'TODO: Navigate to an issue with a recording. Verify rrweb player loads and plays. Switch to Console tab — verify log entries render with level icons. Switch to Network tab — verify requests render with method, URL, status, duration. Verify timeline markers are clickable and sync playback position.');
});

// =========================================================================
// 10. Public Shareable Link
// =========================================================================
test.describe('ST-010: Public Shareable Link', () => {
  test.skip(true, 'TODO: Create a QuickCapture. Copy shareable link. Open in incognito/private window (no session). Verify viewer page loads without authentication. Verify recording, console, network, environment, and screenshot tabs all render. Set a password — verify unauthenticated access shows password prompt.');
});

// =========================================================================
// 11. Promote Quick Capture to Issue
// =========================================================================
test.describe('ST-011: Promote Quick Capture to Issue', () => {
  test.skip(true, 'TODO: Create a QuickCapture (via API or extension). Navigate to captures list. Click Promote to Issue. Select project, set priority, assignee. Confirm. Verify new issue exists with recording data from the QuickCapture. Verify original QuickCapture is marked as promoted.');
});

// =========================================================================
// 12. Dev Testing: Attach Recording, Mark Ready for QA
// =========================================================================
test.describe('ST-012: Dev Testing Flow', () => {
  test.skip(true, 'TODO: Open an issue assigned to dev. Attach a recording via the issue detail page. Mark issue status as READY_FOR_QA. Verify status change is reflected in the issue detail and board view. Verify activity log records the status transition.');
});

// =========================================================================
// 13. QA Testing: Pass/Fail Verdict, Close/Reopen
// =========================================================================
test.describe('ST-013: QA Testing Flow', () => {
  test.skip(true, 'TODO: Open a READY_FOR_QA issue. Submit a QA verdict (PASS). Verify issue status changes to CLOSED. Reopen the issue. Verify status reverts to OPEN/REOPENED. Submit a FAIL verdict on another issue. Verify issue status changes to IN_PROGRESS or REOPENED.');
});

// =========================================================================
// 14. MCP Server: search_bugs and get_bug
// =========================================================================
test.describe('ST-014: MCP Server', () => {
  test.skip(true, 'TODO: Generate an API key. Use fetch to call GET /api/v1/bugs with Bearer auth — verify response contains issue list. Call GET /api/v1/bugs/:id — verify response contains full issue detail with comments, recordings, labels. Call GET /api/v1/bugs/search?q=smoke — verify search returns matching issues.');
});

// =========================================================================
// 15. Regression: Create Suite, Add Test Cases, Run, Submit Results
// =========================================================================
test.describe('ST-015: Regression Testing', () => {
  test.skip(true, 'TODO: Navigate to project regression page. Create a regression suite. Add 3 test cases to the suite. Start a new regression run. Submit PASS for 2 cases and FAIL for 1. Complete the run. Verify summary shows 66% pass rate. Verify failed test case is linked to a new issue.');
});
