import { Injectable, computed, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'mecha-theme';

/** Misma lógica que el script inline de index.html: guardado > preferencia del sistema > claro. */
export function resolveInitialTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersDark ? 'dark' : 'light';
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly selectedTheme = signal<Theme>(this.loadTheme());

  readonly theme = this.selectedTheme.asReadonly();
  readonly isDark = computed(() => this.selectedTheme() === 'dark');

  constructor() {
    this.applyTheme(this.selectedTheme());
  }

  toggle(): void {
    this.setTheme(this.selectedTheme() === 'dark' ? 'light' : 'dark');
  }

  setTheme(theme: Theme): void {
    this.selectedTheme.set(theme);
    this.applyTheme(theme);
    this.persist(theme);
  }

  private loadTheme(): Theme {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(THEME_STORAGE_KEY);
    } catch {
      // Almacenamiento bloqueado: se usa la preferencia del sistema.
    }
    const prefersDark =
      typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
    return resolveInitialTheme(stored, prefersDark);
  }

  private applyTheme(theme: Theme): void {
    const html = document.documentElement;
    if (theme === 'dark') html.setAttribute('data-theme', 'dark');
    else html.removeAttribute('data-theme');
  }

  private persist(theme: Theme): void {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Sin persistencia: el tema vale solo para esta sesión.
    }
  }
}
