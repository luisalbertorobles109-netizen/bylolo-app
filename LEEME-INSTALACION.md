# ByLolo Studio

## ARREGLADO: la báscula queda sincronizada desde el inicio

ANTES: al llegar a la pantalla de pesar, el peso no se movía y tenías que
regresar y volver a entrar para que empezara a pesar.

CAUSA: la pantalla leía el peso de una forma que no se actualizaba en vivo.

AHORA:
- Conecta la báscula UNA sola vez con el chip "⚖ Conectar báscula" que aparece
  abajo a la izquierda en cuanto fichas como artista. (Web Bluetooth exige un
  toque la primera vez; es una regla del navegador, no se puede evitar.)
- Una vez conectada, queda sincronizada en TODAS las pantallas y durante todo el
  servicio. Al llegar a pesar, ya está leyendo en vivo (la gota se llena sola).
- Si la báscula se duerme o se aleja, se reconecta automáticamente.
- Al reabrir la app, intenta reconectarse sola a la báscula ya emparejada.

Recomendación: en cuanto entres con tu nombre, toca el chip de abajo a la izquierda
para conectar la SKALE 2. Así ya no tienes que conectarla en cada pesaje.

Nota: funciona en Chrome de Android o PC. Los iPad no soportan Web Bluetooth.

## Probar
1. Borra la carpeta vieja antes de descomprimir esta.
2. npm install  →  npm run dev
3. Ficha como artista, toca "⚖ Conectar báscula" (abajo izquierda), entra a Barra de
   Color o Servicios y llega a pesar: el peso ya se mueve solo.
