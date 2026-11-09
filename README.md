# Los 2 Hermanos - Sistema Integral de Gestión

Sistema desarrollado para la gestión de ventas y repartos de gas, leña, carbón y alimentos.

## Arquitectura

El sistema es un monorepo que contiene las siguientes piezas de software:

- **[backend/](./backend/)**: API Principal desarrollada en **FastAPI (Python)**. Maneja la lógica de negocio, autenticación, integración con webhooks de MercadoPago y conexiones a la base de datos.
- **[web/](./web/)**: Panel de Administración y PWA desarrollado con **Next.js (TypeScript)** y Tailwind CSS. Permite gestionar clientes, productos, pedidos (con actualización de estados), control de caja, finanzas, métricas y notificaciones. Diferencia vistas por control de roles (Admin y Chofer).
- **[mobile/](./mobile/)**: Aplicación móvil para Choferes creada con **React Native y Expo (TypeScript)**.
- **[whatsapp/](./whatsapp/)**: Bot de WhatsApp automatizado para atención al cliente, utilizando **Baileys y OpenRouter** (LLMs como Llama 3). Realiza extracción de pedidos, responde consultas en lenguaje natural y procesa audios con Whisper.
- **[supabase/](./supabase/)**: Base de Datos **PostgreSQL**, incluye reglas de Row-Level Security (RLS) y migraciones del esquema.

## Despliegue y Producción

- **Infraestructura**: Los servicios (Backend, Web, Bot) están configurados para desplegarse en **Railway**, optimizados para mantener costos bajos.
- **Base de Datos**: Alojada en **Supabase** bajo el plan gratuito, cubriendo ampliamente los requerimientos de almacenamiento y base de datos relacional.
- **Pagos**: Integración lista con **MercadoPago** para procesamiento de transacciones.
- **Testing**: Se cuenta con un reporte completo de pruebas funcionales, de seguridad, costos y producción en [`TESTING_REPORT.md`](./TESTING_REPORT.md).

## Seguridad

- **Control de Roles**: Permisos granulares que evitan que choferes accedan a rutas de administración, finanzas o interactúen con pedidos asignados a otros.
- **Protección de Datos**: Row-Level Security (RLS) activado en Supabase, previniendo accesos no autorizados, y endpoints en FastAPI resguardados con dependencias de autenticación JWT.

## Mantenimiento y Backups

- **Copia de Seguridad de Supabase**: Ejecutar `python utils/backup_db.py` desde `backend/` genera un volcado JSON timestamped en la carpeta `backups/` con todas las tablas críticas (clientes, productos, pedidos, movimientos de caja, stock, etc.).
- **Supabase Keep-Alive**: Incluye un workflow de GitHub Actions en `.github/workflows/supabase_keepalive.yml` que envía un ping de actividad cada 3 días para evitar la suspensión automática por inactividad del plan gratuito.
- **Idempotencia de Pagos**: Webhooks de Mercado Pago blindados contra duplicaciones con validación de firma HMAC-SHA256 y locks a nivel de base de datos.
- **Protección Antiban WhatsApp**: Delays humanos configurados en `whatsapp/src/index.ts` y compatibilidad nativa con volúmenes persistentes (`AUTH_FOLDER`).
