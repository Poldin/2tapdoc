/** Emoji ammesse su un messaggio. Stesso elenco di `private.chat_emoji_ok` e di `worker/src/emoji.ts`. */
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
