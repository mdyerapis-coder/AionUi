/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  isPetPoint,
  normalizePetSize,
  resolvePetPosition,
  shouldPersistPetPosition,
  type PetDisplay,
} from '@process/pet/petPlacement';

const primary: PetDisplay = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};

const secondary: PetDisplay = {
  bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
  workArea: { x: 1920, y: 0, width: 1920, height: 1040 },
};

const fallback = { x: 1620, y: 740 };

describe('resolvePetPosition', () => {
  it('keeps a saved position that is fully inside a display work area', () => {
    const position = resolvePetPosition({
      saved: { x: 100, y: 80 },
      size: 280,
      displays: [primary],
      fallback,
    });

    expect(position).toEqual({ x: 100, y: 80 });
  });

  it('keeps a saved position on a secondary display', () => {
    const position = resolvePetPosition({
      saved: { x: 2000, y: 120 },
      size: 280,
      displays: [primary, secondary],
      fallback,
    });

    expect(position).toEqual({ x: 2000, y: 120 });
  });

  it('clamps a partially visible pet so it sits fully inside the work area', () => {
    const position = resolvePetPosition({
      saved: { x: 1800, y: 1000 },
      size: 280,
      displays: [primary],
      fallback,
    });

    expect(position).toEqual({ x: 1640, y: 760 });
  });

  it('falls back when the saved position misses every connected display', () => {
    const position = resolvePetPosition({
      saved: { x: 9000, y: 9000 },
      size: 280,
      displays: [primary],
      fallback,
    });

    expect(position).toEqual(fallback);
  });

  it('falls back when the saved position is not a finite point', () => {
    const position = resolvePetPosition({
      saved: { x: Number.NaN, y: 10 },
      size: 280,
      displays: [primary],
      fallback,
    });

    expect(position).toEqual(fallback);
  });

  it('falls back when no displays are connected', () => {
    const position = resolvePetPosition({
      saved: { x: 100, y: 80 },
      size: 280,
      displays: [],
      fallback,
    });

    expect(position).toEqual(fallback);
  });
});

describe('pet preference guards', () => {
  it('accepts only the three pet sizes', () => {
    expect(normalizePetSize(360)).toBe(360);
    expect(normalizePetSize(128)).toBeNull();
  });

  it('rejects a non-finite point', () => {
    expect(isPetPoint({ x: 1, y: 2 })).toBe(true);
    expect(isPetPoint({ x: Number.POSITIVE_INFINITY, y: 2 })).toBe(false);
    expect(isPetPoint(null)).toBe(false);
  });

  it('persists a position read that matches the requested coordinates', () => {
    expect(shouldPersistPetPosition({ x: 400, y: 300 }, { x: 401, y: 300 })).toBe(true);
  });

  it('does not persist a read that ignored the requested move', () => {
    expect(shouldPersistPetPosition({ x: 400, y: 300 }, { x: 0, y: 0 })).toBe(false);
    expect(shouldPersistPetPosition({ x: 400, y: 300 }, null)).toBe(false);
  });
});
