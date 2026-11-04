type PasskeyError = { message: string; code?: string };

export function webAuthnSupported() {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

export function passkeyErrorMessage(error: PasskeyError): string | null {
  switch (error.code) {
    case "ERROR_CEREMONY_ABORTED":
      return null;
    case "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY": {
      const text = error.message.toLowerCase();
      if (
        text.length === 0 ||
        text.includes("not allowed") ||
        text.includes("timed out") ||
        text.includes("abort") ||
        text.includes("cancel")
      ) {
        return null;
      }
      return "Non è stato possibile usare questo dispositivo.";
    }
    case "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED":
    case "webauthn_credential_exists":
      return "Questo dispositivo è già collegato al tuo account.";
    case "ERROR_INVALID_RP_ID":
    case "ERROR_INVALID_DOMAIN":
      return "L’impronta si attiva sul sito dello studio. Da questo indirizzo il browser non la accetta.";
    case "passkey_disabled":
      return "L’accesso con impronta non è ancora abilitato sul progetto.";
    case "too_many_passkeys":
      return "Hai già il numero massimo di dispositivi collegati.";
    case "webauthn_verification_failed":
      return "Il dispositivo non ha confermato l’accesso. Riprova.";
    case "webauthn_credential_not_found":
      return "Su questo dispositivo non c’è un’impronta collegata al tuo account.";
    default:
      if (error.message.toLowerCase().includes("does not support webauthn")) {
        return "Questo browser non supporta l’accesso con impronta.";
      }
      return "Non è stato possibile completare l’operazione.";
  }
}
