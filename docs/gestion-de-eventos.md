# Gestión de eventos

Guía para organizadores del back-office. Requiere rol **SUPERADMIN** para crear y editar; el rol **STAFF** solo consulta y hace check-in en eventos asignados.

## Crear un evento (wizard)

Ir a **Eventos > Nuevo evento** (`/events/new`). Seis pasos:

1. **Datos**: título, slug, tipo, modalidad, fechas, capacidad, lugar, enlace, descripción e imágenes (portada y banner). Al guardar se crea un **borrador** (no visible al público) y se habilitan los demás pasos.
2. **Formulario de registro**: preguntas extra para los asistentes (texto, número, casilla, selección).
3. **Paquetes**: tipos de entrada, gratis o de pago.
4. **Tracks y sesiones**: salas/ejes y charlas con fecha, hora, ponente, nivel y temas.
5. **Cupones y staff**: códigos de invitación y personal asignado al evento.
6. **Revisar y publicar**: checklist de requisitos. Si hay errores, no se puede publicar; los avisos no bloquean.

Después, todo se edita en `/events/:id/edit` (pestañas equivalentes + Publicación).

## Reglas de validación principales

- **Evento**: título de 3 a 255 caracteres; slug en minúsculas, números y guiones simples, único, y no cambia si el evento está publicado o tiene inscritos; fecha de fin posterior al inicio; capacidad entera >= 1; si es virtual o híbrido, el enlace (http/https) es obligatorio. Las horas son de La Paz (UTC-4).
- **Imágenes**: JPG, PNG o WebP. Portada, banner y paquete hasta 2 MB; QR de pago y avatar hasta 500 KB.
- **Paquetes**: nombre obligatorio (máx. 100) y único dentro del evento; precio >= 0 con máximo 2 decimales; **precio > 0 exige QR de pago** y **precio 0 no puede tener QR**; cupo entero >= 1 o vacío (sin límite) y no menor a los inscritos. Aviso si la suma de cupos supera la capacidad del evento.
- **Fases de un paquete (preventa)**: un paquete puede venderse por fases (p. ej. Preventa → Entrada normal); la persona ve un solo paquete con el precio de la fase activa. Cada fase tiene nombre (único en el paquete), precio >= 0 con máximo 2 decimales (**precio > 0 exige QR de pago**, precio 0 no lleva QR) y cupo entero >= 1. Las fases se activan en orden: al agotar el cupo de una, pasa a la siguiente. **Solo la última fase puede quedar sin cupo** (sin límite). Un paquete que usa fases necesita al menos una. Aviso (no bloquea) si la suma de cupos de las fases supera el cupo del paquete. Cuentan para el cupo las inscripciones `CONFIRMED` y `PENDING`; `CANCELLED` libera el cupo. No se puede bajar el cupo de una fase por debajo de lo vendido ni quitar una fase con inscripciones (ni volver a "sin fases" si alguna tiene ventas). Cambiar el precio de una fase con ventas solo avisa: no afecta a quien ya se inscribió. Un paquete sin fases funciona como siempre. Al guardar con fases, el precio y el QR del paquete se igualan a los de la primera fase.
- **Tracks**: nombre obligatorio y único en el evento.
- **Sesiones**: título, fecha dentro del rango del evento, hora de inicio y fin (fin posterior), capacidad >= 1, nivel Básico/Intermedio/Avanzado (opcional), track del mismo evento. Aviso si se solapa con otra sesión del mismo track.
- **Cupones**: código de 3 a 50 caracteres, sin espacios, en MAYÚSCULAS y único por evento; usos máximos >= 1 y no menores a los ya usados; rol ATTENDEE, SPEAKER, SPONSOR o STAFF (los distintos de ATTENDEE confirman la inscripción automáticamente).
- **Formulario**: clave en snake_case y única; los campos de selección necesitan al menos 2 opciones.
- **Staff**: correo válido y no repetido en el evento.
- **Publicar** exige: datos completos (descripción, lugar, modalidad, fecha de fin), imagen de portada, al menos un paquete (con fases válidas si las usa), formulario válido y sesiones con fecha y hora completas.
- **Eliminar**: solo si el evento no tiene inscritos (la base de datos lo impide). Con inscritos, **despublicar**. Igual para sesiones con inscritos.

## Estado de las inscripciones

En **Eventos > Asistentes** (`/events/:id/attendees`) cada inscripción tiene un estado:

