import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { DialogFrame } from './dialog-frame';

@Component({
  imports: [DialogFrame],
  template: `
    <button id="opener" type="button">Abrir</button>
    @if (open()) {
      <app-dialog-frame
        title="Nuevo paquete"
        [initialSize]="size()"
        [dirty]="dirty()"
        [busy]="busy()"
        (closeDialog)="closed()"
      >
        <input id="first" type="text" />
        <ng-container dialog-actions>
          <button type="button">Guardar</button>
        </ng-container>
      </app-dialog-frame>
    }
  `,
})
class HostComponent {
  readonly open = signal(true);
  readonly dirty = signal(false);
  readonly busy = signal(false);
  readonly size = signal<'sm' | 'md' | 'lg'>('md');
  readonly closed = vi.fn();
}

async function setup(): Promise<ComponentFixture<HostComponent>> {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(document.body.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
  );
  if (!found) throw new Error(`No hay botón "${label}"`);
  return found;
}

describe('DialogFrame', () => {
  it('expone un diálogo modal con nombre accesible y botones etiquetados', async () => {
    const fixture = await setup();
    const dialog = document.body.querySelector('[role="dialog"]');
    const labelId = dialog?.getAttribute('aria-labelledby');

    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(labelId && document.getElementById(labelId)?.tagName).toBe('H2');
    expect(button('Cerrar')).toBeTruthy();
    expect(button('Pantalla completa')).toBeTruthy();
    fixture.destroy();
  });

  it('no muestra pantalla completa en diálogos pequeños', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.size.set('sm');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(() => button('Pantalla completa')).toThrow();
    fixture.destroy();
  });

  it('Escape cierra el diálogo', async () => {
    const fixture = await setup();
    pressEscape();
    expect(fixture.componentInstance.closed).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('mientras guarda (busy) ignora Esc y la X', async () => {
    const fixture = await setup();
    fixture.componentInstance.busy.set(true);
    fixture.detectChanges();

    pressEscape();
    button('Cerrar').click();

    expect(fixture.componentInstance.closed).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('con una confirmación o lista abierta encima, Esc no cierra el diálogo de abajo', async () => {
    const fixture = await setup();
    const confirm = document.createElement('div');
    confirm.className = 'p-dialog-mask p-confirmdialog-mask';
    document.body.appendChild(confirm);

    pressEscape();
    expect(fixture.componentInstance.closed).not.toHaveBeenCalled();

    confirm.remove();
    const overlay = document.createElement('div');
    overlay.className = 'p-select-overlay';
    document.body.appendChild(overlay);
    pressEscape();
    expect(fixture.componentInstance.closed).not.toHaveBeenCalled();

    overlay.remove();
    pressEscape();
    expect(fixture.componentInstance.closed).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('con cambios sin guardar pide confirmación y Seguir editando no cierra', async () => {
    const fixture = await setup();
    fixture.componentInstance.dirty.set(true);
    fixture.detectChanges();

    pressEscape();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.closed).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('¿Descartar los cambios?');

    button('Seguir editando').click();
    fixture.detectChanges();
    expect(document.body.textContent).not.toContain('¿Descartar los cambios?');
    expect(fixture.componentInstance.closed).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('Descartar cierra tras confirmar', async () => {
    const fixture = await setup();
    fixture.componentInstance.dirty.set(true);
    fixture.detectChanges();

    button('Cerrar').click();
    fixture.detectChanges();
    await fixture.whenStable();
    button('Descartar').click();

    expect(fixture.componentInstance.closed).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });

  it('devuelve el foco al disparador al cerrarse', async () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open.set(false);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const opener = fixture.nativeElement.querySelector('#opener') as HTMLButtonElement;
    opener.focus();

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    (document.getElementById('first') as HTMLInputElement).focus();

    fixture.componentInstance.open.set(false);
    fixture.detectChanges();

    expect(document.activeElement).toBe(opener);
    fixture.destroy();
  });
});
