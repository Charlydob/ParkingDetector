export interface Reservation {
  reservationCode: string;
  name: string;
  email: string;
  plate: string;
  parkingValid: boolean;
  room: string;
  arrivalAt?: string;
  departureAt?: string;
  checkInAt?: string;
  checkOutAt?: string;
  nights?: number;
  reservationStatus?: string;
  parkingStartAt?: string;
  parkingEndAt?: string;
  extraFields?: Record<string, unknown>;
}

export type ReservationSourceName = "demo" | "googleSheets" | "json" | "reservationWebhook";

export interface ReservationLoadResult {
  reservations: Reservation[];
  source: ReservationSourceName;
  updatedAt: string;
  error?: string;
}
