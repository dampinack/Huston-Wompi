# Bitácora de Interacción, Tips Operativos y Checklist para el Cliente

Este documento conserva el resumen estructurado de la sesión de trabajo inicial entre el desarrollador y **Antigravity (Agy)**, los tips técnicos aplicados y el cuestionario listo para la reunión del lunes con el cliente (**HUSTON ASSETS S.A.**).

*(Nota de seguridad: Las contraseñas y llaves privadas compartidas o configuradas durante la sesión han sido omitidas deliberadamente de este documento para evitar filtraciones accidentales en repositorios Git. Las credenciales residen únicamente en el archivo local `.env`, excluido mediante `.gitignore`).*

---

## 1. Cronología y Hallazgos de la Sesión

1. **Solicitud Inicial:**
   * Se recibió acceso al portal de comercios `https://comercios.wompi.pa/home` con el objetivo de auditar qué estaba construido, qué faltaba y cómo completar una pasarela de pagos funcional.

2. **Auditoría del Portal Wompi Panamá (`comercios.wompi.pa`):**
   * **Pantalla `Inicio` (`/home`):** Se confirmó que el comercio **HUSTON ASSETS S A** (`shaolinco@gmail.com`) ya cuenta con verificación legal, corporativa y bancaria **100% aprobada y activa en Producción**, además de un link rápido VPOS (`https://checkout.wompi.pa/l/VPOS_uMNAaw`) y código QR.
   * **Pantalla `Desarrollo: Programadores` (`/developers`):** Se verificó que las 4 credenciales de Producción (`Llave pública`, `Llave privada`, `Secreto de Eventos`, `Secreto de Integridad`) ya estaban generadas, pero el campo **`URL de Eventos` (Webhook)** estaba vacío y el **Modo de Pruebas (Sandbox)** aún no se había activado.
   * **Diagnóstico:** Toda la tramitología bancaria con Banistmo/Wompi estaba lista, pero faltaba el 100% del desarrollo técnico e integración web.

3. **Definición de Arquitectura (Combinación Opción 1 + Opción 3):**
   * Se acordó construir un microservicio independiente en `/home/cyruslegion/Documents/DevsProjects/Wompi-Gateway` usando **TypeScript (compatible con Deno 2 y Node.js 22+) + SQLite**, capaz de:
     * Conectarse a cualquier tienda o página web existente mediante órdenes firmadas (`WidgetCheckout` y `Web Checkout`) y reenvío de confirmaciones (`callbackNotifyUrl`).
     * Operar también por **API Directa (`https://api.wompi.pa/v1`)** para generar Links de Pago dinámicos, consultar estados en vivo y procesar cobros directos/recurrentes sobre fuentes tokenizadas.

4. **Puesta en Marcha y Validación en Vivo:**
   * Se registraron las 4 credenciales en `.env` (`WOMPI_ENV=production`).
   * Se verificó `/api/health` (`publicKey`, `privateKey`, `integritySecret`, `eventsSecret` = `true`).
   * Se probó conexión real contra `https://api.wompi.pa/v1` mediante `/api/wompi/acceptance-token`, recibiendo respuesta oficial en vivo para `"HUSTON ASSETS S A "` junto con su contrato y token reglamentario de Panamá.

---

## 2. Tips Aplicados para Trabajar en Antigravity IDE y Linux

### Tip 1: Abrir el proyecto directamente en su carpeta raíz
Abre **Antigravity IDE** seleccionando como carpeta raíz (Workspace):
```text
/home/cyruslegion/Documents/DevsProjects/Wompi-Gateway
```
Al estar dentro del propio workspace del proyecto, el agente podrá editar código, correr pruebas y gestionar archivos sin pedirte confirmación manual de sandbox en cada paso.

### Tip 2: Visibilidad de archivos ocultos (`.env`, `.vscode`, `.gitignore`)
En Linux (explorador KDE Dolphin), los archivos que inician con punto están ocultos por defecto:
* Presiona **`Alt + .`** en Dolphin para mostrarlos/ocultarlos.
* En **Antigravity IDE**, aparecerán siempre visibles en el panel explorador izquierdo.

