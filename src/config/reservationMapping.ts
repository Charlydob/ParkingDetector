/*
  Mapeo de columnas de reservas.

  Cambia SOLO los textos de la derecha si tu Google Sheet o JSON usa otros
  nombres de columna. El resto de la aplicacion seguira funcionando igual.

  Ejemplo:
  export const RESERVATION_COLUMN_MAPPING = {
    reservationCode: "Booking ID",
    name: "Guest",
    email: "Mail",
    plate: "Kennzeichen",
    parkingValid: "Parking",
    room: "Zimmer",
  };
*/
export const RESERVATION_COLUMN_MAPPING = {
  reservationCode: "reservationCode",
  name: "name",
  email: "email",
  plate: "plate",
  parkingValid: "parkingValid",
  room: "room",
} as const;
