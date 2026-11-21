import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyOptimisticReadGuard,
  applyRpcRowToState,
  asChatUnreadState,
  formatUnreadCount,
  isChatUnread,
  summarizeClinicUnread,
  unreadWeight,
  type ChatUnreadState,
} from "./chat-unread.ts";

describe("chat-unread helpers", () => {
  it("parses bigint strings and markdown previews cleanly", () => {
    const parsed = asChatUnreadState({
      chat_id: "c1",
      clinic_id: "k1",
      last_read_seq: "42",
      unread_count: "3",
      unread_mentions_count: 1,
      marked_unread: false,
      last_message_seq: "45",
      last_message_at: "2026-11-21T22:00:00Z",
      last_message_preview: "**Ciao** _mondo_",
    });
    assert.deepEqual(parsed, {
      chatId: "c1",
      clinicId: "k1",
      lastReadSeq: 42,
      unreadCount: 3,
      unreadMentionsCount: 1,
      markedUnread: false,
      lastMessageSeq: 45,
      lastMessageAt: "2026-11-21T22:00:00Z",
      lastMessagePreview: "Ciao mondo",
    });
  });

  it("formats unread counts with 99+ cap", () => {
    assert.equal(formatUnreadCount(0), "");
    assert.equal(formatUnreadCount(1), "1");
    assert.equal(formatUnreadCount(99), "99");
    assert.equal(formatUnreadCount(100), "99+");
    assert.equal(formatUnreadCount(420), "99+");
  });

  it("guards against stale payloads resurrecting cleared badges while letting newer messages through", () => {
    const stale: ChatUnreadState = {
      chatId: "c1",
      clinicId: "k1",
      lastReadSeq: 10,
      unreadCount: 2,
      unreadMentionsCount: 1,
      markedUnread: true,
      lastMessageSeq: 12,
      lastMessageAt: "2026-11-21T22:00:00Z",
      lastMessagePreview: "vecchio",
    };

    const guardedStale = applyOptimisticReadGuard(stale, 12, true);
    assert.equal(guardedStale.lastReadSeq, 12);
    assert.equal(guardedStale.unreadCount, 0);
    assert.equal(guardedStale.unreadMentionsCount, 0);
    assert.equal(guardedStale.markedUnread, false);

    const newer: ChatUnreadState = {
      ...stale,
      lastMessageSeq: 13,
      unreadCount: 1,
      unreadMentionsCount: 0,
      markedUnread: false,
    };
    const guardedNewer = applyOptimisticReadGuard(newer, 12, true);
    assert.equal(guardedNewer.lastReadSeq, 12);
    assert.equal(guardedNewer.unreadCount, 1);
  });

  it("summarizes unread weight across clinics including manual marked_unread", () => {
    const rows: ChatUnreadState[] = [
      {
        chatId: "c1",
        clinicId: "k1",
        lastReadSeq: 1,
        unreadCount: 3,
        unreadMentionsCount: 0,
        markedUnread: false,
        lastMessageSeq: 4,
        lastMessageAt: null,
        lastMessagePreview: null,
      },
      {
        chatId: "c2",
        clinicId: "k1",
        lastReadSeq: 5,
        unreadCount: 0,
        unreadMentionsCount: 0,
        markedUnread: true,
        lastMessageSeq: 5,
        lastMessageAt: null,
        lastMessagePreview: null,
      },
      {
        chatId: "c3",
        clinicId: "k2",
        lastReadSeq: 8,
        unreadCount: 0,
        unreadMentionsCount: 0,
        markedUnread: false,
        lastMessageSeq: 8,
        lastMessageAt: null,
        lastMessagePreview: null,
      },
    ];

    assert.equal(isChatUnread(rows[0]), true);
    assert.equal(isChatUnread(rows[1]), true);
    assert.equal(isChatUnread(rows[2]), false);
    assert.equal(unreadWeight(rows[1]), 1);
    assert.deepEqual(summarizeClinicUnread(rows), { k1: 4 });
  });

  it("applies RPC return rows onto existing state without losing preview metadata", () => {
    const existing: ChatUnreadState = {
      chatId: "c1",
      clinicId: "k1",
      lastReadSeq: 10,
      unreadCount: 2,
      unreadMentionsCount: 1,
      markedUnread: false,
      lastMessageSeq: 12,
      lastMessageAt: "2026-11-21T22:00:00Z",
      lastMessagePreview: "Ultimo",
    };

    const next = applyRpcRowToState(existing, "k1", {
      chat_id: "c1",
      last_read_seq: "12",
      unread_count: 0,
      unread_mentions_count: 0,
      marked_unread: false,
    });
    assert.equal(next?.lastReadSeq, 12);
    assert.equal(next?.unreadCount, 0);
    assert.equal(next?.lastMessagePreview, "Ultimo");
    assert.equal(next?.lastMessageAt, "2026-11-21T22:00:00Z");
  });
});
