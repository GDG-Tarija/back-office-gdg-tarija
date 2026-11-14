import { Title } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { RouterStateSnapshot } from '@angular/router';

import { APP_NAME, PageTitleStrategy, composeTitle } from './page-title.strategy';

describe('PageTitleStrategy', () => {
  it('compone "<página> · Back Office GDG Tarija"', () => {
    expect(composeTitle('Eventos')).toBe(`Eventos · ${APP_NAME}`);
    expect(composeTitle(undefined)).toBe(APP_NAME);
  });

  it('actualiza el título del documento', () => {
    const strategy = TestBed.inject(PageTitleStrategy);
    vi.spyOn(strategy, 'buildTitle').mockReturnValue('Check-in');
    strategy.updateTitle({} as RouterStateSnapshot);
    expect(TestBed.inject(Title).getTitle()).toBe(`Check-in · ${APP_NAME}`);
  });
});
