#!/usr/bin/env bash
# ==============================================================================
# Secuencia de Arranque — Pasarela Wompi Panamá (HUSTON ASSETS S.A.)
# Modos de uso:
#   ./start.sh           -> Arranque normal
#   ./start.sh --dev     -> Arranque en desarrollo con auto-reload (--watch)
#   ./start.sh --debug   -> Arranque con inspector V8 en puerto 9229 (para F5)
#   ./start.sh --restart -> Detiene instancia previa si existe y arranca limpia
# ==============================================================================

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

MODE="${1:-normal}"

echo "================================================================"
echo " Iniciando secuencia de arranque: Wompi-Gateway"
echo " Directorio raiz: $PROJECT_DIR"
echo "================================================================"

# 1. Verificar archivo .env
if [[ ! -f ".env" ]]; then
  echo "[1/5] Archivo .env no encontrado. Creando copia desde .env.example..."
  cp .env.example .env
  echo "      IMPORTANTE: Revisa y configura tus llaves en $PROJECT_DIR/.env"
else
  echo "[1/5] Archivo .env detectado correctamente."
fi

# 2. Preparar directorio de persistencia SQLite
mkdir -p ./data
echo "[2/5] Directorio de base de datos (./data) verificado."

# 3. Liberar instancia previa del proyecto si estuviera ocupando el puerto
echo "[3/5] Verificando procesos previos de Wompi-Gateway (modo: $MODE)..."
if pgrep -f "deno.*src/server.ts" >/dev/null 2>&1 || pgrep -f "node.*src/server.ts" >/dev/null 2>&1; then
  echo "      Instancia previa detectada. Reiniciando limpiamente..."
  pkill -f "Wompi-Gateway/src/server.ts" 2>/dev/null || true
  pkill -f "deno.*src/server.ts" 2>/dev/null || true
  pkill -f "node.*src/server.ts" 2>/dev/null || true
  sleep 0.4
fi

# 4. Detectar runtime disponible (Deno 2 preferido en este entorno, o Node.js 22+)
if command -v deno >/dev/null 2>&1; then
  echo "[4/5] Verificando tipos TypeScript con Deno..."
  deno check src/server.ts

  echo "[5/5] Levantando microservicio con Deno..."
  case "$MODE" in
    --dev)
      exec deno run --watch --allow-net --allow-read --allow-write --allow-env src/server.ts
      ;;
    --debug)
      exec deno run --inspect-wait=127.0.0.1:9229 --allow-net --allow-read --allow-write --allow-env src/server.ts
      ;;
    *)
      exec deno run --allow-net --allow-read --allow-write --allow-env src/server.ts
      ;;
  esac
elif command -v node >/dev/null 2>&1; then
  echo "[4/5] Deno no detectado; usando Node.js ($(node -v))..."
  echo "[5/5] Levantando microservicio con Node.js..."
  case "$MODE" in
    --debug)
      exec node --inspect-brk=127.0.0.1:9229 --experimental-strip-types src/server.ts
      ;;
    *)
      exec node --experimental-strip-types src/server.ts
      ;;
  esac
else
  echo "[ERROR] No se encontro 'deno' ni 'node' (>=22.6) en el PATH del sistema."
  exit 1
fi
