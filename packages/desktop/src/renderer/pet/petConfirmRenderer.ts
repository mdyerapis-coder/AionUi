/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { applyTheme } from '@/renderer/utils/theme/applyTheme';
import {
  petPermissionButtonClass,
  type PetPermissionConfirmView,
  type PetPermissionTone,
} from '@/common/chat/petPermission';

const titleEl = document.getElementById('title')!;
const descriptionEl = document.getElementById('description')!;
const optionsEl = document.getElementById('options')!;

let current: PetPermissionConfirmView | null = null;
let responding = false;

function shortcutFor(
  option: PetPermissionConfirmView['options'][number],
  index: number,
  options: PetPermissionConfirmView['options']
): string {
  if (index === 0) return 'Enter';
  const firstDeny = options.findIndex((item) => item.tone === 'deny');
  if (option.tone === 'deny' && index === firstDeny) return 'Esc';
  return String(index + 1);
}

function optionByTone(tone: PetPermissionTone): PetPermissionConfirmView['options'][number] | undefined {
  return current?.options.find((option) => option.tone === tone);
}

/**
 * Render one button per permission option, coloured by that option's tone.
 */
function renderConfirmation(confirmation: PetPermissionConfirmView): void {
  current = confirmation;
  responding = false;

  titleEl.textContent = confirmation.title;
  titleEl.style.display = confirmation.title ? 'block' : 'none';

  if (confirmation.description) {
    descriptionEl.textContent = confirmation.description;
    descriptionEl.style.display = 'block';
  } else {
    descriptionEl.textContent = '';
    descriptionEl.style.display = 'none';
  }

  optionsEl.innerHTML = '';
  confirmation.options.forEach((option, index) => {
    const btn = document.createElement('div');
    btn.className = `option-btn ${petPermissionButtonClass(option.tone)}`;
    btn.dataset.optionId = option.optionId;
    btn.dataset.tone = option.tone;

    const shortcutSpan = document.createElement('span');
    shortcutSpan.className = 'shortcut';
    shortcutSpan.textContent = shortcutFor(option, index, confirmation.options);

    const labelSpan = document.createElement('span');
    labelSpan.textContent = option.label;

    btn.appendChild(shortcutSpan);
    btn.appendChild(labelSpan);
    btn.addEventListener('click', () => {
      respond(option.optionId);
    });
    optionsEl.appendChild(btn);
  });
}

function respond(optionId: string): void {
  if (!current || responding) return;
  responding = true;
  window.petConfirmAPI.respond({ id: current.id, optionId });
}

function setResponding(next: boolean): void {
  responding = next;
}

document.addEventListener('keydown', (event: KeyboardEvent) => {
  if (!current || responding) return;

  if (event.key === 'Enter') {
    event.preventDefault();
    const first = current.options[0];
    if (first) respond(first.optionId);
    return;
  }

  if (event.key === 'Escape' || event.key === 'n' || event.key === 'N') {
    event.preventDefault();
    const deny = optionByTone('deny');
    if (deny) respond(deny.optionId);
    return;
  }

  if (event.key === 'y' || event.key === 'Y') {
    event.preventDefault();
    const allow = optionByTone('allow');
    if (allow) respond(allow.optionId);
  }
});

window.petConfirmAPI.onThemeChange((theme) => applyTheme(theme));

window.petConfirmAPI.onConfirmationAdd((data: PetPermissionConfirmView) => {
  renderConfirmation(data);
});

window.petConfirmAPI.onConfirmationUpdate((data: PetPermissionConfirmView) => {
  renderConfirmation(data);
});

window.petConfirmAPI.onConfirmationRemove((data: { id: string }) => {
  if (current && current.id === data.id) {
    current = null;
    responding = false;
  }
});

window.petConfirmAPI.onConfirmError((data: { id: string }) => {
  if (current && current.id === data.id) setResponding(false);
});

const dragHandle = document.getElementById('drag-handle')!;
let confirmDragging = false;

dragHandle.addEventListener('mousedown', (event: MouseEvent) => {
  if (event.button !== 0) return;
  confirmDragging = true;
  window.petConfirmAPI.dragStart();
});

document.addEventListener('mouseup', () => {
  if (confirmDragging) {
    confirmDragging = false;
    window.petConfirmAPI.dragEnd();
  }
});
