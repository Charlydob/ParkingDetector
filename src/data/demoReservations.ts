import type { Reservation } from "../types/reservation";
import { normalizePlate } from "../utils/normalizePlate";

const rawDemoReservations: Reservation[] = [
  {
    reservationCode: "R001",
    name: "Carlos Garcia",
    email: "carlos@example.com",
    plate: "BE123456",
    parkingValid: true,
    room: "109",
  },
  {
    reservationCode: "R002",
    name: "Anna Muller",
    email: "anna@example.com",
    plate: "ZH987654",
    parkingValid: false,
    room: "204",
  },
  {
    reservationCode: "R003",
    name: "Marta Lopez",
    email: "marta@example.com",
    plate: "M-4455-ZX",
    parkingValid: true,
    room: "312",
  },
  {
    reservationCode: "R004",
    name: "Jonas Meier",
    email: "jonas@example.com",
    plate: "LU 882233",
    parkingValid: false,
    room: "117",
  },
];

export const demoReservations = rawDemoReservations.map((reservation) => ({
  ...reservation,
  plate: normalizePlate(reservation.plate),
}));
