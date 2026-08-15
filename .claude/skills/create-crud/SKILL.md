---
name: create-crud
description: Scaffold a new admin CRUD feature (table, form, detail) for the Back Office GDG Tarija. Use when the user asks to create/add a CRUD, admin screen, or management page for an entity.
disable-model-invocation: true
---

Crea un CRUD administrativo para la entidad `$ARGUMENTS` en el Back Office GDG Tarija.

Usa razonamiento cuidadoso antes de escribir código y sigue `AGENTS.md` más las skills `project-architecture`, `design-system` y `backoffice-features`.

1. Revisa la estructura actual del repositorio y busca si ya existe la entidad `$ARGUMENTS`.
2. Crea la feature en `src/app/features/$ARGUMENTS/` usando clean architecture:
   - `data/` para API, DTOs y mappers.
   - `domain/` para modelos, contratos y lógica pura.
   - `presentation/pages/` para la página ruteable.
   - `presentation/components/` para tabla, formulario y detalle.
3. Crea una ruta lazy en `src/app/features/$ARGUMENTS/$ARGUMENTS.routes.ts` y regístrala con `loadChildren` donde corresponda.
4. Usa PrimeNG, no Angular Material:
   - `p-table` para el listado.
   - `p-dialog` para crear/editar y ver detalle.
   - `p-confirmdialog` o `ConfirmationService` para eliminar.
   - `p-toast` o `MessageService` para feedback.
   - `p-button`, `p-inputtext`, `p-select`, `p-tag` según necesidad.
5. La tabla debe incluir:
   - Columnas principales.
   - Paginación.
   - Ordenamiento en columnas relevantes.
   - Búsqueda textual.
   - Estado vacío.
   - Loading.
   - Columna de acciones: ver, editar, eliminar.
6. El formulario debe:
   - Servir para crear y editar si los campos son equivalentes.
   - Usar labels en español.
   - Usar nombres de propiedades, clases y métodos en inglés.
   - Validar campos requeridos.
   - Deshabilitar guardado mientras se procesa.
7. El detalle debe mostrar los campos no visibles en la tabla si existen.
8. No inventes contrato de backend si no está definido. Si falta API o modelo, crea una capa data mínima/mock solo si el usuario lo pidió; si no, pregunta.
9. Agrega tests para mappers, casos de uso o lógica no trivial.
10. Verifica con `npm run lint` y, si aplica, `npm test` o `npm run build`.
11. Resume al final archivos tocados, comandos ejecutados y supuestos.
