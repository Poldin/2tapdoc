import { calcolaCodiceFiscaleTool } from "@/lib/codice-fiscale";

/**
 * Shared Mistral/OpenAI-style tools for Clinico agents (landing demo + clinic bots).
 * Add clinic-specific tools alongside calcola_codice_fiscale here as they land.
 */
export const sharedAgentTools = [calcolaCodiceFiscaleTool] as const;

export { calcolaCodiceFiscaleTool, executeCalcolaCodiceFiscale, computeCodiceFiscale } from "@/lib/codice-fiscale";