# Pasarela de Pagos Wompi Panamá — HUSTON ASSETS S.A.

Microservicio completo en **TypeScript (Node.js 22+ / Deno 2)** con persistencia **SQLite** diseñado para conectar cualquier página web o tienda existente con **Wompi Panamá (`comercios.wompi.pa` / `api.wompi.pa`)**, combinando:

1. **Integración para Web/Tienda Existente (Widget y Web Checkout firmados):** Generación segura en servidor del hash `SHA-256` de integridad (`signature:integrity`), registro de órdenes con `externalOrderId`, y reenvío automático de confirmación (`callbackNotifyUrl`) hacia la web principal.
2. **Receptor Oficial de Webhooks (`POST /api/webhooks/wompi`):** Validación criptográfica timing-safe del encabezado `X-Event-Checksum` con bitácora completa de auditoría en SQLite.
3. **API Directa Wompi Panamá (`api.wompi.pa/v1`):** Endpoints listos para obtener tokens de aceptación del comercio, generar Links de Pago dinámicos por API (`POST /api/wompi/payment-links`) y ejecutar cobros directos/recurrentes sobre fuentes tokenizadas (`POST /api/wompi/direct-charge`).

---

## 1. Configuración Rápida

1. Copia el archivo de ejemplo `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```
2. En `comercios.wompi.pa/developers` (`Desarrollo -> Programadores`):
   * Haz clic en **"Activar modo de pruebas"** para obtener y pegar tus 4 llaves `test` en `.env` mientras desarrollas (`WOMPI_ENV=sandbox`).
   * Cuando pases a producción, cambia `WOMPI_ENV=production` y coloca tus secretos reales (`prv_prod_...`, `prod_integrity_...`, `prod_events_...`). La llave pública `pub_prod_0vsGidrn72wbGthE9BTTac9P3BXNqat7` ya viene preconfigurada.

---

## 2. Ejecución

Con **Deno 2** (ya instalado en este equipo):
```bash
deno task start
```
O en modo desarrollo con recarga automática:
```bash
deno task dev
```

Con **Node.js 22.6+**:
```bash
npm run start:node
```

Abre en tu navegador: **`http://localhost:3000/`** para usar la consola visual de pruebas.

---

## 3. Endpoints Principales para Conectar tu Web / Tienda Existente

| Método y Ruta | Uso |
| :--- | :--- |
| `GET /api/health` | Verifica estado del servicio, ambiente activo (`sandbox`/`production`) y llaves configuradas. |
| `POST /api/orders` | Crea una orden vinculada al `externalOrderId` de tu tienda y devuelve `{ reference, amountInCents, currency, publicKey, integritySignature }` lista para abrir `WidgetCheckout` o `Web Checkout`. |
| `GET /api/orders/:reference?sync=1` | Consulta el estado de una orden en SQLite (y con `sync=1` sincroniza en tiempo real contra `api.wompi.pa`). |
| `POST /api/wompi/payment-links` | Crea un enlace de cobro único o abierto vía API directa (`https://checkout.wompi.pa/l/...`). |
| `GET /api/wompi/acceptance-token` | Obtiene el `acceptance_token` reglamentario de Wompi Panamá para flujos por API directa. |
| `POST /api/wompi/direct-charge` | Ejecuta un cargo directo contra `/v1/transactions` usando tarjeta tokenizada o `paymentSourceId` (suscripciones/recurrencia). |
| `POST /api/webhooks/wompi` | **URL de Eventos oficial** para registrar en el panel `comercios.wompi.pa/developers` (ej: `https://pagos.tudominio.com/api/webhooks/wompi`). |
