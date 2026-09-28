/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared pet-overlay visibility flag.
 *
 * The pet manager publishes it and the tray menu reads it. Keeping the flag in
 * its own module avoids a cycle: the tray must not import the pet manager, and
 * the pet manager must not import the tray.
 */

type VisibilityListener = () => void;

let overlayVisible = false;
const listeners = new Set<VisibilityListener>();

/** Whether the desktop pet render window is currently showing. */
export function isPetOverlayVisible(): boolean {
  return overlayVisible;
}

/**
 * Record whether the pet overlay is showing and notify listeners on change.
 * Listeners are used to rebuild the tray menu label.
 */
export function publishPetOverlayVisible(visible: boolean): void {
  if (visible === overlayVisible) return;
  overlayVisible = visible;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A listener failure must not break pet window updates.
    }
  }
}

/** Subscribe to pet overlay visibility changes. Returns an unsubscribe function. */
export function subscribePetOverlayVisible(listener: VisibilityListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
