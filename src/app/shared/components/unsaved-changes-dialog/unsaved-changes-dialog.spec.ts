import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { UnsavedChangesDialog, UnsavedChoice } from './unsaved-changes-dialog';

describe('UnsavedChangesDialog', () => {
  async function setup(visible: boolean) {
    const fixture = TestBed.createComponent(UnsavedChangesDialog);
    fixture.componentRef.setInput('visible', visible);
    const chosen = vi.fn<(c: UnsavedChoice) => void>();
    fixture.componentInstance.choose.subscribe(chosen);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, chosen };
  }

  const pressEscape = () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  it('Esc equivale a "Seguir editando" mientras está visible', async () => {
    const { fixture, chosen } = await setup(true);
    pressEscape();
    expect(chosen).toHaveBeenCalledExactlyOnceWith('stay');
    fixture.destroy();
  });

  it('oculto, Esc no emite nada', async () => {
    const { fixture, chosen } = await setup(false);
    pressEscape();
    expect(chosen).not.toHaveBeenCalled();
    fixture.destroy();
  });
});
