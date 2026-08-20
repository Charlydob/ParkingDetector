export interface Reservation {
  reservationCode: string;
  name: string;
  email: string;
  plate: string;
  parkingValid: boolean;
  room: string;
}

export type ReservationSourceName = "demo" | "googleSheets" | "json";

export interface ReservationLoadResult {
  reservations: Reservation[];
  source: ReservationSourceName;
  updatedAt: string;
  error?: string;
}
