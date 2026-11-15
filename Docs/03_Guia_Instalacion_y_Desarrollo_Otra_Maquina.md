# Guía Completa: Implementar y Continuar el Desarrollo en Otra Máquina

Este documento explica paso a paso cómo instalar, configurar y levantar **Huston-Wompi** en cualquier otro computador (**Linux, macOS o Windows**) para continuar el desarrollo sin fricciones.

---

## 1. Requisitos Previos en la Nueva Máquina

El proyecto fue diseñado **sin dependencias externas de `npm`** (`node_modules` no es necesario), por lo que basta con tener instalado **`git`** y **uno** de estos dos entornos de ejecución:

### Opción A (Recomendada): Instalar Deno 2.x
Incluye TypeScript nativo, validador de tipos (`deno check`) y motor SQLite integrado:

* **Linux / macOS:**
  ```bash
  curl -fsSL https://deno.land/install.sh | sh
  ```
* **Windows (PowerShell):**
  ```powershell
  irm https://deno.land/install.ps1 | iex
  ```
* Verificar instalación:
  ```bash
  deno --version
  ```

### Opción B (Alternativa): Node.js 22.6 o superior
Node.js 22.6+ soporta ejecución directa de TypeScript (`--experimental-strip-types`) y el módulo nativo `node:sqlite`:
```bash
node -v   # Debe ser >= v22.6.0
```

---

## 2. Clonar el Repositorio Privado desde GitHub

Abre una terminal en la carpeta donde guardas tus proyectos y ejecuta:

```bash
git clone https://github.com/dampinack/Huston-Wompi.git
cd Huston-Wompi
```

> **Nota de autenticación:** Como el repositorio es **Privado**, Git te pedirá usuario (`dampinack`) y contraseña. En GitHub la contraseña por terminal es un **Personal Access Token (PAT)** (generado en `GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)` con el permiso `repo`), o bien puedes iniciar sesión automáticamente si abres el proyecto desde **Antigravity IDE / VS Code**.

---

## 3. Configurar el Archivo Secreto `.env`

Por seguridad bancaria, el archivo `.env` con las llaves privadas **nunca viaja a GitHub**. En la nueva máquina debes crearlo a partir de la plantilla incluida:

```bash
cp .env.example .env
```

Abre el archivo `.env` (recuerda que en Linux los archivos que empiezan con punto están ocultos; presiona `Alt + .` en Dolphin o `Ctrl + H` en otros exploradores, o ábrelo desde el IDE) y completa las credenciales obtenidas en `https://comercios.wompi.pa` (`Desarrollo → Programadores`):

```ini
PORT=3000

# Usa "sandbox" para pruebas sin dinero real o "production" para cobros reales
WOMPI_ENV=production

# --- Si usas SANDBOX ---
WOMPI_TEST_PUBLIC_KEY=pub_test_...
WOMPI_TEST_PRIVATE_KEY=prv_test_...
WOMPI_TEST_INTEGRITY_SECRET=test_integrity_...
WOMPI_TEST_EVENTS_SECRET=test_events_...

# --- Si usas PRODUCTION (HUSTON ASSETS S.A.) ---
WOMPI_PROD_PUBLIC_KEY=pub_prod_0vsGidrn72wbGthE9BTTac9P3BXNqat7
WOMPI_PROD_PRIVATE_KEY=prv_prod_...
WOMPI_PROD_INTEGRITY_SECRET=prod_integrity_...
WOMPI_PROD_EVENTS_SECRET=prod_events_...
```

> **Nota sobre la Base de Datos SQLite:** No necesitas crear ni copiar ningún archivo `.sqlite`. Al arrancar por primera vez, el sistema crea automáticamente la carpeta `./data/` y las tablas transaccionales (`orders`, `webhook_events`, `payment_sources`).

---

## 4. Levantar la Aplicación

### Desde Terminal (Linux / macOS / Git Bash / WSL)
```bash
chmod +x start.sh

# Arranque normal
./start.sh

# Recomendado mientras programas (recarga automática al guardar cambios)
./start.sh --dev
```

### En Windows nativo (PowerShell / CMD sin Bash)
```powershell
deno task dev
# o con Node.js 22+:
npm run start:node
```

### Con `F5` desde Antigravity IDE / VS Code
El repositorio ya incluye la carpeta `.vscode/` (`launch.json`, `tasks.json` y `settings.json`):
1. Abre la carpeta raíz `Huston-Wompi` en **Antigravity IDE**.
2. Presiona **`F5`** (*Debug Pasarela Wompi*).
3. El IDE detendrá cualquier instancia previa en el puerto `3000`, levantará `src/server.ts` y conectará el depurador para usar *breakpoints* en tiempo real.

---

## 5. Verificar que Todo Funciona en la Nueva Máquina

1. Abre en tu navegador: **`http://localhost:3000/`**
2. Verifica salud y llaves configuradas:
   ```bash
   curl http://127.0.0.1:3000/api/health
   ```
3. Haz clic en el botón **Probar API Wompi en Vivo** dentro del panel web: debe responder con `"merchantName": "HUSTON ASSETS S A "` y su `acceptanceToken`.

---

## 6. Notas Importantes durante el Desarrollo

* **Conexiones desde Venezuela (`403 CloudFront` en `checkout.wompi.pa`):** El firewall de AWS CloudFront de Wompi Panamá aplica bloqueo regional de IP sobre el formulario de tarjetas (`checkout.wompi.pa`) para conexiones desde Venezuela. Si desarrollas desde allí, activa una VPN (Panamá, EE.UU. o Colombia) en el navegador para visualizar el formulario de pago.
* **Pruebas de Webhooks reales en tu PC:** Cuando quieras que Wompi envíe eventos `POST /api/webhooks/wompi` hacia tu máquina local de desarrollo, levanta un túnel HTTPS temporal (por ejemplo `ngrok http 3000` o `cloudflared tunnel --url http://localhost:3000`) y coloca esa URL pública `https://.../api/webhooks/wompi` en la sección **URL de Eventos** de `comercios.wompi.pa`.
