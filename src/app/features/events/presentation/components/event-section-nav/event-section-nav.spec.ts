import { TestBed } from '@angular/core/testing';

import { EventTabId, TabStatus } from '../../../domain/event-tabs';
import { EventSectionNav } from './event-section-nav';

const statuses: Record<EventTabId, TabStatus> = {
  datos: 'complete',
  formulario: 'pending',
  paquetes: 'pending',
  sesiones: 'complete',
  extras: 'optional',
  publicacion: 'pending',
};

describe('EventSectionNav', () => {
  function create(setup: boolean, flagged: EventTabId[] = []) {
    const fixture = TestBed.createComponent(EventSectionNav);
    fixture.componentRef.setInput('current', 'formulario');
    fixture.componentRef.setInput('statuses', statuses);
    fixture.componentRef.setInput('setup', setup);
    fixture.componentRef.setInput('flagged', flagged);
    fixture.detectChanges();
    return fixture;
  }

  const buttons = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLButtonElement>('button'));

  it('en gestión normal usa el patrón de pestañas con tabindex rotativo', () => {
    const el = create(false).nativeElement as HTMLElement;
    expect(el.querySelector('[role=tablist]')).not.toBeNull();
    const tabs = buttons(el);
    expect(tabs.map((t) => t.textContent?.trim())).toEqual([
      'Datos',
      'Formulario de registro',
      'Paquetes',
      'Tracks y sesiones',
      'Cupones y staff',
      'Publicación',
    ]);
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual([
      '-1',
      '0',
      '-1',
      '-1',
      '-1',
      '-1',
    ]);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });

  it('las flechas, Home y End mueven el foco entre pestañas', () => {
    const fixture = create(false);
    const tabs = buttons(fixture.nativeElement);
    document.body.appendChild(fixture.nativeElement);
    const press = (index: number, key: string) =>
      tabs[index].dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );

    press(1, 'ArrowRight');
    expect(document.activeElement).toBe(tabs[2]);
    press(2, 'ArrowLeft');
    expect(document.activeElement).toBe(tabs[1]);
    press(1, 'End');
    expect(document.activeElement).toBe(tabs[5]);
    press(5, 'ArrowRight');
    expect(document.activeElement).toBe(tabs[0]);
    press(0, 'ArrowLeft');
    expect(document.activeElement).toBe(tabs[5]);
    press(5, 'Home');
    expect(document.activeElement).toBe(tabs[0]);
    fixture.nativeElement.remove();
  });

  it('emite la sección elegida al hacer clic', () => {
    const fixture = create(false);
    const emitted: EventTabId[] = [];
    fixture.componentInstance.sectionChange.subscribe((id) => emitted.push(id));
    buttons(fixture.nativeElement)[2].click();
    expect(emitted).toEqual(['paquetes']);
  });

  it('en el asistente muestra pasos con estado y aria-current', () => {
    const el = create(true, ['datos']).nativeElement as HTMLElement;
    expect(el.querySelector('nav[aria-label="Pasos para configurar el evento"]')).not.toBeNull();
    const steps = buttons(el);
    expect(steps[1].getAttribute('aria-current')).toBe('step');
    expect(steps[0].textContent).toContain('con datos pendientes');
    expect(steps[3].textContent).toContain('completo');
    expect(steps[4].textContent).toContain('opcional');
    expect(el.textContent).toContain('Paso 2 de 6: Formulario de registro');
  });
});
