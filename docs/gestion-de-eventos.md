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
- **Tracks**: nombre obligatorio y único en el evento.
- **Sesiones**: título, fecha dentro del rango del evento, hora de inicio y fin (fin posterior), capacidad >= 1, nivel Básico/Intermedio/Avanzado (opcional), track del mismo evento. Aviso si se solapa con otra sesión del mismo track.
- **Cupones**: código de 3 a 50 caracteres, sin espacios, en MAYÚSCULAS y único por evento; usos máximos >= 1 y no menores a los ya usados; rol ATTENDEE, SPEAKER, SPONSOR o STAFF (los distintos de ATTENDEE confirman la inscripción automáticamente).
- **Formulario**: clave en snake_case y única; los campos de selección necesitan al menos 2 opciones.
- **Staff**: correo válido y no repetido en el evento.
- **Publicar** exige: datos completos (descripción, lugar, modalidad, fecha de fin), imagen de portada, al menos un paquete, formulario válido y sesiones con fecha y hora completas.
- **Eliminar**: solo si el evento no tiene inscritos (la base de datos lo impide). Con inscritos, **despublicar**. Igual para sesiones con inscritos.

## Roles

| Rol        | Puede                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| SUPERADMIN | Crear, editar, publicar, despublicar y eliminar eventos; gestionar cupones y staff; subir imágenes; ver asistentes y hacer check-in. |
| STAFF      | Ver los eventos que se le asignaron, sus asistentes y hacer check-in. No crea ni edita.                                              |

El rol se define en la tabla `staff_whitelist`; el staff se asigna a cada evento en el paso/pestaña "Cupones y staff".

## Checklist manual de pruebas end-to-end

Marcar cada punto con un usuario SUPERADMIN, salvo donde se indique.

- [ ] Iniciar sesión; el menú muestra "Super Admin".
- [ ] Crear un borrador con datos mínimos; aparece en el listado como no publicado.
- [ ] Probar errores: slug repetido, fecha de fin anterior al inicio, evento virtual sin enlace.
- [ ] Subir portada y banner válidos; probar un PDF o una imagen > 2 MB (debe rechazarse).
- [ ] Crear un paquete **gratis** (sin QR) y uno **de pago** (con QR); probar pago sin QR y gratis con QR (debe fallar).
- [ ] Crear un nombre de paquete duplicado (debe fallar).
- [ ] Crear dos tracks y varias sesiones (con ponente, avatar, nivel y temas); verificar el aviso de solape en el mismo track.
- [ ] Configurar el formulario de registro (un campo de cada tipo, uno obligatorio).
- [ ] Crear cupones (uno ATTENDEE, uno SPEAKER con 1 uso) y asignar un correo STAFF.
- [ ] Revisar el checklist: debe bloquear si falta portada o paquete; completar y **publicar**.
- [ ] Abrir `/e/<slug>` en la app pública: se ven datos, paquetes, agenda e imágenes.
- [ ] Registrarse como asistente con un paquete gratis y con el formulario; repetir con cupón SPEAKER (queda CONFIRMED con rol SPEAKER) y con un cupón agotado (debe rechazar). Probar paquete de pago con comprobante (queda PENDING).
- [ ] En `/events/:id/attendees` aparece la inscripción.
- [ ] Como STAFF asignado: ve solo su evento y hace check-in; no puede abrir `/events/new` ni editar; en un evento no asignado no ve inscritos.
- [ ] Intentar **eliminar** el evento con inscritos: se bloquea; probar también eliminar una sesión con inscritos. Despublicar y confirmar que `/e/<slug>` deja de estar disponible.
- [ ] Eliminar un borrador sin inscritos: desaparece del listado.

## Pendiente de base de datos

La migración `20261024155150_close_coupon_read_leak.sql` (cierra la lectura abierta de cupones) está **sin aplicar en producción** (PR #4, en borrador); solo debe salir después de desplegar el checkout público que usa el RPC `validate_coupon`. En tu Supabase local ya está aplicada.

Las pruebas de este checklist se hacen contra el **Supabase local** (`npm run db:start`), nunca contra producción. Ver `docs/entornos-supabase.md`.
