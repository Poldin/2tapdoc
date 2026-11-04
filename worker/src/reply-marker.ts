const replyMarkerPattern =
  /^\[id:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\][ \t]*(?:\r?\n)?/i;

/** Prima riga `[id:…]` scritta dal modello al posto di `setReplyTarget`. Stessa regola di `lib/reply-marker.ts`. */
export function takeReplyMarker(body: string): { id: string; body: string } | null {
  const match = replyMarkerPattern.exec(body);
  if (!match) return null;
  return { id: match[1].toLowerCase(), body: body.slice(match[0].length).trim() };
}
