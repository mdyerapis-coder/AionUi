/**
 * Pet size, do-not-disturb, and position persistence, and whether the
 * settings page stays in sync with the tray and the right-click menu.
 *
 * Startup currently reads only pet.enabled and pet.confirmEnabled. Menu and
 * tray size/DND changes update the live window and are not written back.
 * Position is never stored. Those cases are marked test.fail().
 */
import { test, expect, restartElectronApp } from '../fixtures';
import { invokeBridge } from '../helpers';
import {
  dragPetBy,
  enablePet,
  invokeContextItem,
  invokeTrayItem,
  openPetSettings,
  petSnapshot,
  petSwitch,
  petWindow,
  resetPet,
  waitForDrawWindow,
} from './helpers';

test.describe.configure({ timeout: 180_000 });

test.beforeEach(async ({ page, electronApp }) => {
  await resetPet(page, electronApp);
});

test.afterAll(async ({ page, electronApp }) => {
  await resetPet(page, electronApp).catch(() => undefined);
});

test.describe('pet settings stay in sync', () => {
  test('a size chosen in settings resizes the pet and is saved', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await invokeBridge<void>(page, 'system-settings:set-pet-size', { size: 360 });

    await expect.poll(async () => petWindow(await petSnapshot(electronApp), 'draw').bounds.width).toBe(360);
    await expect.poll(async () => (await petSnapshot(electronApp)).saved.size).toBe(360);
  });

  test('do-not-disturb chosen in settings is saved', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await invokeBridge<void>(page, 'system-settings:set-pet-dnd', { dnd: true });

    await expect.poll(async () => (await petSnapshot(electronApp)).saved.dnd).toBe(true);
  });

  test('the settings page shows a size chosen from the tray', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await openPetSettings(page);
    // Arco hides the native radio input and paints the label. Click the label.
    await page.getByText('Medium (280px)', { exact: true }).click();
    await expect.poll(async () => petWindow(await petSnapshot(electronApp), 'draw').bounds.width).toBe(280);

    await invokeTrayItem(electronApp, 'size-200');
    await expect.poll(async () => petWindow(await petSnapshot(electronApp), 'draw').bounds.width).toBe(200);

    // Bug: tray size changes the live window and does not update the saved setting the page reads.
    test.fail(true, 'Bug: tray size is not saved, so the settings page keeps the previous size.');
    await openPetSettings(page);
    await expect(page.getByRole('radio', { name: 'Small (200px)' })).toBeChecked();
  });

  test('the settings page shows do-not-disturb chosen from the right-click menu', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await invokeContextItem(electronApp, 'dnd');
    await expect.poll(async () => (await petSnapshot(electronApp)).dnd).toBe(true);

    // Bug: the context-menu checkbox updates the state machine and does not save pet.dnd.
    test.fail(true, 'Bug: right-click Do Not Disturb is not saved, so the settings switch stays off.');
    await openPetSettings(page);
    await expect(petSwitch(page, 1)).toHaveAttribute('aria-checked', 'true');
  });
});

test.describe('pet settings survive a restart', () => {
  test('a size chosen in settings is restored on the next launch', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await invokeBridge<void>(page, 'system-settings:set-pet-size', { size: 360 });
    await expect.poll(async () => (await petSnapshot(electronApp)).saved.size).toBe(360);

    const restarted = await restartElectronApp();
    await waitForDrawWindow(restarted.electronApp);

    // Bug: startup creates the pet at the module default (280) and never reads pet.size.
    test.fail(true, 'Bug: saved pet size is not restored when the pet window is created at startup.');
    await expect
      .poll(async () => petWindow(await petSnapshot(restarted.electronApp), 'draw').bounds.width, { timeout: 2_000 })
      .toBe(360);
  });

  test('do-not-disturb chosen in settings is restored on the next launch', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await invokeBridge<void>(page, 'system-settings:set-pet-dnd', { dnd: true });
    await expect.poll(async () => (await petSnapshot(electronApp)).saved.dnd).toBe(true);

    const restarted = await restartElectronApp();
    await waitForDrawWindow(restarted.electronApp);

    // Bug: startup never calls setPetDndMode, so the new state machine starts with DND off.
    test.fail(true, 'Bug: saved do-not-disturb is not applied when the pet starts.');
    await expect.poll(async () => (await petSnapshot(restarted.electronApp)).dnd, { timeout: 2_000 }).toBe(true);
  });

  test('a dragged position is restored on the next launch', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    const moved = await dragPetBy(electronApp, -220, -160);
    expect(Math.abs(moved.afterDraw.x - moved.beforeDraw.x)).toBeGreaterThan(100);

    const restarted = await restartElectronApp();
    await waitForDrawWindow(restarted.electronApp);

    // Bug: position is never written, and startup always places the pet at the bottom-right.
    test.fail(true, 'Bug: pet position is never saved, so a restart puts the pet back at the bottom-right.');
    await expect
      .poll(
        async () => {
          const draw = petWindow(await petSnapshot(restarted.electronApp), 'draw');
          return Math.abs(draw.bounds.x - moved.afterDraw.x) <= 12 && Math.abs(draw.bounds.y - moved.afterDraw.y) <= 12;
        },
        { timeout: 2_000 }
      )
      .toBe(true);
  });
});
