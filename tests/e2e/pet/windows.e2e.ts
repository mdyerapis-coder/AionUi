/**
 * Desktop pet windows: settings show/hide, overlay flags, tray and
 * right-click menu, drag, and the click-through watchdog.
 */
import { test, expect } from '../fixtures';
import {
  dragPetBy,
  enablePet,
  forceHitIgnore,
  invokeContextItem,
  invokeTrayItem,
  moveCursor,
  openPetSettings,
  petSnapshot,
  petSwitch,
  petWindow,
  readTrayShowHideLabel,
  resetPet,
  waitForPetWindows,
} from './helpers';

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page, electronApp }) => {
  await resetPet(page, electronApp);
});

test.afterAll(async ({ page, electronApp }) => {
  await resetPet(page, electronApp).catch(() => undefined);
});

test.describe('pet show and hide', () => {
  test('turning the pet on from settings opens the draw and hit windows', async ({ page, electronApp }) => {
    await openPetSettings(page);
    await petSwitch(page, 0).click();
    const snap = await waitForPetWindows(electronApp);

    expect(snap.windows.map((win) => win.role).sort()).toEqual(['draw', 'hit']);
  });

  test('turning the pet off from settings destroys both windows', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await openPetSettings(page);
    await petSwitch(page, 0).click();

    await expect.poll(async () => (await petSnapshot(electronApp)).windows.length, { timeout: 5_000 }).toBe(0);
  });

  test('enabling the pet twice does not open a second pair of windows', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await enablePet(page, electronApp);
    const snap = await petSnapshot(electronApp);

    expect(snap.windows.filter((win) => win.role === 'draw' || win.role === 'hit')).toHaveLength(2);
  });

  test('right-click Hide hides both windows and the tray shows them again', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await invokeContextItem(electronApp, 'hide');

    await expect
      .poll(async () => (await petSnapshot(electronApp)).windows.every((win) => !win.visible), { timeout: 5_000 })
      .toBe(true);

    await invokeTrayItem(electronApp, 'show-hide');

    await expect
      .poll(async () => (await petSnapshot(electronApp)).windows.every((win) => win.visible), { timeout: 5_000 })
      .toBe(true);
  });

  test('tray Show/Hide hides a visible pet', async ({ page, electronApp }) => {
    const snap = await enablePet(page, electronApp);
    expect(snap.windows.every((win) => win.visible)).toBe(true);

    // Bug: tray Show/Hide only calls showPetWindow(), so a visible pet stays visible.
    test.fail(true, 'Bug: tray Show/Hide only calls showPetWindow(), so a visible pet stays visible.');
    await invokeTrayItem(electronApp, 'show-hide');
    await expect
      .poll(async () => (await petSnapshot(electronApp)).windows.some((win) => win.visible), { timeout: 1_500 })
      .toBe(false);
  });

  test('the tray item reads Hide while the pet is visible', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);

    // Bug: the item label is always pet.showHide ("Show/Hide").
    test.fail(true, 'Bug: the tray pet item is always "Show/Hide", not Hide while the pet is visible.');
    expect(await readTrayShowHideLabel(electronApp)).toBe('Hide');
  });

  test('the tray item reads Show after the pet is hidden from its menu', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await invokeContextItem(electronApp, 'hide');
    await expect
      .poll(async () => (await petSnapshot(electronApp)).windows.every((win) => !win.visible), { timeout: 5_000 })
      .toBe(true);

    // Bug: hiding from the pet menu does not change the tray label.
    test.fail(true, 'Bug: the tray pet item stays "Show/Hide" after the pet menu hides the pet.');
    expect(await readTrayShowHideLabel(electronApp)).toBe('Show');
  });

  test('the tray item reads Show after Settings turns the pet off', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    await openPetSettings(page);
    await petSwitch(page, 0).click();
    await expect.poll(async () => (await petSnapshot(electronApp)).windows.length, { timeout: 5_000 }).toBe(0);

    // Bug: destroying the pet from Settings does not change the tray label.
    test.fail(true, 'Bug: the tray pet item stays "Show/Hide" after Settings turns the pet off.');
    expect(await readTrayShowHideLabel(electronApp)).toBe('Show');
  });

  test('tray Show/Hide does not change whether the pet is enabled', async ({ page, electronApp }) => {
    const enabled = await enablePet(page, electronApp);
    expect(enabled.saved.enabled).toBe(true);

    await invokeTrayItem(electronApp, 'show-hide');
    expect((await petSnapshot(electronApp)).saved.enabled).toBe(true);

    await invokeContextItem(electronApp, 'hide');
    await expect
      .poll(async () => (await petSnapshot(electronApp)).windows.every((win) => !win.visible), { timeout: 5_000 })
      .toBe(true);
    expect((await petSnapshot(electronApp)).saved.enabled).toBe(true);

    await invokeTrayItem(electronApp, 'show-hide');
    await expect
      .poll(async () => (await petSnapshot(electronApp)).windows.every((win) => win.visible), { timeout: 5_000 })
      .toBe(true);
    expect((await petSnapshot(electronApp)).saved.enabled).toBe(true);
  });

  test('tray Show does not create a pet while the settings switch is off', async ({ electronApp }) => {
    const before = await petSnapshot(electronApp);
    expect(before.saved.enabled).toBe(false);
    expect(before.windows).toHaveLength(0);

    await invokeTrayItem(electronApp, 'show-hide');
    await expect
      .poll(
        async () => {
          const snap = await petSnapshot(electronApp);
          return { windows: snap.windows.length, enabled: snap.saved.enabled };
        },
        { timeout: 1_500 }
      )
      .toEqual({ windows: 0, enabled: false });
  });
});