| Estado              | Valor en la BD | Significado                                                                        |
| ------------------- | -------------- | ---------------------------------------------------------------------------------- |
| Pagada / Confirmada | `CONFIRMED`    | Pago validado (o entrada gratuita / cupón especial). Puede hacer check-in.         |
| Pendiente de pago   | `PENDING`      | Falta validar el pago. El check-in por QR la rechaza.                              |
| Anulada             | `CANCELLED`    | No cuenta como asistente. **No puede** registrar check-in, refrigerio ni sesiones. |

- **Cambiar el estado** (solo SUPERADMIN): desde el botón de estado de cada fila (menú rápido) o desde el detalle del asistente (sección "Estado de la inscripción", junto al comprobante de pago).
- **Anular pide confirmación.** Al anular no se borra el historial: los check-ins anteriores se conservan. Una inscripción anulada se puede restaurar cambiando su estado otra vez.
- **Filtro por estado** en la barra de la tabla (Todos, Confirmados / pagados, Pendientes, Anulados), compatible con la búsqueda, el orden y la paginación. Las exportaciones siguen incluyendo a todos los inscritos.
- STAFF ve los estados y usa el filtro, pero no puede cambiarlos (la base de datos lo impide aunque se intente por la API).

## Roles

| Rol        | Puede                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SUPERADMIN | Crear, editar, publicar, despublicar y eliminar eventos; gestionar cupones, staff y fases de preventa; subir imágenes; ver asistentes, hacer check-in y cancelar inscripciones pendientes. |
| STAFF      | Ver los eventos que se le asignaron, sus asistentes y hacer check-in. No crea ni edita.                                                                                                    |

El rol se define en la tabla `staff_whitelist`; el staff se asigna a cada evento en el paso/pestaña "Cupones y staff".

## Checklist manual de pruebas end-to-end

Marcar cada punto con un usuario SUPERADMIN, salvo donde se indique.

- [ ] Iniciar sesión; el menú muestra "Super Admin".
- [ ] Crear un borrador con datos mínimos; aparece en el listado como no publicado.
- [ ] Probar errores: slug repetido, fecha de fin anterior al inicio, evento virtual sin enlace.
- [ ] Subir portada y banner válidos; probar un PDF o una imagen > 2 MB (debe rechazarse).
- [ ] Crear un paquete **gratis** (sin QR) y uno **de pago** (con QR); probar pago sin QR y gratis con QR (debe fallar).
- [ ] Crear un nombre de paquete duplicado (debe fallar).
- [ ] **Preventa (fases):** en un paquete, activar "Vender por fases": se crean "Preventa" y "Entrada normal". Poner Preventa a Bs 30 con QR y cupo 2, y Entrada normal a Bs 50 con QR y sin cupo. Guardar: la tarjeta muestra "Preventa · 0/2 (activa)" y "Entrada normal · 0 vendidos".
- [ ] Probar errores de fases: nombre repetido, cupo vacío en una fase que no es la última, cupo 0, precio con 3 decimales, precio > 0 sin QR, precio 0 con QR (se descarta solo), paquete con fases pero sin ninguna fase. Con la suma de cupos mayor al cupo del paquete debe salir solo un aviso.
- [ ] Reordenar las fases (flechas), guardar y verificar el orden; quitar y volver a agregar una fase sin ventas.
- [ ] **Preventa E2E** (con el sitio de registro `/e/<slug>`): inscribirse 2 veces (queda PENDING en la fase Preventa); en el editor cada fase muestra vendidos/restantes (Preventa 2/2, 0 restantes) y la siguiente pasa a "activa". Una tercera inscripción cae en Entrada normal con su precio y QR.
- [ ] Con Preventa agotada, intentar bajar su cupo a 1 (debe bloquear), quitarla (botón deshabilitado) y desactivar "Vender por fases" (bloqueado). Cambiar su precio solo muestra un aviso.
- [ ] En `/events/:id/attendees`, abrir una inscripción **PENDING** → "Cancelar inscripción" (pide confirmación; solo SUPERADMIN). Pasa a Cancelado, el editor muestra Preventa 1/2 y la siguiente inscripción vuelve a caer en Preventa. Una inscripción CONFIRMED no ofrece la acción.
- [ ] Un paquete sin fases se sigue comportando igual: precio y QR propios y cupo del paquete.
- [ ] Crear dos tracks y varias sesiones (con ponente, avatar, nivel y temas); verificar el aviso de solape en el mismo track.
- [ ] Configurar el formulario de registro (un campo de cada tipo, uno obligatorio).
- [ ] Crear cupones (uno ATTENDEE, uno SPEAKER con 1 uso) y asignar un correo STAFF.
- [ ] Revisar el checklist: debe bloquear si falta portada o paquete; completar y **publicar**.
- [ ] Abrir `/e/<slug>` en la app pública: se ven datos, paquetes, agenda e imágenes.
- [ ] Registrarse como asistente con un paquete gratis y con el formulario; repetir con cupón SPEAKER (queda CONFIRMED con rol SPEAKER) y con un cupón agotado (debe rechazar). Probar paquete de pago con comprobante (queda PENDING).
- [ ] En `/events/:id/attendees` aparece la inscripción.
- [ ] Marcar una inscripción pendiente como **pagada** desde el detalle y otra desde el menú de la fila; la tabla y el detalle muestran el nuevo estado sin recargar.
- [ ] **Anular**: aparece la confirmación; con "Volver" no cambia nada; al confirmar queda "Anulada". El check-in manual y por QR se rechaza. Restaurarla a pagada vuelve a permitir el check-in.
- [ ] Filtrar por cada estado; los contadores del filtro coinciden con la tabla.
- [ ] Como STAFF: no aparecen las acciones de cambio de estado.
- [ ] Con un paquete con fases (p. ej. Preventa Bs 15 → Normal Bs 20), inscribir a dos personas de modo que caigan en fases distintas: la columna **Entrada** muestra "Paquete · Fase" y el monto de **su** fase (no el del paquete). Una inscripción con cupón muestra "Cupón · Bs 0".
- [ ] En esa lista: los filtros (estado, rol, entrada/fase, check-in, comprobante) y el buscador actúan sobre todos los inscritos y "Mostrando N de M" es coherente; las tarjetas de estado filtran al hacer clic; la columna **Acciones** queda fija a la derecha al hacer scroll horizontal.
- [ ] **Revisar un pago**: "Ver pago" abre el comprobante en un diálogo (sin pestaña nueva) con nombre, paquete/fase, monto esperado y zoom; ← / → pasan al siguiente comprobante de la lista filtrada y Esc cierra. Como SUPERADMIN, "Confirmar pago" y "Cancelar inscripción" piden confirmación; como STAFF no aparecen. Un PDF o una imagen que no carga ofrecen "Abrir en pestaña" y "Descargar".
- [ ] Como STAFF asignado: ve solo su evento y hace check-in; no puede abrir `/events/new` ni editar; en un evento no asignado no ve inscritos.
- [ ] Intentar **eliminar** el evento con inscritos: se bloquea; probar también eliminar una sesión con inscritos. Despublicar y confirmar que `/e/<slug>` deja de estar disponible.
- [ ] Eliminar un borrador sin inscritos: desaparece del listado.

