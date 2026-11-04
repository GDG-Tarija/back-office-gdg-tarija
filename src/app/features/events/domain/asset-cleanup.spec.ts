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
});
