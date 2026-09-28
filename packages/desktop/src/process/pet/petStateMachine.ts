import type { PetState, StateChangeCallback } from './petTypes';
import { STATE_PRIORITY, MIN_DISPLAY_MS, AUTO_RETURN } from './petTypes';

/** Agent activity the pet can show. Local reactions (pat, poke, sleep, drag) are not in this set. */
const ACTIVITY_STATES: ReadonlySet<PetState> = new Set([
  'idle',
  'thinking',
  'working',
  'done',
  'error',
  'notification',
]);

/**
 * New agent activity must replace `done` immediately.
 * `done` outranks `thinking` / `working` and holds the screen for several seconds,
 * which used to swallow the next turn until the return-to-idle timer fired.
 */
const DONE_OVERRIDE_STATES: ReadonlySet<PetState> = new Set(['thinking', 'working', 'notification', 'error']);

export class PetStateMachine {
  private current: PetState = 'idle';
  private changedAt = Date.now();
  private listeners: StateChangeCallback[] = [];
  private autoReturnTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingState: PetState | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private dnd = false;

  getCurrentState(): PetState {
    return this.current;
  }

  setDnd(enabled: boolean): void {
    this.dnd = enabled;
    if (enabled) {
      this.clearPending();
      this.clearAutoReturn();
    }
  }

  getDnd(): boolean {
    return this.dnd;
  }

  requestState(state: PetState): PetState | null {
    if (this.isBlocked(state)) return null;
    if (state === this.current) {
      this.refreshHold();
      return null;
    }
    if (this.current === 'done' && DONE_OVERRIDE_STATES.has(state)) {
      this.applyState(state);
      return state;
    }
    return this.transitionByPriority(state);
  }

  /**
   * Show the activity chosen across conversations.
   *
   * Activity can move to a lower rank when that conversation ends (`working` back
   * to `idle`, `notification` back to another conversation's `working`). The
   * return-to-idle timer for each conversation lives on the bridge, so this path
   * does not start a second one. Repeating the visible activity does not notify
   * listeners, which would reload the SVG and restart its animation.
   *
   * Do-not-disturb still rejects every state except `dragging`. `setDnd` is
   * unchanged so a separate timer-freeze fix can rebase onto the same fields.
   */
  presentActivity(state: PetState): PetState | null {
    if (this.isBlocked(state)) return null;
    if (state === this.current) return null;
    if (state === 'idle') {
      if (this.current !== 'idle' && ACTIVITY_STATES.has(this.current)) {
        this.applyState('idle', false);
        return 'idle';
      }
      return null;
    }
    if (ACTIVITY_STATES.has(this.current) && ACTIVITY_STATES.has(state)) {
      this.applyState(state, false);
      return state;
    }
    return this.transitionByPriority(state);
  }

  forceState(state: PetState): void {
    this.clearPending();
    this.clearAutoReturn();
    this.applyState(state);
  }

  onStateChange(cb: StateChangeCallback): void {
    this.listeners.push(cb);
  }

  offStateChange(cb: StateChangeCallback): void {
    const idx = this.listeners.indexOf(cb);
    if (idx >= 0) this.listeners.splice(idx, 1);
  }

  dispose(): void {
    this.clearPending();
    this.clearAutoReturn();
    this.listeners.length = 0;
  }

  private isBlocked(state: PetState): boolean {
    return this.dnd && state !== 'dragging';
  }

  private transitionByPriority(state: PetState): PetState | null {
    const newPri = STATE_PRIORITY[state];
    const curPri = STATE_PRIORITY[this.current];

    // Higher priority always wins
    if (newPri > curPri) {
      this.applyState(state);
      return state;
    }

    // Lower priority rejected, except for idle → sleep transitions
    if (newPri < curPri) {
      // Allow idle state to transition into sleep states (yawning/dozing/sleeping)
      const SLEEP_STATES: PetState[] = ['yawning', 'dozing', 'sleeping'];
      const IDLE_STATES: PetState[] = ['idle', 'random-look', 'random-read'];
      if (IDLE_STATES.includes(this.current) && SLEEP_STATES.includes(state)) {
        this.applyState(state);
        return state;
      }
      return null;
    }

    // Equal priority: check min display
    const minMs = MIN_DISPLAY_MS[this.current] ?? 0;
    const elapsed = Date.now() - this.changedAt;
    const remaining = minMs - elapsed;

    if (remaining > 0) {
      // Queue it
      this.clearPending();
      this.pendingState = state;
      this.pendingTimer = setTimeout(() => {
        if (this.pendingState) {
          this.applyState(this.pendingState);
          this.pendingState = null;
          this.pendingTimer = null;
        }
      }, remaining);
      return null;
    }

    this.applyState(state);
    return state;
  }

  /**
   * Same state again: restart the return timer and the minimum-display window
   * without telling listeners. Reloading the SVG would restart the animation.
   */
  private refreshHold(): void {
    this.changedAt = Date.now();
    if (this.autoReturnTimer) {
      clearTimeout(this.autoReturnTimer);
      this.autoReturnTimer = null;
    }
    this.armAutoReturn(this.current);

    if (!this.pendingState) return;
    const pending = this.pendingState;
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    const minMs = MIN_DISPLAY_MS[this.current] ?? 0;
    if (minMs <= 0) {
      this.pendingState = null;
      this.applyState(pending);
      return;
    }
    this.pendingState = pending;
    this.pendingTimer = setTimeout(() => {
      if (this.pendingState) {
        this.applyState(this.pendingState);
        this.pendingState = null;
        this.pendingTimer = null;
      }
    }, minMs);
  }

  private applyState(state: PetState, autoReturn = true): void {
    const prev = this.current;
    this.current = state;
    this.changedAt = Date.now();
    this.clearPending();
    this.clearAutoReturn();

    if (autoReturn) this.armAutoReturn(state);

    for (const cb of this.listeners) {
      try {
        cb(state, prev);
      } catch {
        // Never crash
      }
    }
  }

  private armAutoReturn(state: PetState): void {
    const ar = AUTO_RETURN[state];
    if (!ar) return;
    this.autoReturnTimer = setTimeout(() => {
      this.autoReturnTimer = null;
      this.applyState(ar.target);
    }, ar.delayMs);
  }

  private clearPending(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
      this.pendingState = null;
    }
  }

  private clearAutoReturn(): void {
    if (this.autoReturnTimer) {
      clearTimeout(this.autoReturnTimer);
      this.autoReturnTimer = null;
    }
  }
}