## Pendiente de base de datos

La migración `20261024155150_close_coupon_read_leak.sql` (cierra la lectura abierta de cupones) está **sin aplicar en producción** (PR #4, en borrador); solo debe salir después de desplegar el checkout público que usa el RPC `validate_coupon`. En tu Supabase local ya está aplicada.

Las pruebas de este checklist se hacen contra el **Supabase local** (`npm run db:start`), nunca contra producción. Ver `docs/entornos-supabase.md`.

## Revisar pagos en la lista de asistentes

Lo que ve el staff al revisar un pago pendiente (`/events/:id/attendees`):

- **Entrada**: paquete y, si el paquete vende por fases, la **fase en la que quedó inscrita la persona** (la asigna el servidor al inscribirse) con el monto de esa fase. Las inscripciones anteriores a las fases, o de paquetes sin fases, muestran el precio del paquete. Con cupón de asistente (descuento total) se muestra "Cupón · Bs 0". El mismo dato (fase, monto a pagar, cupón) va en el CSV y el Excel, que exportan lo que muestran los filtros.
- **Comprobante**: "Ver pago" abre un diálogo con la imagen grande (ajustar, acercar/alejar), a su lado el nombre, el paquete/fase, la fecha de inscripción y el **monto esperado** para compararlo con el comprobante. "Abrir en pestaña" y "Descargar" son secundarios; los PDF u otros tipos solo ofrecen el enlace.
- **Acciones (solo SUPERADMIN)**: "Confirmar pago" (pasa PENDING → CONFIRMED) y "Cancelar inscripción" (libera el cupo de la fase); ambas piden confirmación y solo operan sobre inscripciones PENDING. STAFF solo ve el comprobante.
- **Varios comprobantes**: "Anterior/Siguiente" (o las flechas del teclado) recorren los comprobantes de la lista tal como estaba filtrada al abrir el diálogo; filtrar por "Pendiente" + "Con comprobante" permite revisarlos todos de corrido.
- El check-in manual, la entrega de refrigerio y el ingreso a sesiones solo se permiten en inscripciones **confirmadas**.
