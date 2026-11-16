import { Injectable, inject } from '@angular/core';

import { SUPABASE } from '../../../core/supabase/supabase.client';
import {
  STORE_IMAGES_BUCKET,
  buildStoreImagePath,
  extractStoreImagePath,
} from '../domain/store-asset-path';
import { StoreImagesRepository } from '../domain/store.repository';
import { toDomainError } from './postgres-error.mapper';

@Injectable({ providedIn: 'root' })
export class StoreImagesApi implements StoreImagesRepository {
  private readonly supabase = inject(SUPABASE);

  async upload(file: File, eventId: string): Promise<string> {
    const bucket = this.supabase.storage.from(STORE_IMAGES_BUCKET);
    const path = buildStoreImagePath(eventId, file.type);
    const { error } = await bucket.upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw toDomainError(error, 'asset');
    return bucket.getPublicUrl(path).data.publicUrl;
  }

  async remove(url: string): Promise<void> {
    const path = extractStoreImagePath(url);
    if (!path) return;
    const { error } = await this.supabase.storage.from(STORE_IMAGES_BUCKET).remove([path]);
    if (error) throw toDomainError(error, 'asset');
  }
}
