import { TestBed } from '@angular/core/testing';

import { THEME_STORAGE_KEY, ThemeService, resolveInitialTheme } from './theme';

describe('resolveInitialTheme', () => {
  it('prefiere el valor guardado', () => {
    expect(resolveInitialTheme('dark', false)).toBe('dark');
    expect(resolveInitialTheme('light', true)).toBe('light');
  });

  it('sin valor guardado sigue la preferencia del sistema', () => {
    expect(resolveInitialTheme(null, true)).toBe('dark');
    expect(resolveInitialTheme(null, false)).toBe('light');
    expect(resolveInitialTheme('basura', false)).toBe('light');
  });
});

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('aplica y persiste el tema al alternar', () => {
    const service = TestBed.inject(ThemeService);
    service.toggle();
    expect(service.isDark()).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    service.toggle();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('no persiste hasta que el usuario elige', () => {
    TestBed.inject(ThemeService);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});
