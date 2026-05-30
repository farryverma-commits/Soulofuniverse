import React, { useEffect, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { Send } from "lucide-react";

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

export const PersistentChat: React.FC<PersistentChatProps> = ({
  messages,
  onSendMessage,
  isSending,
  localParticipantIdentity: propIdentity,
}) => {
  const [input, setInput] = useState("");
  const { localParticipant } = useLocalParticipant();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Use the passed identity prop if available, otherwise fall back to the hook
  const myIdentity = propIdentity ?? localParticipant?.identity ?? "";

  // Scroll to bottom when messages change
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Diagnostic logging
  useEffect(() => {
    console.log(
      "[PersistentChat] localParticipant identity:",
      localParticipant?.identity,
    );
    console.log("[PersistentChat] messages count:", messages.length);
    messages.forEach((msg, i) => {
      console.log(
        `[PersistentChat] msg[${i}] from:`,
        msg.from?.identity,
        "isMe:",
        localParticipant?.identity &&
          msg.from?.identity === localParticipant?.identity,
      );
    });
  }, [messages, localParticipant]);

  const handleSend = async (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isSending) return;

    const text = input;
    try {
      await onSendMessage(text);
      setInput("");
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0F0F10] w-full">
      {/* Chat Header with Counter */}
      {/* <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20 backdrop-blur-sm">
        <h3 className="text-sm font-semibold text-white/90">Chat Session</h3>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">
            Live
          </span>
          <span className="text-[10px] bg-white/10 text-white/40 px-2 py-0.5 rounded-full">
            {messages.length} messages
          </span>
        </div>
      </div> */}

      {/* Messages List */}
      <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden bg-black/40">
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar scroll-smooth">
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
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSend}
        className="p-3 pb-safe border-t border-white/5 bg-black/20 flex gap-2"
      >
        <input
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
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary transition-colors"
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
