import { type Page, expect } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

/** Unique suffix for test isolation */
function uid(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Register a fresh test user and return their credentials.
 */
export async function createTestUser(page: Page) {
  const suffix = uid();
  const email = `smoke-${suffix}@test.bugdetector.dev`;
  const password = 'Test1234!@#';
  const name = `Smoke User ${suffix}`;

  await page.goto('/auth/register');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /register|sign up/i }).click();

  // Wait for navigation after successful registration
  await page.waitForURL('**', { timeout: 15_000 });
  // Verify we're no longer on the register page
  await page.waitForFunction(() => !window.location.pathname.includes('/register'), { timeout: 5_000 });

  return { email, password, name };
}

/**
 * Log in as an existing user.
 */
export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/auth/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /log in|sign in/i }).click();

  // Wait for navigation after login
  await page.waitForFunction(() => !window.location.pathname.includes('/login'), { timeout: 15_000 });
}

/**
 * Create a company and a default project inside it.
 * Assumes user is already logged in.
 */
export async function createCompanyAndProject(page: Page) {
  const suffix = uid();
  const companyName = `Test Co ${suffix}`;
  const companySlug = `test-co-${suffix}`;
  const projectName = `Test Project ${suffix}`;
  const projectKey = `TP${suffix.toUpperCase().slice(0, 3)}`;

  // Navigate to company creation
  await page.goto('/onboarding');

  // Fill company form
  await page.getByLabel(/company name/i).fill(companyName);
  await page.getByLabel(/slug/i).fill(companySlug);
  await page.getByRole('button', { name: /create|next|continue/i }).click();

  // Wait for company to be created
  await page.waitForURL(new RegExp(`/${companySlug}|/onboarding`), {
    timeout: 15_000,
  });

  // Create project
  await page.goto(`/${companySlug}/projects/new`);
  await page.getByLabel(/project name/i).fill(projectName);
  await page.getByLabel(/key/i).fill(projectKey);
  await page.getByRole('button', { name: /create/i }).click();

  await page.waitForURL(new RegExp(`/${companySlug}/projects/`), {
    timeout: 15_000,
  });

  return { companyName, companySlug, projectName, projectKey };
}

/**
 * Generate an API key for the current company.
 * Assumes user is logged in and on a company page.
 */
export async function generateApiKey(page: Page, companySlug: string) {
  await page.goto(`/${companySlug}/settings/api-keys`);

  await page
    .getByRole('button', { name: /generate|create.*key/i })
    .click();
  await page.getByLabel(/name|label/i).fill('Smoke Test Key');
  await page.getByRole('button', { name: /generate|create/i }).click();

  // The key is shown once — grab it from the page
  const keyElement = page.locator('[data-testid="api-key-value"], code, pre').first();
  await expect(keyElement).toBeVisible({ timeout: 10_000 });
  const apiKey = await keyElement.textContent();

  return apiKey?.trim() ?? '';
}
