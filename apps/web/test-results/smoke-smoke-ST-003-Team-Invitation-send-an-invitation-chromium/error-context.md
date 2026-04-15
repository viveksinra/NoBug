# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke\smoke.spec.ts >> ST-003: Team Invitation >> send an invitation
- Location: tests\smoke\smoke.spec.ts:89:7

# Error details

```
Error: locator.fill: value: expected string, got undefined
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - heading "Sign In" [level=1] [ref=e4]
    - generic [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]: Email
        - textbox "Email" [ref=e8]
      - generic [ref=e9]:
        - generic [ref=e10]: Password
        - textbox "Password" [ref=e11]
      - button "Log In" [ref=e12]
    - paragraph [ref=e13]:
      - text: Don't have an account?
      - link "Sign up" [ref=e14] [cursor=pointer]:
        - /url: /auth/register
  - button "Open Next.js Dev Tools" [ref=e20] [cursor=pointer]:
    - img [ref=e21]
  - alert [ref=e24]
```

# Test source

```ts
  1   | import { type Page, expect } from '@playwright/test';
  2   | 
  3   | const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
  4   | 
  5   | /** Unique suffix for test isolation */
  6   | function uid(): string {
  7   |   return Math.random().toString(36).slice(2, 8);
  8   | }
  9   | 
  10  | /**
  11  |  * Register a fresh test user and return their credentials.
  12  |  */
  13  | export async function createTestUser(page: Page) {
  14  |   const suffix = uid();
  15  |   const email = `smoke-${suffix}@test.bugdetector.dev`;
  16  |   const password = 'Test1234!@#';
  17  |   const name = `Smoke User ${suffix}`;
  18  | 
  19  |   await page.goto('/auth/register');
  20  |   await page.getByLabel('Name').fill(name);
  21  |   await page.getByLabel('Email').fill(email);
  22  |   await page.getByLabel('Password', { exact: true }).fill(password);
  23  |   await page.getByRole('button', { name: /register|sign up/i }).click();
  24  | 
  25  |   // Wait for navigation after successful registration
  26  |   await page.waitForURL('**', { timeout: 15_000 });
  27  |   // Verify we're no longer on the register page
  28  |   await page.waitForFunction(() => !window.location.pathname.includes('/register'), { timeout: 5_000 });
  29  | 
  30  |   return { email, password, name };
  31  | }
  32  | 
  33  | /**
  34  |  * Log in as an existing user.
  35  |  */
  36  | export async function loginAs(page: Page, email: string, password: string) {
  37  |   await page.goto('/auth/login');
> 38  |   await page.getByLabel('Email').fill(email);
      |                                  ^ Error: locator.fill: value: expected string, got undefined
  39  |   await page.getByLabel('Password').fill(password);
  40  |   await page.getByRole('button', { name: /log in|sign in/i }).click();
  41  | 
  42  |   // Wait for navigation after login
  43  |   await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15_000 });
  44  | }
  45  | 
  46  | /**
  47  |  * Create a company and a default project inside it.
  48  |  * Assumes user is already logged in.
  49  |  */
  50  | export async function createCompanyAndProject(page: Page) {
  51  |   const suffix = uid();
  52  |   const companyName = `Test Co ${suffix}`;
  53  |   const companySlug = `test-co-${suffix}`;
  54  |   const projectName = `Test Project ${suffix}`;
  55  |   const projectKey = `TP${suffix.toUpperCase().slice(0, 3)}`;
  56  | 
  57  |   // Navigate to company creation
  58  |   await page.goto('/onboarding');
  59  | 
  60  |   // Fill company form
  61  |   await page.getByLabel(/company name/i).fill(companyName);
  62  |   await page.getByLabel(/slug/i).fill(companySlug);
  63  |   await page.getByRole('button', { name: /create|next|continue/i }).click();
  64  | 
  65  |   // Wait for company to be created
  66  |   await page.waitForURL(new RegExp(`/${companySlug}|/onboarding`), {
  67  |     timeout: 15_000,
  68  |   });
  69  | 
  70  |   // Create project
  71  |   await page.goto(`/${companySlug}/projects/new`);
  72  |   await page.getByLabel(/project name/i).fill(projectName);
  73  |   await page.getByLabel(/key/i).fill(projectKey);
  74  |   await page.getByRole('button', { name: /create/i }).click();
  75  | 
  76  |   await page.waitForURL(new RegExp(`/${companySlug}/projects/`), {
  77  |     timeout: 15_000,
  78  |   });
  79  | 
  80  |   return { companyName, companySlug, projectName, projectKey };
  81  | }
  82  | 
  83  | /**
  84  |  * Generate an API key for the current company.
  85  |  * Assumes user is logged in and on a company page.
  86  |  */
  87  | export async function generateApiKey(page: Page, companySlug: string) {
  88  |   await page.goto(`/${companySlug}/settings/api-keys`);
  89  | 
  90  |   await page
  91  |     .getByRole('button', { name: /generate|create.*key/i })
  92  |     .click();
  93  |   await page.getByLabel(/name|label/i).fill('Smoke Test Key');
  94  |   await page.getByRole('button', { name: /generate|create/i }).click();
  95  | 
  96  |   // The key is shown once — grab it from the page
  97  |   const keyElement = page.locator('[data-testid="api-key-value"], code, pre').first();
  98  |   await expect(keyElement).toBeVisible({ timeout: 10_000 });
  99  |   const apiKey = await keyElement.textContent();
  100 | 
  101 |   return apiKey?.trim() ?? '';
  102 | }
  103 | 
```