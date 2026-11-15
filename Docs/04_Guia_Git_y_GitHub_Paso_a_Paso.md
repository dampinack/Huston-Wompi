# Guía Práctica de Git y GitHub: Desde Cero y en el Día a Día

Esta guía documenta tanto **cómo subir un proyecto desde el principio a GitHub** (tal como hicimos con `Huston-Wompi`) como **la rutina exacta de comandos para subir cada nuevo cambio** que realices durante el desarrollo.

---

## Parte 1: Cómo Subir un Proyecto a GitHub desde el Principio (Paso a Paso)

### Paso 1. Proteger secretos con `.gitignore` (¡Siempre antes de empezar!)
Antes de agregar archivos a Git, asegúrate de tener un archivo `.gitignore` en la raíz del proyecto que excluya contraseñas, llaves privadas y bases de datos locales:
```gitignore
.env
.env.*
!.env.example
data/*.sqlite*
node_modules/
```

### Paso 2. Inicializar Git en la carpeta del proyecto
Desde la terminal, ubicado en la raíz de tu proyecto:
```bash
# 1. Inicializar repositorio local usando 'main' como rama principal
git init -b main

# 2. Configurar tu nombre y correo de GitHub
git config user.name "dampinack"
git config user.email "llinasalfonso@gmail.com"
```
*(Tip: Si agregas `--global` después de `git config`, quedará configurado para todos los proyectos de esa máquina).*

### Paso 3. Preparar y guardar la primera versión local (`commit`)
```bash
# 1. Preparar todos los archivos permitidos
git add .

# 2. Verificar SIEMPRE qué archivos van a subir (confirmar que NO aparezca .env)
git status

# 3. Guardar la instantánea inicial con un mensaje descriptivo
git commit -m "feat: version inicial pasarela Wompi Panama"
```

### Paso 4. Crear el repositorio vacío en GitHub
1. Entra en tu navegador a **`https://github.com/new`**.
2. Escribe el nombre del repositorio (ej. `Huston-Wompi`).
3. Elige visibilidad:
   * **Private:** Acceso exclusivo solo para ti y las personas que invites en `Settings → Collaborators → Add people`.
   * **Public:** Visible para cualquier persona en internet (aunque solo tú puedes editarlo).
4. **Deja desmarcadas** las opciones *"Add a README"*, *"Add .gitignore"* y *"Choose a license"* (porque tu proyecto local ya los tiene).
5. Haz clic en **Create repository**.

### Paso 5. Conectar tu carpeta local con GitHub y subir el código
```bash
# 1. Enlazar el repositorio remoto bajo el nombre 'origin'
git remote add origin https://github.com/dampinack/Huston-Wompi.git

# 2. Subir la rama 'main' y dejarla vinculada (-u) para el futuro
git push -u origin main
```

---

## Parte 2: Cómo Subir Cada Cambio Nuevo que Hagas en Adelante

Cada vez que modifiques código, agregues pantallas o actualices documentación, sigue siempre este ciclo corto de **4 pasos**:

### 1. (Si trabajas en más de una máquina) Traer primero los últimos cambios
Antes de empezar a programar del día, descarga lo último que hayas subido desde otra PC:
```bash
git pull origin main
```

### 2. Revisar qué modificaste
```bash
git status
```
* En rojo verás los archivos modificados o nuevos sin preparar.
* Si quieres ver línea por línea qué cambió dentro del código:
  ```bash
  git diff
  ```

### 3. Preparar y registrar el cambio (`add` + `commit`)
```bash
# Agregar todos los cambios realizados
git add .

# (O si solo quieres subir archivos específicos:)
# git add src/server.ts Docs/mi_documento.md

# Crear el commit explicando brevemente qué hiciste
git commit -m "feat: integracion de cobro para tienda del cliente"
```

> **Convención recomendada para mensajes de commit:**
> * `feat: ...` -> cuando agregas una función o pantalla nueva.
> * `fix: ...` -> cuando corriges un error o descuadre visual.
> * `docs: ...` -> cuando actualizas archivos Markdown o capturas.
> * `chore: ...` -> ajustes de configuración o scripts.

### 4. Subir a GitHub (`push`)
Como ya vinculamos la rama con `-u` la primera vez, ahora basta con escribir:
```bash
git push
```

---

## Parte 3: Comandos Rápidos de Consulta y Emergencia

| Qué necesitas hacer | Comando |
| :--- | :--- |
| Ver el historial compacto de versiones subidas | `git log --oneline -n 10` |
| Ver a qué URL de GitHub está conectado el proyecto | `git remote -v` |
| Descartar cambios no guardados en un archivo y volver al último commit | `git restore ruta/del/archivo.ts` |
| Quitar un archivo que agregaste con `git add` por error (sin borrarlo del disco) | `git restore --staged ruta/del/archivo` |
| Crear una rama aparte para probar algo experimental sin tocar `main` | `git switch -c prueba-nueva-funcion` |
| Volver a la rama principal `main` | `git switch main` |
