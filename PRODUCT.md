# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Organizadores de GDG Tarija (rol SUPERADMIN): crean, configuran y publican eventos, revisan pagos y gestionan inscripciones. Usan laptop y también el celular para tareas rápidas (revisar un pago, ver inscritos).
- Staff de eventos (rol STAFF): hacen check-in por QR o manual, entregan refrigerio y registran ingreso a sesiones el día del evento, desde el celular; consultan asistentes de los eventos asignados.

## Product Purpose

Back-office para operar los eventos de la comunidad GDG Tarija de punta a punta: configuración del evento (datos, formulario de registro, paquetes con fases de preventa, tracks y sesiones, cupones, staff), publicación, revisión de pagos e inscripciones, y control de asistencia. Éxito: un organizador publica un evento sin bloqueos y el staff registra ingresos rápido y sin errores.

## Operating Context

El sitio público de registro vive en eventos-gdg-tarija (`/e/<slug>`). Moneda: bolivianos (Bs). Horario de La Paz (UTC-4). Pagos por QR con comprobante subido por el asistente. Check-in en la puerta con celulares del staff.

## Capabilities and Constraints

Angular 21 + PrimeNG 21 (Aura) + Tailwind v4 sobre Supabase. Roles por `staff_whitelist`; la base (RLS) impone los permisos. Terminología: paquete, fase (preventa), cupón, track, sesión, inscripción (Confirmada / Pendiente de pago / Anulada), check-in, refrigerio.

## Brand Commitments

Identidad GDG / Google (colores Google, Google Sans). Interfaz en español.

## Product Principles

- Nunca perder el trabajo del organizador.
- El staff en la puerta resuelve cada ingreso en segundos, con una mano.
- Un mismo concepto tiene un solo nombre en toda la app.
- Los errores dicen qué pasó y cómo seguir, en español.

## Accessibility & Inclusion

WCAG 2.1 AA en flujos principales; uso táctil en celular.
