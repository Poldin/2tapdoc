import { gmailOAuthConfigured } from "@/lib/gmail-link";

export type ToolChoice = {
  id: "gmail" | "whatsapp";
  label: string;
};

export function toolChoices(): ToolChoice[] {
  const choices: ToolChoice[] = [];
  if (gmailOAuthConfigured()) choices.push({ id: "gmail", label: "Gmail" });
  choices.push({ id: "whatsapp", label: "WhatsApp" });
  return choices;
}
