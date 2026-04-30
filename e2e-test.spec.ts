import { test, expect } from '@playwright/test';

test.describe('Semantic Video Search E2E Tests', () => {
  const baseURL = 'http://localhost:3000';

  test('landing page loads correctly', async ({ page }) => {
    await page.goto(baseURL);

    // Check title
    await expect(page.locator('h1')).toContainText('Semantic Video Search');

    // Check description
    await expect(page.locator('text=Search Instagram Reels by what was spoken')).toBeVisible();

    // Check Get Started button
    const getStartedButton = page.locator('a[href="/auth/sign-in"]');
    await expect(getStartedButton).toBeVisible();

    // Check feature cards
    await expect(page.locator('text=1. Add Creators')).toBeVisible();
    await expect(page.locator('text=2. Auto-Transcribe')).toBeVisible();
    await expect(page.locator('text=3. Search')).toBeVisible();

    console.log('✅ Landing page test passed');
  });

  test('sign-in page loads correctly', async ({ page }) => {
    await page.goto(`${baseURL}/auth/sign-in`);

    // Check for sign-in form elements
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input#name')).toBeVisible();

    console.log('✅ Sign-in page test passed');
  });

  test('sign-in flow and dashboard access', async ({ page }) => {
    await page.goto(`${baseURL}/auth/sign-in`);

    // Fill in sign-in form
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input#name', 'Test User');

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL(`${baseURL}/dashboard`, { timeout: 10000 });

    // Check dashboard elements
    await expect(page.locator('h1')).toContainText('Dashboard');
    await expect(page.locator('text=Total Creators')).toBeVisible();
    await expect(page.locator('text=Total Videos')).toBeVisible();
    await expect(page.locator('text=Processing')).toBeVisible();

    console.log('✅ Sign-in and dashboard test passed');
  });

  test('creators page loads correctly', async ({ page, context }) => {
    // Sign in first
    await page.goto(`${baseURL}/auth/sign-in`);
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input#name', 'Test User');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${baseURL}/dashboard`);

    // Navigate to creators page
    await page.goto(`${baseURL}/dashboard/creators`);

    // Check creators page elements
    await expect(page.locator('h1')).toContainText('Creators');
    await expect(page.locator('button', { hasText: 'Add Creator' })).toBeVisible();

    console.log('✅ Creators page test passed');
  });

  test('search page loads correctly', async ({ page }) => {
    // Sign in first
    await page.goto(`${baseURL}/auth/sign-in`);
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input#name', 'Test User');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${baseURL}/dashboard`);

    // Navigate to search page
    await page.goto(`${baseURL}/dashboard/search`);

    // Check search page elements
    await expect(page.locator('h1')).toContainText('Search Videos');
    await expect(page.locator('select')).toBeVisible(); // Creator selector
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Search' })).toBeVisible();

    console.log('✅ Search page test passed');
  });

  test('navigation between dashboard pages works', async ({ page }) => {
    // Sign in
    await page.goto(`${baseURL}/auth/sign-in`);
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input#name', 'Test User');
    await page.click('button[type="submit"]');
    await page.waitForURL(`${baseURL}/dashboard`);

    // Click Manage Creators button
    await page.click('a[href="/dashboard/creators"]');
    await expect(page).toHaveURL(`${baseURL}/dashboard/creators`);
    await expect(page.locator('h1')).toContainText('Creators');

    // Navigate to search via nav link
    await page.click('a[href="/dashboard/search"]');
    await expect(page).toHaveURL(`${baseURL}/dashboard/search`);
    await expect(page.locator('h1')).toContainText('Search Videos');

    // Navigate back to dashboard
    await page.click('a[href="/dashboard"]');
    await expect(page).toHaveURL(`${baseURL}/dashboard`);
    await expect(page.locator('h1')).toContainText('Dashboard');

    console.log('✅ Navigation test passed');
  });
});
