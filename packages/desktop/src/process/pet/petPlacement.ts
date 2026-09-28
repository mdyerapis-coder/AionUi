/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PetSize } from './petTypes';

export type PetPoint = {
  x: number;
  y: number;
};

export type PetRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PetDisplay = {
  bounds: PetRect;
  workArea: PetRect;
};

/** Saved size is one of the three settings values, or it is ignored. */
export function normalizePetSize(value: unknown): PetSize | null {
  if (value === 200 || value === 280 || value === 360) return value;
  return null;
}

/** Finite screen coordinates. Rejects missing fields and non-numeric garbage. */
export function isPetPoint(value: unknown): value is PetPoint {
  if (!value || typeof value !== 'object') return false;
  const point = value as { x?: unknown; y?: unknown };
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isRect(value: unknown): value is PetRect {
  if (!value || typeof value !== 'object') return false;
  const rect = value as PetRect;
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

function overlapArea(a: PetRect, b: PetRect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return Math.round(min);
  return Math.round(Math.min(max, Math.max(min, value)));
}

function clampToWorkArea(point: PetPoint, size: number, workArea: PetRect): PetPoint {
  const maxX = workArea.x + Math.max(0, workArea.width - size);
  const maxY = workArea.y + Math.max(0, workArea.height - size);
  return {
    x: clamp(point.x, workArea.x, maxX),
    y: clamp(point.y, workArea.y, maxY),
  };
}

/**
 * Choose where the pet should appear.
 *
 * A saved point that no longer touches any connected display (monitor
 * unplugged, or a resolution change that moved it fully off-screen) falls
 * back to `fallback`. A point that still overlaps a display is clamped so the
 * whole pet sits inside that display's work area.
 */
export function resolvePetPosition(options: {
  saved: unknown;
  size: number;
  displays: PetDisplay[];
  fallback: PetPoint;
}): PetPoint {
  const { saved, size, displays, fallback } = options;
  if (!isPetPoint(fallback)) return { x: 0, y: 0 };
  if (!isPetPoint(saved) || !Number.isFinite(size) || size <= 0) return fallback;

  const pet: PetRect = { x: saved.x, y: saved.y, width: size, height: size };
  let best: PetDisplay | null = null;
  let bestArea = 0;
  for (const display of displays) {
    if (!display || !isRect(display.bounds) || !isRect(display.workArea)) continue;
    const area = overlapArea(pet, display.bounds);
    if (area > bestArea) {
      best = display;
      bestArea = area;
    }
  }
  if (!best) return fallback;
  return clampToWorkArea(saved, size, best.workArea);
}

/** True when two finite points sit within `tolerance` pixels on both axes. */
export function petPointsWithin(a: PetPoint | null, b: PetPoint | null, tolerance = 2): boolean {
  if (!isPetPoint(a) || !isPetPoint(b)) return false;
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

/**
 * Position to store after a drag or Reset position.
 *
 * The value is always the window's own read-back (`getPosition` / `getBounds`),
 * never the coordinate passed to `setPosition`. Native Wayland ignores
 * `setPosition`, so writing the request would store a guess.
 *
 * Returns null when that read cannot be trusted: it failed, the window is
 * still on its pre-move point (the move was ignored), or the read disagrees
 * with the request and there is no pre-move point proving the window moved.
 */
export function petPositionReadToSave(
  before: PetPoint | null,
  requested: PetPoint | null,
  actual: PetPoint | null,
  tolerance = 2
): PetPoint | null {
  if (!isPetPoint(actual) || !isPetPoint(requested)) return null;
  const honored = petPointsWithin(requested, actual, tolerance);
  const moved = isPetPoint(before) && !petPointsWithin(before, actual, tolerance);
  if (!honored && !moved) return null;
  return { x: actual.x, y: actual.y };
}