### Tip 3: Ejecución y Depuración con `F5` en Antigravity IDE
Ya quedaron configurados `.vscode/launch.json`, `.vscode/tasks.json` y `start.sh`:
* **Presionar `F5`:** Detiene automáticamente cualquier instancia previa que haya quedado ocupando el puerto `3000`, levanta `src/server.ts` con el inspector V8 adjunto y te permite poner **breakpoints (puntos de interrupción)** directamente en `src/server.ts`, `src/wompi.ts`, `src/crypto.ts` o `src/db.ts`.
* **Selector de Debug (panel Run and Debug `Ctrl+Shift+D`):**
  1. `Debug Pasarela Wompi (F5 - Deno Inspector)` -> Depuración estándar del backend.
  2. `Ejecutar con Watch / Hot-Reload (Deno)` -> Recarga automática al guardar cambios.
  3. `Full Stack: Servidor + Navegador (F5)` -> Levanta el backend y abre Chrome en `http://localhost:3000` al mismo tiempo.
* **Desde Terminal con el script `start.sh`:**
  ```bash
  bash ./start.sh           # Arranque normal
  bash ./start.sh --dev     # Modo desarrollo con auto-reload
  bash ./start.sh --restart # Reinicia limpiando procesos previos
  bash ./start.sh --debug   # Modo inspector puerto 9229
  ```

### Tip 4: Cuidado con Ambiente `PRODUCTION` vs `SANDBOX`
* Actualmente `.env` tiene `WOMPI_ENV=production` porque se cargaron las llaves `_prod_`.
* Abrir la ventana del Widget o Web Checkout **no cobra dinero**, pero ingresar una tarjeta real y confirmar **sí ejecutará un cargo real en USD**.
* **Recomendación antes de pruebas masivas:** Entrar a `comercios.wompi.pa/developers`, pulsar **"Activar modo de pruebas"**, copiar las 4 llaves `_test_` en `.env` y cambiar temporalmente a `WOMPI_ENV=sandbox`.

---

## 3. Checklist de Preguntas para el Cliente este Lunes

Para continuar con la Fase 2 del desarrollo con precisión total, consulta estos 5 puntos con el cliente el lunes:

1. **Sitio Web o Plataforma Actual:**
   * ¿Ya tienen una página web o tienda funcionando? ¿En qué tecnología está hecha (WordPress/WooCommerce, Shopify, HTML/JS a medida, React, PHP, otro) y cuál es su dominio?
2. **Modelo de Cobro:**
   * ¿Qué van a cobrar exactamente?
     * Facturas o servicios con montos variables por cliente.
     * Catálogo fijo de productos/paquetes (carrito de compras).
     * Suscripciones o cobros recurrentes mensuales automáticos.
3. **Hosting / Servidor de Despliegue:**
   * ¿Tienen ya un servidor VPS, cuenta Cloud (Google Cloud, AWS, Render, Railway, DigitalOcean) o un subdominio disponible (por ejemplo `pagos.sudominio.com`) con certificado SSL (`HTTPS`) para publicar este microservicio y registrar la `URL de Eventos` en Wompi?
4. **Después de un Pago Aprobado (`APPROVED`), ¿qué debe ocurrir automáticamente?**
   * ¿Enviar un recibo/factura por correo electrónico a `cliente` y a `shaolinco@gmail.com`?
   * ¿Activar un usuario/servicio en otra base de datos o sistema interno?
   * ¿Redirigir al comprador a una página específica de agradecimiento o descarga?
5. **Seguridad Administrativa:**
   * Confirmar si desean activar ya el **2FA (doble factor)** en `comercios.wompi.pa`, rotar la contraseña compartida inicialmente y habilitar el **Modo de Pruebas (Sandbox)** en el panel para nuestras pruebas de integración.
