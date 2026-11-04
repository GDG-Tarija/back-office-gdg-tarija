export abstract class AssetsRepository {
  /** Sube el archivo a `path` dentro del bucket y devuelve la URL pública. */
  abstract upload(file: File, path: string): Promise<string>;
  /** Elimina por ruta del bucket o URL pública. No falla si la URL no es del bucket. */
  abstract remove(pathOrUrl: string): Promise<void>;
}
