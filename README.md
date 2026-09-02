# Control Registro de Equipos

PWA instalable para escanear códigos, ingresar y despachar equipos.

## GitHub Pages

Publica desde la rama `main` y la carpeta `/(root)`. La dirección será:

`https://xiorigintel14.github.io/control-registro-equipos/`

## Conexión segura con Google Sheets

GitHub Pages solo aloja archivos públicos. La URL y la clave de Apps Script no deben escribirse en `index.html` ni subirse al repositorio.

La carpeta `backend` contiene un Cloudflare Worker que actúa como intermediario. Configura allí los secretos `APPS_SCRIPT_URL` y `APPS_SCRIPT_SECRET`. Después copia la dirección del Worker en `window.EQUIPMENT_CONFIG.apiBase` dentro de `index.html`.

`ALLOWED_ORIGIN` limita las solicitudes al dominio de GitHub Pages. No se guardan nombres de operadores.
