# Parking Detector - Configuracion

Esta guia explica como cambiar la fuente de reservas sin tocar el resto de la aplicacion.

## Archivo `.env`

Crea un archivo llamado `.env` en la raiz del proyecto. No lo subas a GitHub.

Ejemplo para modo demo:

```env
VITE_RESERVATION_SOURCE=demo

VITE_FIREBASE_API_KEY=AIzaSyAZ3tJfi-wyW11OWJLpBx2I1rFKr9gTq7Q
VITE_FIREBASE_AUTH_DOMAIN=parkingdetector-4ac76.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://parkingdetector-4ac76-default-rtdb.europe-west1.firebasedatabase.app/
VITE_FIREBASE_PROJECT_ID=parkingdetector-4ac76
VITE_FIREBASE_STORAGE_BUCKET=parkingdetector-4ac76.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=141696751478
VITE_FIREBASE_APP_ID=1:141696751478:web:c81807bec8e141c1480c57
```

La configuracion publica de Firebase de una app web no es una contrasena. Aun asi, las reglas de la base de datos son las que protegen los datos.

## Modo Demo

Usa esta opcion para probar la aplicacion sin Google Sheets, JSON ni Frigate.

```env
VITE_RESERVATION_SOURCE=demo
```

La app cargara reservas de ejemplo y el boton `Simular deteccion` guardara detecciones reales en Firebase Realtime Database.

## Usar Google Sheets

Publica la hoja como CSV y copia la URL publica.

Despues configura:

```env
VITE_RESERVATION_SOURCE=googleSheets
VITE_GOOGLE_SHEET_URL=https://docs.google.com/spreadsheets/d/e/TU_HOJA/pub?output=csv
```

La primera fila debe contener los nombres de columnas.

## Cambiar Google Sheet

Solo cambia esta linea:

```env
VITE_GOOGLE_SHEET_URL=https://docs.google.com/spreadsheets/d/e/NUEVA_HOJA/pub?output=csv
```

## Cambiar Nombres De Columnas

Edita unicamente este archivo:

```text
src/config/reservationMapping.ts
```

Si tu hoja usa estas columnas:

```text
Booking ID | Guest | Mail | Kennzeichen | Parking | Zimmer
```

deja el archivo asi:

```ts
export const RESERVATION_COLUMN_MAPPING = {
  reservationCode: "Booking ID",
  name: "Guest",
  email: "Mail",
  plate: "Kennzeichen",
  parkingValid: "Parking",
  room: "Zimmer",
};
```

No hace falta modificar componentes, servicios ni ninguna otra parte del codigo.

## Usar JSON

El JSON puede estar en un archivo local publicado junto a la app o en un endpoint remoto.

```env
VITE_RESERVATION_SOURCE=json
VITE_RESERVATION_JSON_URL=https://example.com/reservas.json
```

Ejemplo de JSON:

```json
[
  {
    "reservationCode": "R001",
    "name": "Carlos Garcia",
    "email": "carlos@example.com",
    "plate": "BE123456",
    "parkingValid": true,
    "room": "109"
  },
  {
    "reservationCode": "R002",
    "name": "Anna Muller",
    "email": "anna@example.com",
    "plate": "ZH987654",
    "parkingValid": false,
    "room": "204"
  }
]
```

Si el endpoint JSON usa otros nombres de campo, cambia el mismo mapeo de columnas en `src/config/reservationMapping.ts`.

## Valores Booleanos De Parking

La columna `parkingValid` acepta:

```text
true, false, yes, no, si, 1, 0
```

La aplicacion tambien ignora espacios y guiones en matriculas. Por ejemplo, estas tres formas coinciden:

```text
BE 123 456
BE-123456
be123456
```

## Firebase Realtime Database

La app usa esta ruta:

```text
detections/
```

Cada simulacion o futura deteccion de Frigate crea un nuevo registro en Firebase Realtime Database.

## Reglas De Seguridad Firebase

Las reglas en modo test son solo para desarrollo. No dejes la Realtime Database abierta en produccion.

Ejemplo de reglas abiertas solo para pruebas:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

Antes de produccion, endurece estas reglas para limitar lectura y escritura. Firebase Authentication no esta implementado todavia, asi que la proteccion final debe definirse antes de usar datos reales de huespedes.

## GitHub Pages

El repositorio incluye:

```text
.github/workflows/deploy.yml
```

Al hacer push a `main`, GitHub Actions instala dependencias, ejecuta el build y publica `dist` en GitHub Pages.

En GitHub, revisa una vez:

```text
Settings -> Pages -> Build and deployment -> Source -> GitHub Actions
```
