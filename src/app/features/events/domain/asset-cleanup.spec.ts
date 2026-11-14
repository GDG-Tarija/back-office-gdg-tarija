import { AssetCleanupTracker } from './asset-cleanup';

describe('AssetCleanupTracker', () => {
  const remove = vi.fn<(url: string) => Promise<void>>();
  let tracker: AssetCleanupTracker;

  beforeEach(() => {
    remove.mockReset().mockResolvedValue(undefined);
    tracker = new AssetCleanupTracker(remove);
  });

  it('no borra el archivo guardado al reemplazarlo; lo borra solo tras commit', async () => {
    tracker.trackUploaded('new');
    await tracker.trackDiscarded('old');
    expect(remove).not.toHaveBeenCalled();
    expect(tracker.pendingUrls).toEqual(['old']);

    await tracker.commit();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('old');
    expect(tracker.pendingUrls).toEqual([]);
    expect(tracker.uploadedUrls).toEqual([]);
  });

  it('rollback borra lo subido y conserva el archivo guardado', async () => {
    tracker.trackUploaded('new');
    await tracker.trackDiscarded('old');
    await tracker.rollback();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('new');
  });

  it('un archivo subido y descartado antes de guardar se borra de inmediato', async () => {
    tracker.trackUploaded('a');
    await tracker.trackDiscarded('a');
    expect(remove).toHaveBeenCalledWith('a');
    await tracker.rollback();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('cadena A guardado -> B -> C: B se borra ya, A tras guardar, C se conserva', async () => {
    tracker.trackUploaded('B');
    await tracker.trackDiscarded('A');
    tracker.trackUploaded('C');
    await tracker.trackDiscarded('B');
    await tracker.commit();
    expect(remove.mock.calls.map((c) => c[0]).sort()).toEqual(['A', 'B']);
  });

  it('tras commit lo subido es permanente: rollback posterior no lo borra', async () => {
    tracker.trackUploaded('new');
    await tracker.commit();
    await tracker.rollback();
    expect(remove).not.toHaveBeenCalled();
  });

  it('no propaga errores de borrado', async () => {
    remove.mockRejectedValue(new Error('boom'));
    await tracker.trackDiscarded('old');
    tracker.trackUploaded('new');
    await expect(tracker.commit()).resolves.toBeUndefined();
    tracker.trackUploaded('x');
    await expect(tracker.rollback()).resolves.toBeUndefined();
  });

  describe('reconcile (guardado fallido a medias)', () => {
    it('lo subido que la BD ya referencia deja de ser borrable', async () => {
      tracker.trackUploaded('new-qr');
      tracker.trackUploaded('unsaved');
      await tracker.reconcile(new Set(['new-qr']));
      await tracker.rollback();
      expect(remove).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledWith('unsaved');
    });

    it('borra el reemplazado solo si nadie lo referencia ya', async () => {
      await tracker.trackDiscarded('old-referenced');
      await tracker.trackDiscarded('old-orphan');
      await tracker.reconcile(new Set(['old-referenced']));
      expect(remove).toHaveBeenCalledTimes(1);
      expect(remove).toHaveBeenCalledWith('old-orphan');
      expect(tracker.pendingUrls).toEqual(['old-referenced']);
    });

    it('si no se pudo leer el servidor, no borra nada', async () => {
      tracker.trackUploaded('new');
      await tracker.trackDiscarded('old');
      await tracker.reconcile(null);
      await tracker.rollback();
      await tracker.commit();
      expect(remove).not.toHaveBeenCalled();
    });
  });
});
