/*
  Shared reservation column mapping.

  Change only the values on the right if your Google Sheet or JSON uses
  different column names. Both the frontend and local backend read this file.
*/
export const RESERVATION_COLUMN_MAPPING = {
  reservationCode: "reservationCode",
  name: "name",
  email: "email",
  plate: "plate",
  parkingValid: "parkingValid",
  room: "room",
};
