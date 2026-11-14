import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { CanLeave, unsavedChangesGuard } from './unsaved-changes.guard';

describe('unsavedChangesGuard', () => {
  it('delega en el componente con la URL de destino', async () => {
    const urls: string[] = [];
    const component: CanLeave = {
      canLeave: (url) => {
        urls.push(url);
        return false;
      },
    };
    const result = await unsavedChangesGuard(
      component,
      {} as ActivatedRouteSnapshot,
      {} as RouterStateSnapshot,
      { url: '/events' } as RouterStateSnapshot,
    );
    expect(result).toBe(false);
    expect(urls).toEqual(['/events']);
  });
});
