import { demoReservations } from "../data/demoReservations";
import type { Reservation } from "../types/reservation";

export async function getDemoReservations(): Promise<Reservation[]> {
  return demoReservations;
}
