export type Locale = "en" | "de" | "es" | "fr" | "it";

export const LOCALES: Array<{ id: Locale; label: string }> = [
  { id: "en", label: "English" },
  { id: "de", label: "Deutsch" },
  { id: "es", label: "Espanol" },
  { id: "fr", label: "Francais" },
  { id: "it", label: "Italiano" },
];

type TranslationKey =
  | "appName"
  | "checkOut"
  | "hotelCheckout"
  | "scanInstruction"
  | "scanKey"
  | "scanning"
  | "readyTitle"
  | "readyBody"
  | "room"
  | "confirmCheckout"
  | "completed"
  | "completedBody"
  | "duplicate"
  | "invalidQr"
  | "deactivatedQr"
  | "networkError"
  | "checkoutUnavailable"
  | "cameraError"
  | "language";

const translations: Record<Locale, Record<TranslationKey, string>> = {
  en: {
    appName: "Hotel checkout",
    checkOut: "Check out",
    hotelCheckout: "Hotel checkout",
    scanInstruction: "Scan the QR code on the back of your key.",
    scanKey: "Scan key",
    scanning: "Scanning QR",
    readyTitle: "Ready to check out?",
    readyBody: "Please make sure the room is empty and you haven't left anything behind.",
    room: "Room",
    confirmCheckout: "Confirm checkout",
    completed: "Checkout completed",
    completedBody: "You can leave your key at reception.",
    duplicate: "Checkout already received recently.",
    invalidQr: "This QR code is invalid.",
    deactivatedQr: "This QR code has been deactivated.",
    networkError: "Network error. Please try again.",
    checkoutUnavailable: "Checkout is not available.",
    cameraError: "Could not start the camera.",
    language: "Language",
  },
  de: {
    appName: "Hotel-Checkout",
    checkOut: "Auschecken",
    hotelCheckout: "Hotel-Checkout",
    scanInstruction: "Scannen Sie den QR-Code auf der Rueckseite Ihres Schluessels.",
    scanKey: "Schluessel scannen",
    scanning: "QR wird gescannt",
    readyTitle: "Bereit zum Auschecken?",
    readyBody: "Bitte stellen Sie sicher, dass das Zimmer leer ist und Sie nichts vergessen haben.",
    room: "Zimmer",
    confirmCheckout: "Checkout bestaetigen",
    completed: "Checkout abgeschlossen",
    completedBody: "Sie koennen den Schluessel an der Rezeption abgeben.",
    duplicate: "Checkout wurde kuerzlich bereits empfangen.",
    invalidQr: "Dieser QR-Code ist ungueltig.",
    deactivatedQr: "Dieser QR-Code wurde deaktiviert.",
    networkError: "Netzwerkfehler. Bitte versuchen Sie es erneut.",
    checkoutUnavailable: "Checkout ist nicht verfuegbar.",
    cameraError: "Die Kamera konnte nicht gestartet werden.",
    language: "Sprache",
  },
  es: {
    appName: "Checkout del hotel",
    checkOut: "Checkout",
    hotelCheckout: "Checkout del hotel",
    scanInstruction: "Escanea el codigo QR del reverso de tu llave.",
    scanKey: "Escanear llave",
    scanning: "Escaneando QR",
    readyTitle: "Listo para hacer checkout?",
    readyBody: "Asegurate de que la habitacion este vacia y de no haber olvidado nada.",
    room: "Habitacion",
    confirmCheckout: "Confirmar checkout",
    completed: "Checkout completado",
    completedBody: "Puedes dejar la llave en recepcion.",
    duplicate: "El checkout ya se recibio recientemente.",
    invalidQr: "Este codigo QR no es valido.",
    deactivatedQr: "Este codigo QR esta desactivado.",
    networkError: "Error de red. Intentalo de nuevo.",
    checkoutUnavailable: "El checkout no esta disponible.",
    cameraError: "No se pudo iniciar la camara.",
    language: "Idioma",
  },
  fr: {
    appName: "Checkout hotel",
    checkOut: "Depart",
    hotelCheckout: "Checkout hotel",
    scanInstruction: "Scannez le QR code au dos de votre cle.",
    scanKey: "Scanner la cle",
    scanning: "Scan du QR",
    readyTitle: "Pret a partir ?",
    readyBody: "Veuillez verifier que la chambre est vide et que vous n'avez rien oublie.",
    room: "Chambre",
    confirmCheckout: "Confirmer le checkout",
    completed: "Checkout termine",
    completedBody: "Vous pouvez laisser votre cle a la reception.",
    duplicate: "Le checkout a deja ete recu recemment.",
    invalidQr: "Ce QR code est invalide.",
    deactivatedQr: "Ce QR code a ete desactive.",
    networkError: "Erreur reseau. Veuillez reessayer.",
    checkoutUnavailable: "Le checkout n'est pas disponible.",
    cameraError: "Impossible de demarrer la camera.",
    language: "Langue",
  },
  it: {
    appName: "Checkout hotel",
    checkOut: "Check-out",
    hotelCheckout: "Checkout hotel",
    scanInstruction: "Scansiona il codice QR sul retro della chiave.",
    scanKey: "Scansiona chiave",
    scanning: "Scansione QR",
    readyTitle: "Pronto per il check-out?",
    readyBody: "Assicurati che la camera sia vuota e di non aver dimenticato nulla.",
    room: "Camera",
    confirmCheckout: "Conferma checkout",
    completed: "Checkout completato",
    completedBody: "Puoi lasciare la chiave alla reception.",
    duplicate: "Il checkout e gia stato ricevuto di recente.",
    invalidQr: "Questo codice QR non e valido.",
    deactivatedQr: "Questo codice QR e stato disattivato.",
    networkError: "Errore di rete. Riprova.",
    checkoutUnavailable: "Checkout non disponibile.",
    cameraError: "Impossibile avviare la fotocamera.",
    language: "Lingua",
  },
};

export function getBrowserLocale(): Locale {
  const language = navigator.language.split("-")[0] as Locale;
  return LOCALES.some((locale) => locale.id === language) ? language : "en";
}

export function t(locale: Locale, key: TranslationKey) {
  return translations[locale]?.[key] || translations.en[key];
}
