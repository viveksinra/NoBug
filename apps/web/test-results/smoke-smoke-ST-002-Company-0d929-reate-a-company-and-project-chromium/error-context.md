# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke\smoke.spec.ts >> ST-002: Company and Project Setup >> create a company and project
- Location: tests\smoke\smoke.spec.ts:63:7

# Error details

```
"beforeAll" hook timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - heading "Sign In" [level=1] [ref=e4]
    - generic [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]: Email
        - textbox "Email" [ref=e8]: smoke-yly5z3@test.bugdetector.dev
      - generic [ref=e9]:
        - generic [ref=e10]: Password
        - textbox "Password" [ref=e11]: Test1234!@#
      - paragraph [ref=e12]: Invalid credentials
      - button "Log In" [ref=e13]
    - paragraph [ref=e14]:
      - text: Don't have an account?
      - link "Sign up" [ref=e15] [cursor=pointer]:
        - /url: /auth/register
  - button "Open Next.js Dev Tools" [ref=e21] [cursor=pointer]:
    - img [ref=e22]
  - alert [ref=e25]
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | import {
  3   |   createTestUser,
  4   |   loginAs,
  5   |   createCompanyAndProject,
  6   |   generateApiKey,
  7   | } from './helpers';
  8   | 
  9   | // ---------------------------------------------------------------------------
  10  | // Shared state across serial tests
  11  | // ---------------------------------------------------------------------------
  12  | let userEmail: string;
  13  | let userPassword: string;
  14  | let userName: string;
  15  | let companySlug: string;
  16  | let companyName: string;
  17  | let projectName: string;
  18  | let projectKey: string;
  19  | 
  20  | // =========================================================================
  21  | // 1. Registration and Login Flow
  22  | // =========================================================================
  23  | test.describe.serial('ST-001: Registration and Login', () => {
  24  |   test('register a new user', async ({ page }) => {
  25  |     const creds = await createTestUser(page);
  26  |     userEmail = creds.email;
  27  |     userPassword = creds.password;
  28  |     userName = creds.name;
  29  | 
  30  |     // Should no longer be on the register page
  31  |     expect(page.url()).not.toContain('/register');
  32  |   });
  33  | 
  34  |   test('log out and log back in', async ({ page }) => {
  35  |     // Login with the credentials we just created
  36  |     await loginAs(page, userEmail, userPassword);
  37  |     expect(page.url()).not.toContain('/login');
  38  |   });
  39  | 
  40  |   test('reject invalid credentials', async ({ page }) => {
  41  |     await page.goto('/auth/login');
  42  |     await page.getByLabel('Email').fill(userEmail);
  43  |     await page.getByLabel('Password').fill('WrongPassword999!');
  44  |     await page.getByRole('button', { name: /log in|sign in/i }).click();
  45  | 
  46  |     // Should show an error and NOT redirect
  47  |     await expect(
  48  |       page.getByText(/invalid|incorrect|wrong|failed/i),
  49  |     ).toBeVisible({ timeout: 10_000 });
  50  |   });
  51  | });
  52  | 
  53  | // =========================================================================
  54  | // 2. Company Creation and Project Setup
  55  | // =========================================================================
  56  | test.describe.serial('ST-002: Company and Project Setup', () => {
> 57  |   test.beforeAll(async ({ browser }) => {
      |        ^ "beforeAll" hook timeout of 30000ms exceeded.
  58  |     const page = await browser.newPage();
  59  |     await loginAs(page, userEmail, userPassword);
  60  |     await page.close();
  61  |   });
  62  | 
  63  |   test('create a company and project', async ({ page }) => {
  64  |     await loginAs(page, userEmail, userPassword);
  65  | 
  66  |     const result = await createCompanyAndProject(page);
  67  |     companySlug = result.companySlug;
  68  |     companyName = result.companyName;
  69  |     projectName = result.projectName;
  70  |     projectKey = result.projectKey;
  71  | 
  72  |     // Verify project page loads
  73  |     await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 });
  74  |   });
  75  | 
  76  |   test('company appears in the sidebar switcher', async ({ page }) => {
  77  |     await loginAs(page, userEmail, userPassword);
  78  |     await page.goto(`/${companySlug}/dashboard`);
  79  | 
  80  |     // Company name should be visible somewhere in the sidebar / header
  81  |     await expect(page.getByText(companyName)).toBeVisible({ timeout: 10_000 });
  82  |   });
  83  | });
  84  | 
  85  | // =========================================================================
  86  | // 3. Team Invitation
  87  | // =========================================================================
  88  | test.describe.serial('ST-003: Team Invitation', () => {
  89  |   test('send an invitation', async ({ page }) => {
  90  |     await loginAs(page, userEmail, userPassword);
  91  |     await page.goto(`/${companySlug}/settings/members`);
  92  | 
  93  |     await page
  94  |       .getByRole('button', { name: /invite|add member/i })
  95  |       .click();
  96  |     await page.getByLabel(/email/i).fill('invited-member@test.bugdetector.dev');
  97  | 
  98  |     // Select a role if dropdown is present
  99  |     const roleSelect = page.getByLabel(/role/i);
  100 |     if (await roleSelect.isVisible()) {
  101 |       await roleSelect.selectOption({ label: 'DEVELOPER' });
  102 |     }
  103 | 
  104 |     await page.getByRole('button', { name: /send|invite/i }).click();
  105 | 
  106 |     // Invitation should appear in the list
  107 |     await expect(
  108 |       page.getByText('invited-member@test.bugdetector.dev'),
  109 |     ).toBeVisible({ timeout: 10_000 });
  110 |   });
  111 | });
  112 | 
  113 | // =========================================================================
  114 | // 4. Issue Creation
  115 | // =========================================================================
  116 | test.describe.serial('ST-004: Issue Creation', () => {
  117 |   test('create an issue with title, description, and priority', async ({
  118 |     page,
  119 |   }) => {
  120 |     await loginAs(page, userEmail, userPassword);
  121 |     await page.goto(`/${companySlug}/projects/${projectKey}/issues/new`);
  122 | 
  123 |     await page.getByLabel(/title/i).fill('Smoke test bug');
  124 |     // Description might be a textarea or rich editor
  125 |     const descField = page.getByLabel(/description/i).or(
  126 |       page.locator('[contenteditable="true"]').first(),
  127 |     );
  128 |     await descField.fill('Created by the smoke test suite');
  129 | 
  130 |     // Set priority if selector exists
  131 |     const prioritySelect = page.getByLabel(/priority/i);
  132 |     if (await prioritySelect.isVisible()) {
  133 |       await prioritySelect.selectOption({ label: 'HIGH' });
  134 |     }
  135 | 
  136 |     await page.getByRole('button', { name: /create|submit/i }).click();
  137 | 
  138 |     // Should redirect to issue detail or list
  139 |     await expect(page.getByText('Smoke test bug')).toBeVisible({
  140 |       timeout: 15_000,
  141 |     });
  142 |   });
  143 | });
  144 | 
  145 | // =========================================================================
  146 | // 5. Issue Board View and Status Changes
  147 | // =========================================================================
  148 | test.describe.serial('ST-005: Board View and Status Changes', () => {
  149 |   test('board view shows the created issue', async ({ page }) => {
  150 |     await loginAs(page, userEmail, userPassword);
  151 |     await page.goto(`/${companySlug}/projects/${projectKey}/board`);
  152 | 
  153 |     await expect(page.getByText('Smoke test bug')).toBeVisible({
  154 |       timeout: 15_000,
  155 |     });
  156 |   });
  157 | 
```