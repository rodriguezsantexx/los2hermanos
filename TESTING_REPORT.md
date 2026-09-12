# 🧪 Reporte de Testeo Final — Los 2 Hermanos

**Fecha:** 2026-09-11
**Alcance:** Funcionalidad, Seguridad, Costos, Builds y Producción.

---

## 1. Resumen ejecutivo

| Área | Estado | Hallazgos críticos |
|------|--------|--------------------|
| Funcionalidad backend | ✅ Funciona | Flujo login, roles, pedidos, finanzas OK |
| Funcionalidad web | ✅ Compila | Build OK (23 páginas + PWA) |
| Funcionalidad bot | ⚠️ Roto en web | URL del bot desactualizada en la web |
| Funcionalidad mobile | ✅ Compila | tsc 0 errores |
| Seguridad | ⚠️ 4 hallazgos | Ver sección 3 |
| Costos | ✅ Bajo | ~$0.84/mes Railway, Supabase free |
| Producción | ⚠️ 2 problemas | Bot URL + bot desvinculado |

---

## 2. Funcionalidad

### 2.1 Backend (FastAPI) — probado en local y producción

| Test | Resultado |
|------|-----------|
| Import del backend | ✅ OK (11 rutas) |
| `GET /` | ✅ 200 |
| Login credenciales inválidas | ✅ 401 |
| Login body vacío | ✅ 422 (validación Pydantic) |
| Login usuario real (temporal) | ✅ Token obtenido |
| `GET /api/pedidos/` con token | ✅ 200 |
| `GET /api/finanzas/caja/resumen` con token | ✅ 200 |
| `GET /api/finanzas/caja/gastos` con token | ✅ 200 |
| `GET /api/finanzas/metricas/resumen` con token | ✅ 200 |
| `POST /api/notificaciones/suscripcion` con token | ✅ 200 |
| `POST /api/pedidos/bot` (flujo WhatsApp) | ✅ 200 (crea pedido) |
| Webhook MP pago falso | ✅ 200 "ok" sin procesar |
| Webhook MP sin payment_id | ✅ 200 "ok" |
| Redirect trailing slash HTTPS (prod) | ✅ `location: https://...` |

### 2.2 Control de roles

| Test | Resultado |
|------|-----------|
| Chofer → endpoint admin (`/api/finanzas/caja/resumen`) | ✅ 403 |
| Chofer → `/api/finanzas/metricas/resumen` | ✅ 403 |
| Chofer → `/api/finanzas/pagos` | ✅ 403 |
| Chofer → `/api/finanzas/caja/cierre` | ✅ 403 |
| Chofer ve solo sus pedidos | ✅ Correcto |
| Chofer ve solo sus gastos | ✅ Correcto |
| Chofer intenta entregar pedido de otro chofer | ✅ 403 (bien) |

### 2.3 Builds

| Proyecto | Resultado |
|----------|-----------|
| Web (`next build`) | ✅ Compila, 23 páginas, PWA 62 precache entries |
| Web (`eslint`) | ⚠️ 64 problemas (42 errores, 22 warnings) — pre-existentes, no bloquean |
| Bot WhatsApp (`tsc`) | ✅ 0 errores |
| Mobile (`tsc --noEmit`) | ✅ 0 errores |

### 2.4 Producción (Railway)

| Endpoint | Resultado |
|----------|-----------|
| Web `https://los2hermanos.up.railway.app/` | ✅ 200 |
| Web `/manifest.json` | ✅ 200 |
| Web `/serwist/sw.js` | ✅ 200 |
| Web `/login` | ✅ 200 (UI renderiza) |
| Backend `https://backend-production-af7b3.up.railway.app/` | ✅ 200 |
| Backend `/api/pedidos/` sin token | ✅ 401 |
| **Bot `https://bot-production-90fd.up.railway.app`** | ❌ **404 "Application not found"** |
| **Bot `https://bot-production-2b1a.up.railway.app`** | ✅ 200, pero status `qr` (desvinculado) |

---

## 3. Seguridad

### 🔴 CRÍTICO 1: Service Role Key commiteada en git
- **Archivo:** `whatsapp/test_db.js` (y anon key en `test_anon.js`)
- **Detalle:** La service role key de Supabase está hardcodeada y commiteada desde el commit `173c9d1` (2026-08-23). El repo está en `github.com/rodriguezsantexx/los2hermanos`.
- **Riesgo:** Quien tenga acceso al repo puede leer/escribir TODA la base (la service role key bypasea RLS).
- **Fix:**
  1. Reemplazar las claves de los archivos de test por variables de entorno.
  2. **Rotar la service role key** en Supabase (Dashboard → Settings → API Keys → Rotate).
  3. Si el repo es público, considerar hacerlo privado.

### 🔴 CRÍTICO 2: Endpoints de productos y clientes SIN autenticación
- **Archivos:** `backend/api/productos.py`, `backend/api/clientes.py`
- **Detalle:** `GET/POST/PUT/DELETE /api/productos/*` y `GET/POST/PUT /api/clientes/*` NO requieren token (marcados "Temporalmente libre para desarrollo frontend"). Verificado en **producción**: `GET /api/productos/` → 200 sin token.
- **Riesgo:** Cualquiera con la URL puede crear/borrar productos, modificar stock, crear/editar clientes.
- **Fix:** Agregar `Depends(get_current_user)` o `admin_required` a todos esos endpoints.

### 🔴 CRÍTICO 3: `actualizar_estado` sin control de propiedad
- **Archivo:** `backend/api/pedidos.py`
- **Detalle:** `POST /api/pedidos/{id}/estado` permite a CUALQUIER usuario autenticado poner "En reparto" un pedido de OTRO chofer. **Verificado:** un chofer de prueba cambió un pedido ajeno → HTTP 200.
- **Riesgo:** Un chofer puede interferir con los pedidos de otro (marcarlos en reparto, confundir el flujo).
- **Fix:** Validar `pedido.chofer_id == current_user.id` o rol ADMIN, igual que hace `entregar_pedido`.

