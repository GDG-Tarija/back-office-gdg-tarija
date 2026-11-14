import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const APP_NAME = 'Back Office GDG Tarija';

export function composeTitle(pageTitle: string | undefined): string {
  return pageTitle ? `${pageTitle} · ${APP_NAME}` : APP_NAME;
}

@Injectable({ providedIn: 'root' })
export class PageTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.title.setTitle(composeTitle(this.buildTitle(snapshot)));
  }
}
