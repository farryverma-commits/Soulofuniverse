import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { ArrowDown, Send } from "lucide-react";

interface ChatMessage {
  message: string;
  from?: {
    identity: string;
    name?: string;
  };
  timestamp: number;
  id: string;
}

interface PersistentChatProps {
  messages: ChatMessage[];
  onSendMessage: (msg: string) => Promise<any>;
  isSending?: boolean;
  localParticipantIdentity?: string;
}

const SCROLL_NEAR_BOTTOM_THRESHOLD = 80;

export const PersistentChat: React.FC<PersistentChatProps> = ({
  messages,
  onSendMessage,
  isSending,
  localParticipantIdentity: propIdentity,
}) => {
  const [input, setInput] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const { localParticipant } = useLocalParticipant();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(messages.length);

  const myIdentity = propIdentity ?? localParticipant?.identity ?? "";

  const scrollToBottom = useCallback((smooth = true) => {
    chatEndRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
    });
    setShowScrollButton(false);
    setNewMessageCount(0);
    isNearBottomRef.current = true;
  }, []);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom < SCROLL_NEAR_BOTTOM_THRESHOLD;

    isNearBottomRef.current = nearBottom;

    if (nearBottom) {
      setShowScrollButton(false);
      setNewMessageCount(0);
    }
  }, []);

  // Smart auto-scroll: only scroll when already near the bottom.
  // If the user scrolled up to read history, show a "new messages" button instead.
  useEffect(() => {
    const delta = messages.length - prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (isNearBottomRef.current) {
      scrollToBottom();
    } else if (delta > 0) {
      // User is reading history — show button instead of auto-scrolling
      setShowScrollButton(true);
      setNewMessageCount((c) => c + delta);
    }
  }, [messages.length, scrollToBottom]);

  // Scroll to bottom on first mount (when chat opens)
  useEffect(() => {
    scrollToBottom(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isSending) return;

    const text = input;
    try {
      await onSendMessage(text);
      setInput("");
      // Force scroll to bottom after own message
      isNearBottomRef.current = true;
      scrollToBottom();
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0F0F10] w-full">
      {/* Messages List */}
      <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden bg-black/40">
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar scroll-smooth"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50 px-6 text-center">
              <p className="text-xs font-medium mb-1">No messages yet</p>
              <p className="text-[10px] leading-relaxed">
                Send a message to start the conversation with participants.
              </p>
            </div>
          ) : (
            messages.map((msg, i) => {
              const isMe = myIdentity && msg.from?.identity === myIdentity;
              const senderName = isMe
                ? "You"
                : msg.from?.name || msg.from?.identity || "Guest";

              return (
                <div
                  key={msg.id || `${msg.timestamp}-${i}`}
                  className={`flex flex-col ${isMe ? "items-end" : "items-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                >
                  <span className="text-[10px] text-gray-500 mb-1 px-1">
                    {senderName}
                  </span>
                  <div
                    className={`px-4 py-2.5 rounded-2xl max-w-[85%] text-sm leading-relaxed ${
                      isMe
                        ? "bg-primary text-white rounded-tr-none shadow-lg shadow-primary/20"
                        : "bg-white/10 text-gray-200 rounded-tl-none border border-white/5"
                    }`}
                  >
                    {msg.message}
                  </div>
                </div>
              );
            })
          )}
          <div ref={chatEndRef} className="h-2 w-full" />
        </div>

        {/* "New messages" floating button */}
        {showScrollButton && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 bg-primary text-white text-xs font-bold px-4 py-2 rounded-full shadow-xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            {newMessageCount > 1
              ? `${newMessageCount} new messages`
              : "New message"}
          </button>
        )}
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSend}
        className="p-3 pb-safe border-t border-white/5 bg-black/20 flex gap-2"
      >
        <label htmlFor="chat-message-input" className="sr-only">
          Chat message
        </label>
        <input
          id="chat-message-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              handleSend(e);
            }
          }}
          placeholder="Type a message..."
          enterKeyHint="send"
          autoComplete="off"
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:border-primary focus:outline-2 focus:outline-primary focus:-outline-offset-1 transition-colors"
        />
        <button
          type="submit"
          disabled={!input.trim() || isSending}
          className={`w-12 flex items-center justify-center bg-primary text-white rounded-xl hover:bg-primary-dark transition-all duration-200 disabled:opacity-50 disabled:grayscale active:scale-95 shadow-lg shadow-primary/20 ${isSending ? "animate-pulse" : ""}`}
        >
          {isSending ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </form>
    </div>
  );
};
