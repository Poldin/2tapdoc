export type TurnMessage = {
  role: "user" | "assistant";
  content: string;
};

export type Turn = {
  id: string;
  botId: string;
  botName: string;
  chatId: string;
  memoBody: string | null;
  messages: TurnMessage[];
};

const modelTimeoutMs = 25_000;

export async function replyToTurn(apiKey: string, turn: Turn): Promise<string> {
  const messages: TurnMessage[] = [...turn.messages];
  if (turn.memoBody) {
    messages.push({
      role: "user",
      content: `Promemoria scaduto:\n${turn.memoBody}`,
    });
  }
  if (!messages.some((message) => message.role === "user")) {
    throw new Error("The chat has no message to answer");
  }

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.MISTRAL_MODEL?.trim() || "ministral-3b-2512",
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: [
            `Sei ${turn.botName}, un bot di 2tapdoc dentro una clinica.`,
            "Rispondi in italiano, breve e concreto.",
            "Puoi solo scrivere in questa chat.",
            "Non dire di aver prenotato, modificato o letto schede che non compaiono nel testo della conversazione: quelle azioni non sono ancora collegate.",
            "Se manca un dato, chiedilo.",
          ].join(" "),
        },
        ...messages,
      ],
    }),
    signal: AbortSignal.timeout(modelTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Mistral request failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Mistral returned an empty reply");
  }
  return content.trim().slice(0, 4000);
}