test.describe('pet window flags', () => {
  test('draw window is always on top, click-through, and not focusable', async ({ page, electronApp }) => {
    const snap = await enablePet(page, electronApp);
    const draw = petWindow(snap, 'draw');

    // Electron 37 does not expose `transparent` or `frame` after the window
    // exists (both probes are null). getBackgroundColor() returns #000000
    // with no alpha, which is not evidence either way. See the test plan:
    // a person has to confirm the missing frame and the see-through background.
    expect({
      alwaysOnTop: draw.alwaysOnTop,
      ignoresMouse: draw.ignoreMouseEvents,
      focusable: draw.focusable,
    }).toEqual({
      alwaysOnTop: true,
      ignoresMouse: true,
      focusable: false,
    });
    if (draw.transparent !== null) {
      expect(draw.transparent).toBe(true);
    }
    if (draw.frame !== null) {
      expect(draw.frame).toBe(false);
    }
  });

  test('hit window is a smaller always-on-top overlay that starts click-through', async ({ page, electronApp }) => {
    const snap = await enablePet(page, electronApp);
    const draw = petWindow(snap, 'draw');
    const hit = petWindow(snap, 'hit');
    const hitOffset = Math.round(draw.bounds.width * 0.2);

    expect({
      alwaysOnTop: hit.alwaysOnTop,
      ignoresMouse: hit.ignoreMouseEvents,
      focusable: hit.focusable,
      width: hit.bounds.width,
      height: hit.bounds.height,
      x: hit.bounds.x,
      y: hit.bounds.y,
    }).toEqual({
      alwaysOnTop: true,
      ignoresMouse: true,
      focusable: false,
      width: Math.round(draw.bounds.width * 0.6),
      height: Math.round(draw.bounds.height * 0.6),
      x: draw.bounds.x + hitOffset,
      y: draw.bounds.y + hitOffset,
    });
  });

  test('a new pet sits at the bottom-right of the display that holds the main window', async ({
    page,
    electronApp,
  }) => {
    const snap = await enablePet(page, electronApp);
    const draw = petWindow(snap, 'draw');
    const area = snap.primaryWorkArea;
    const expectedX = area.x + area.width - draw.bounds.width - 20;
    const expectedY = area.y + area.height - draw.bounds.height - 20;

    expect(Math.abs(draw.bounds.x - expectedX)).toBeLessThanOrEqual(8);
    expect(Math.abs(draw.bounds.y - expectedY)).toBeLessThanOrEqual(8);
  });

  test('the main-process watchdog forces hit-window click-through back on', async ({ page, electronApp }) => {
    const snap = await enablePet(page, electronApp);
    const draw = petWindow(snap, 'draw');
    // Keep the pointer well outside the pet so the watchdog is allowed to restore click-through.
    moveCursor(8, 8);
    const cursor = (await petSnapshot(electronApp)).cursor;
    expect(cursor.x).toBeLessThan(40);
    expect(cursor.y).toBeLessThan(40);
    expect(draw.bounds.x).toBeGreaterThan(80);

    const forced = await forceHitIgnore(electronApp, false);
    expect(forced).toBe(false);

    await expect
      .poll(async () => petWindow(await petSnapshot(electronApp), 'hit').ignoreMouseEvents, { timeout: 2_000 })
      .toBe(true);
  });
});

test.describe('pet drag', () => {
  test('dragging moves the draw window and the hit window by the same amount', async ({ page, electronApp }) => {
    await enablePet(page, electronApp);
    const moved = await dragPetBy(electronApp, 120, -80);

    expect(Math.abs(moved.afterDraw.x - (moved.beforeDraw.x + 120))).toBeLessThanOrEqual(12);
    expect(Math.abs(moved.afterDraw.y - (moved.beforeDraw.y - 80))).toBeLessThanOrEqual(12);
    expect(
      Math.abs(moved.afterHit.x - moved.beforeHit.x - (moved.afterDraw.x - moved.beforeDraw.x))
    ).toBeLessThanOrEqual(4);
    expect(
      Math.abs(moved.afterHit.y - moved.beforeHit.y - (moved.afterDraw.y - moved.beforeDraw.y))
    ).toBeLessThanOrEqual(4);
  });
});
