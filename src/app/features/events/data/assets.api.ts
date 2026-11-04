import { Injectable, inject } from '@angular/core';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import { ASSETS_BUCKET, extractAssetPath } from '../domain/asset-path';
import { AssetsRepository } from '../domain/assets.repository';
import { toDomainError } from './postgres-error.mapper';

@Injectable({ providedIn: 'root' })
export class AssetsApi implements AssetsRepository {
  private readonly supabase = inject(SUPABASE);

  async upload(file: File, path: string): Promise<string> {
    const bucket = this.supabase.storage.from(ASSETS_BUCKET);
    const { error } = await bucket.upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw toDomainError({ message: error.message }, 'asset');
    return bucket.getPublicUrl(path).data.publicUrl;
  }

  async remove(pathOrUrl: string): Promise<void> {
    const path = /^https?:\/\//.test(pathOrUrl) ? extractAssetPath(pathOrUrl) : pathOrUrl;
    if (!path) return;
    const { error } = await this.supabase.storage.from(ASSETS_BUCKET).remove([path]);
    if (error) throw toDomainError({ message: error.message }, 'asset');
  }
}
