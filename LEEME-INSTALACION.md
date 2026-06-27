# ByLolo Studio

## NUEVO: Botón "Registrar entrada"

En el panel principal (Studio), arriba, aparece una tarjeta con el botón
"🕘 Registrar entrada". Al tocarlo:
- Crea un registro en Supabase (tabla "attendance") con el artista y la hora.
- Muestra la hora de tu última entrada de hoy.
- Mantiene ACTIVO el proyecto en Supabase (el plan gratis se pausa tras ~7 días
  sin actividad; cada registro cuenta como actividad).

Recomendación: que cada quien toque "Registrar entrada" al llegar. Además, el uso
normal de la app (ventas, citas, etc.) ya mantiene el proyecto activo.

NOTA: este botón ayuda cuando se usa. Si el salón cerrara más de 7 días seguidos,
para garantizar al 100% que NO se pause haría falta un "ping" automático diario
(lo podemos configurar aparte con una tarea programada si lo quieres).

## Probar
1. Borra la carpeta vieja antes de descomprimir esta.
2. npm install  →  npm run dev
3. Entra con tu nombre, en el panel principal toca "Registrar entrada" y verás la
   confirmación con la hora.
