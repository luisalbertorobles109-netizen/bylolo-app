# ByLolo Studio

## NUEVO: Gestión de equipo (panel de Admin)
Entra como Admin → estación "Equipo". Desde ahí el Admin puede:
- CREAR miembros nuevos escribiendo solo su nombre (sin correo ni contraseña).
- Elegir su ROL (Artista o Admin) y su color de acento.
- Activar o desactivar PIN por persona (tú decides quién pide PIN al ficharse).
- Cambiar el PIN de cada quien.
- OCULTAR módulos por artista (ej. ocultar "Barra de Color" a la artista de uñas).
- Activar/desactivar miembros (los inactivos no aparecen en el panel de selección).

Solo el Admin puede crear, activar/desactivar o cambiar PINs.

## Recordatorio de acceso
- El dispositivo (tablet) inicia sesión UNA vez con la cuenta del salón (que debe ser ADMIN, p.ej. alberto@bylololabs.com).
- Después entra directo al panel de selección de artista.
- Cada artista solo ve SUS ventas en Finanzas. El Admin ve todo y por artista.

## Seguridad
- Los PINs están protegidos en la base de datos (no se pueden leer desde la app).
- Las "llaves" del salón son: la contraseña de la cuenta del dispositivo y los PINs. Cuídalas.

## Probar
1. Borra la carpeta vieja antes de descomprimir esta.
2. cmd dentro de la carpeta:  npm install  →  npm run dev
3. http://localhost:5173/  →  Ctrl+Shift+R

> Tu app en línea: https://bylolo-app.vercel.app
