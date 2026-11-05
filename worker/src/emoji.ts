/** Emoji ammesse su un messaggio. Stesso elenco di `lib/chat-emoji.ts` e di `private.chat_emoji_ok`. */
export const chatEmojis = [
  "😀",
  "😁",
  "😂",
  "🤣",
  "😅",
  "😍",
  "😎",
  "😮",
  "😢",
  "😭",
  "🥺",
  "🤔",
  "😴",
  "🤯",
  "👀",
  "🙏",
  "👍",
  "👎",
  "👏",
  "🙌",
  "👋",
  "🤝",
  "🔥",
  "❤️",
  "💚",
  "💙",
  "💯",
  "✅",
  "🎉",
  "✨",
  "⭐",
  "💬",
] as const;

const chatEmojiSet = new Set<string>(chatEmojis);

export function isChatEmoji(value: string): value is (typeof chatEmojis)[number] {
  return chatEmojiSet.has(value);
}
