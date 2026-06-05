import { Injectable, computed, effect, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'mecha-theme';
const DEFAULT_THEME: Theme = 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly selectedTheme = signal<Theme>(this.loadTheme());

  readonly theme = this.selectedTheme.asReadonly();
  readonly isDark = computed(() => this.selectedTheme() === 'dark');

  constructor() {
    effect(() => {
      this.applyTheme(this.selectedTheme());
    });
  }

  toggle(): void {
    this.selectedTheme.set(this.selectedTheme() === 'dark' ? 'light' : 'dark');
  }

  setTheme(theme: Theme): void {
    this.selectedTheme.set(theme);
  }

  private loadTheme(): Theme {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return stored === 'light' || stored === 'dark' ? stored : DEFAULT_THEME;
  }

  private applyTheme(theme: Theme): void {
    const html = document.documentElement;

    if (theme === 'dark') html.setAttribute('data-theme', 'dark');
    else html.removeAttribute('data-theme');

    localStorage.setItem(STORAGE_KEY, theme);
  }
}