### 🟡 MEDIO 4: CORS abierto
- **Archivo:** `backend/main.py` — `allow_origins=["*"]`
- **Detalle:** Con `allow_credentials=False` el riesgo es bajo, pero para una app privada conviene restringir a los dominios reales (`https://los2hermanos.up.railway.app`).

### 🟡 MEDIO 5: Políticas anon muy permisivas
- **Migraciones:** `00006` y `00008`
- **Detalle:** Con la clave anon (pública en el bundle de la web) se puede:
  - Leer todos los `whatsapp_chats`, `whatsapp_mensajes`, `clientes`, `notificaciones`
  - **Modificar** `whatsapp_chats` (modo_ia) y `notificaciones` (marcar leídas / alterar)
- **Riesgo:** Bajo para un negocio de ~10 personas, pero es data sensible (chats de clientes).
- **Fix (opcional):** Restringir las políticas UPDATE a solo lo necesario, o usar el backend como intermediario.

### ✅ Verificaciones de seguridad que PASARON
- RLS habilitado en todas las tablas (migración 00008 aplicada).
- Con clave anon: `productos`, `pedidos`, `usuarios`, `movimientos_caja`, `localidades` → bloqueados (0 filas).
- Webhook MP re-valida contra la API de MP (pago falso no se procesa).
- `entregar_pedido` valida propiedad (403 para chofer ajeno).
- Login con credenciales inválidas → 401.
- `.env` correctamente ignorado por git (`.gitignore`).

---

## 4. Costos

### 4.1 Railway
- **Servicios:** 3 (web, backend, bot) — todos Online, región `iad`.
- **Uso actual:** $0.74 (período 4–12 sep 2026)
- **Estimado:** ~$0.84/mes
- **Nota:** Muy bajo; probablemente dentro del plan gratuito/hobby o uso mínimo.

### 4.2 Supabase
- **Datos:** 28 productos, 11 clientes, 17 pedidos, 328 mensajes WhatsApp, 18 movimientos caja.
- **Estimación:** Bien dentro del **free tier** (500MB DB, 1GB storage, 50K MAU).
- **Nota:** No se pudo consultar el uso exacto (sin token de acceso), pero el volumen es mínimo.

### 4.3 Mercado Pago
- **Ventas actuales:** 0 por MercadoPago (todo Efectivo/Transferencia).
- **Costo:** Solo se paga comisión (~3.49% + IVA en AR) cuando hay ventas por MP. Hoy $0.

### 4.4 IA del bot (OpenRouter / Groq)
- **Chat principal:** `meta-llama/llama-3.1-8b-instruct:free` → **GRATIS**.
- **Extracción de pedidos:** `openai/gpt-oss-120b` → **pago**, pero uso bajo (solo al extraer pedidos del historial). Costo estimado: fracciones de centavo por extracción.
- **Whisper (audio):** Groq free tier.

### 4.5 Resumen de costos
| Concepto | Costo estimado |
|----------|----------------|
| Railway | ~$0.84/mes |
| Supabase | $0 (free tier) |
| Mercado Pago | $0 (sin ventas MP aún) |
| IA bot | ~$0 (modelo free + uso bajo) |
| **Total** | **~$1/mes** |

---

## 5. Acciones recomendadas (prioridad)

### ✅ YA CORREGIDO (2026-09-11)
1. **URL del bot actualizada** en `web/.env.production` y `web/.env.local` → `bot-production-2b1a`. También actualizada en Railway (`railway variables --set NEXT_PUBLIC_BOT_URL --service web`). **Pendiente: redeploy de la web en Railway.**
2. **Service role key quitada** de `whatsapp/test_db.js` y `whatsapp/test_anon.js` (ahora usan variables de entorno). Se agregó `SUPABASE_SERVICE_ROLE_KEY` a `whatsapp/.env` (gitignored) y se creó `whatsapp/.gitignore`. **Pendiente: rotar la service role key en Supabase** (quedó en el historial de git).
3. **Autenticación agregada** a `/api/productos/*` y `/api/clientes/*`:
   - GET → `get_current_user` (cualquier usuario logueado)
   - POST/PUT/DELETE productos → `admin_required` (solo admin)
   - La web se actualizó para enviar el Bearer token en las llamadas GET (chat, clientes, pedidos, stock).
4. **Fix `actualizar_estado`**: ahora valida que el usuario sea el chofer asignado o ADMIN (403 si no).
5. **CORS restringido** a `https://los2hermanos.up.railway.app` + `localhost:3000/3005`.

### 🔴 Pendientes (requieren acción manual)
6. **Redeploy backend + web en Railway** para aplicar los fixes en producción.
7. **Rotar la service role key** en Supabase (Dashboard → Settings → API Keys → Rotate).
8. **Re-vincular el bot de WhatsApp** (está en status `qr`): usar el pairing code desde la web (una vez redeployada) o el QR.

### 🟡 Opcionales
9. Limpiar los 64 problemas de lint de la web (no bloquean).
10. Restringir políticas anon de UPDATE en `whatsapp_chats` y `notificaciones`.
11. Configurar `turbopack.root` en `next.config.ts` para eliminar el warning del package-lock.

---

## 6. Notas del testeo
- Todos los datos de prueba (usuarios temporales, pedido de prueba, suscripción push) fueron **eliminados** tras el testeo.
- El pedido usado para verificar el bug de `actualizar_estado` fue **restaurado** a su estado original.
- El backend local se levantó en `127.0.0.1:8000` para las pruebas y se detuvo al finalizar.