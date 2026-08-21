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
  arrivalAt: "arrivalAt",
  departureAt: "departureAt",
  checkInAt: "checkInAt",
  checkOutAt: "checkOutAt",
  nights: "nights",
  reservationStatus: "reservationStatus",
  parkingStartAt: "parkingStartAt",
  parkingEndAt: "parkingEndAt",
};

export const RESERVATION_MAPPING_FIELDS = [
  { key: "reservationCode", label: "Reservation Number", group: "Core" },
  { key: "name", label: "Full Name", group: "Optional" },
  { key: "email", label: "Email", group: "Optional" },
  { key: "plate", label: "License Plate", group: "Optional" },
  { key: "room", label: "Room", group: "Optional" },
  { key: "parkingValid", label: "Parking Valid", group: "Optional" },
  { key: "arrivalAt", label: "Arrival Date", group: "Optional" },
  { key: "departureAt", label: "Departure Date", group: "Optional" },
  { key: "checkInAt", label: "Check-In Date", group: "Optional" },
  { key: "checkOutAt", label: "Check-Out Date", group: "Optional" },
  { key: "nights", label: "Nights", group: "Optional" },
  { key: "reservationStatus", label: "Reservation Status", group: "Optional" },
  { key: "parkingStartAt", label: "Parking Start", group: "Optional" },
  { key: "parkingEndAt", label: "Parking End", group: "Optional" },
];
