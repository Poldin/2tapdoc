"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { Ellipsis } from "lucide-react";
import { ChatActions } from "@/components/chat-actions";
import { DeleteChatDialog } from "@/components/delete-chat-dialog";

export function ChatMenu({
  selected,
  clinicId,
  chatId,
  name,
  onEdit,
  onPeople,
  onRemoved,
  onToggleUnread,
  unread = false,
  people = true,
  children,
  rootRef: rootRefProp,
  rootClassName = "relative",
  buttonClassName,
  menuClassName,
  label = "Apri il menu della chat",
}: {
  selected: boolean;
  clinicId: string;
  chatId: string;
  name: string;
  onEdit: () => void;
  onPeople: () => void;
  onRemoved: (chatId: string) => void;
  onToggleUnread?: () => void;
  unread?: boolean;
  people?: boolean;
  children?: ReactNode;
  rootRef?: Ref<HTMLDivElement>;
  rootClassName?: string;
  buttonClassName?: string;
  menuClassName?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const externalRef = useRef(rootRefProp);
  externalRef.current = rootRefProp;

  const setRoot = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    const prop = externalRef.current;
    if (typeof prop === "function") prop(node);
    else if (prop) prop.current = node;
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={setRoot} className={rootClassName}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={
          buttonClassName ??
          `flex h-6 w-6 items-center justify-center rounded-full ${
            selected ? "text-paper hover:bg-white/15" : "text-muted hover:bg-background"
          }`
        }
      >
        {children ?? <Ellipsis className="h-4 w-4" strokeWidth={2} />}
      </button>
      {open ? (
        <ChatActions
          menuClassName={menuClassName}
          people={people}
          unread={unread}
          onToggleUnread={
            onToggleUnread
              ? () => {
                  setOpen(false);
                  onToggleUnread();
                }
              : undefined
          }
          onEdit={() => {
            setOpen(false);
            onEdit();
          }}
          onPeople={() => {
            setOpen(false);
            onPeople();
          }}
          onDelete={() => {
            setOpen(false);
            setConfirming(true);
          }}
        />
      ) : null}
      {confirming
        ? createPortal(
            <DeleteChatDialog
              open
              clinicId={clinicId}
              chatId={chatId}
              name={name}
              onClose={() => setConfirming(false)}
              onRemoved={onRemoved}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
