import { useState, useRef, useEffect, useCallback } from "preact/hooks";
import type { JSX } from "preact";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const BUBBLE_DELAY_MS = 15000;
const API_ENDPOINT = "/api/chat";

const QUICK_QUESTIONS = [
  "Which proxy type is best for web scraping?",
  "How much do residential proxies cost?",
  "Mobile vs residential - which is better?",
  "What's the cheapest proxy for my use case?",
];

const TIPS = [
  "Need help choosing a proxy? Ask me!",
  "Compare prices across 40+ providers",
  "Not sure which proxy type? Let's figure it out",
  "Questions about pricing? I'm here to help",
];

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentTip] = useState(
    () => TIPS[Math.floor(Math.random() * TIPS.length)],
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Show bubble hint after delay
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isOpen) setShowBubble(true);
    }, BUBBLE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isOpen]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Handle external triggers
  useEffect(() => {
    const handler = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-open-chat]")) {
        setIsOpen(true);
        setShowBubble(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMessage: Message = { role: "user", content: text.trim() };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setIsLoading(true);

      try {
        const response = await fetch(API_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            history: messages.slice(-6),
          }),
        });

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error);
        }

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.message },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Sorry, I'm having trouble connecting. Please try again in a moment.",
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading],
  );

  const handleSubmit = (e: JSX.TargetedEvent<HTMLFormElement>) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const toggleChat = () => {
    setIsOpen(!isOpen);
    setShowBubble(false);
  };

  const closeBubble = (e: JSX.TargetedMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setShowBubble(false);
  };

  return (
    <>
      {/* Bubble Hint */}
      {showBubble && !isOpen && (
        <div class="chat-bubble" onClick={toggleChat}>
          <button
            class="bubble-close"
            onClick={closeBubble}
            aria-label="Close hint"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <span class="bubble-text">{currentTip}</span>
          <div class="bubble-arrow" />
        </div>
      )}

      {/* FAB Button */}
      <button
        class={`chat-fab ${isOpen ? "chat-fab-open" : ""}`}
        onClick={toggleChat}
        aria-label={isOpen ? "Close chat" : "Open chat assistant"}
      >
        {isOpen ? (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <>
            <img
              src="/favicon.svg"
              alt=""
              width="28"
              height="28"
              class="fab-icon"
            />
            {!showBubble && <span class="fab-ping" />}
          </>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <>
          <div class="chat-backdrop" onClick={toggleChat} />
          <div class="chat-panel">
            {/* Header */}
            <div class="chat-header">
              <div class="chat-header-info">
                <img src="/favicon.svg" alt="" width="32" height="32" />
                <div>
                  <h3>Proxy Price Expert</h3>
                  <span class="chat-status">AI-powered assistant</span>
                </div>
              </div>
              <button
                class="chat-close"
                onClick={toggleChat}
                aria-label="Close"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div class="chat-messages">
              {messages.length === 0 ? (
                <div class="chat-welcome">
                  <div class="welcome-icon">
                    <img src="/favicon.svg" alt="" width="48" height="48" />
                  </div>
                  <h4>Welcome to ProxyPrice!</h4>
                  <p>
                    I can help you find the best proxy for your needs, compare
                    prices, and answer questions about proxy types.
                  </p>
                  <div class="quick-questions">
                    {QUICK_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        class="quick-btn"
                        onClick={() => sendMessage(q)}
                        disabled={isLoading}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => (
                    <div key={i} class={`chat-message ${msg.role}`}>
                      {msg.role === "assistant" && (
                        <div class="message-avatar">
                          <img
                            src="/favicon.svg"
                            alt=""
                            width="24"
                            height="24"
                          />
                        </div>
                      )}
                      <div class="message-content">
                        <MessageContent content={msg.content} />
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div class="chat-message assistant">
                      <div class="message-avatar">
                        <img src="/favicon.svg" alt="" width="24" height="24" />
                      </div>
                      <div class="message-content">
                        <div class="typing-indicator">
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input */}
            <form class="chat-input-form" onSubmit={handleSubmit}>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onInput={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about proxy pricing..."
                disabled={isLoading}
                maxLength={500}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                aria-label="Send"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </form>
          </div>
        </>
      )}

      <style>{`
        /* FAB Button */
        .chat-fab {
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          border: none;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
          cursor: pointer;
          box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 1000;
        }

        .chat-fab:hover {
          transform: scale(1.05);
          box-shadow: 0 6px 28px rgba(59, 130, 246, 0.5);
        }

        .chat-fab-open {
          background: linear-gradient(135deg, #374151 0%, #1f2937 100%);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        }

        .fab-icon {
          filter: brightness(0) invert(1);
        }

        .fab-ping {
          position: absolute;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: #3b82f6;
          animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
          opacity: 0.75;
        }

        @keyframes ping {
          75%, 100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }

        /* Bubble Hint */
        .chat-bubble {
          position: fixed;
          bottom: 5.5rem;
          right: 1.5rem;
          max-width: 220px;
          padding: 0.875rem 1rem;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.95) 0%, rgba(37, 99, 235, 0.95) 100%);
          backdrop-filter: blur(12px);
          border-radius: 1rem;
          color: white;
          font-size: 0.875rem;
          line-height: 1.4;
          cursor: pointer;
          box-shadow: 0 8px 32px rgba(59, 130, 246, 0.3);
          animation: fadeInUp 0.4s ease-out;
          z-index: 999;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .bubble-close {
          position: absolute;
          top: -6px;
          right: -6px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: none;
          background: rgba(0, 0, 0, 0.4);
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .bubble-arrow {
          position: absolute;
          bottom: -8px;
          right: 24px;
          width: 0;
          height: 0;
          border-left: 8px solid transparent;
          border-right: 8px solid transparent;
          border-top: 8px solid rgba(37, 99, 235, 0.95);
        }

        /* Chat Backdrop */
        .chat-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(4px);
          z-index: 1001;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        /* Chat Panel */
        .chat-panel {
          position: fixed;
          bottom: 1.5rem;
          right: 1.5rem;
          width: min(420px, calc(100vw - 2rem));
          height: min(600px, calc(100vh - 6rem));
          background: linear-gradient(180deg, #1a1a2e 0%, #16162a 100%);
          border-radius: 1.25rem;
          box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          z-index: 1002;
          animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* Header */
        .chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.25rem;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.1) 100%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .chat-header-info {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .chat-header-info img {
          border-radius: 8px;
        }

        .chat-header-info h3 {
          font-size: 1rem;
          font-weight: 600;
          color: #f9fafb;
          margin: 0;
        }

        .chat-status {
          font-size: 0.75rem;
          color: #10b981;
        }

        .chat-close {
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 8px;
          padding: 0.5rem;
          cursor: pointer;
          color: #9ca3af;
          transition: all 0.2s;
        }

        .chat-close:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #f9fafb;
        }

        /* Messages */
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .chat-messages::-webkit-scrollbar {
          width: 6px;
        }

        .chat-messages::-webkit-scrollbar-track {
          background: transparent;
        }

        .chat-messages::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 3px;
        }

        /* Welcome Screen */
        .chat-welcome {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 1.5rem 0;
        }

        .welcome-icon {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(37, 99, 235, 0.15) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 1rem;
        }

        .chat-welcome h4 {
          color: #f9fafb;
          font-size: 1.125rem;
          margin: 0 0 0.5rem;
        }

        .chat-welcome p {
          color: #9ca3af;
          font-size: 0.875rem;
          line-height: 1.5;
          margin: 0 0 1.25rem;
          max-width: 280px;
        }

        /* Quick Questions */
        .quick-questions {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          width: 100%;
        }

        .quick-btn {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          color: #d1d5db;
          font-size: 0.8125rem;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s;
        }

        .quick-btn:hover:not(:disabled) {
          background: rgba(59, 130, 246, 0.15);
          border-color: rgba(59, 130, 246, 0.3);
          color: #f9fafb;
        }

        .quick-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Message Styles */
        .chat-message {
          display: flex;
          gap: 0.625rem;
          max-width: 85%;
          animation: messageIn 0.3s ease-out;
        }

        @keyframes messageIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .chat-message.user {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .message-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(37, 99, 235, 0.15) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .message-avatar img {
          border-radius: 4px;
        }

        .message-content {
          padding: 0.75rem 1rem;
          border-radius: 1rem;
          font-size: 0.875rem;
          line-height: 1.5;
        }

        .chat-message.user .message-content {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
          border-bottom-right-radius: 4px;
        }

        .chat-message.assistant .message-content {
          background: rgba(255, 255, 255, 0.08);
          color: #e5e7eb;
          border-bottom-left-radius: 4px;
        }

        /* Typing Indicator */
        .typing-indicator {
          display: flex;
          gap: 4px;
          padding: 4px 0;
        }

        .typing-indicator span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #6b7280;
          animation: bounce 1.4s infinite ease-in-out both;
        }

        .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
        .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }

        /* Input Form */
        .chat-input-form {
          display: flex;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
          background: rgba(0, 0, 0, 0.2);
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .chat-input-form input {
          flex: 1;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          color: #f9fafb;
          font-size: 0.875rem;
          outline: none;
          transition: all 0.2s;
        }

        .chat-input-form input::placeholder {
          color: #6b7280;
        }

        .chat-input-form input:focus {
          border-color: rgba(59, 130, 246, 0.5);
          background: rgba(255, 255, 255, 0.1);
        }

        .chat-input-form button {
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          border: none;
          border-radius: 0.75rem;
          padding: 0 1rem;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
        }

        .chat-input-form button:hover:not(:disabled) {
          transform: scale(1.05);
        }

        .chat-input-form button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Mobile Adjustments */
        @media (max-width: 480px) {
          .chat-fab {
            bottom: 1rem;
            right: 1rem;
            width: 52px;
            height: 52px;
          }

          .chat-bubble {
            bottom: 4.5rem;
            right: 1rem;
            max-width: 200px;
          }

          .chat-panel {
            bottom: 0;
            right: 0;
            width: 100vw;
            height: calc(100vh - 60px);
            border-radius: 1.25rem 1.25rem 0 0;
          }
        }

        /* Dark mode support */
        @media (prefers-color-scheme: light) {
          .chat-panel {
            background: linear-gradient(180deg, #ffffff 0%, #f9fafb 100%);
            border-color: rgba(0, 0, 0, 0.1);
          }

          .chat-header {
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(37, 99, 235, 0.05) 100%);
            border-color: rgba(0, 0, 0, 0.06);
          }

          .chat-header-info h3 {
            color: #1f2937;
          }

          .chat-welcome h4 {
            color: #1f2937;
          }

          .chat-welcome p {
            color: #6b7280;
          }

          .quick-btn {
            background: rgba(0, 0, 0, 0.03);
            border-color: rgba(0, 0, 0, 0.1);
            color: #4b5563;
          }

          .quick-btn:hover:not(:disabled) {
            background: rgba(59, 130, 246, 0.1);
            border-color: rgba(59, 130, 246, 0.3);
            color: #1f2937;
          }

          .chat-message.assistant .message-content {
            background: rgba(0, 0, 0, 0.05);
            color: #374151;
          }

          .chat-input-form {
            background: rgba(0, 0, 0, 0.03);
            border-color: rgba(0, 0, 0, 0.06);
          }

          .chat-input-form input {
            background: white;
            border-color: rgba(0, 0, 0, 0.1);
            color: #1f2937;
          }

          .chat-input-form input:focus {
            background: white;
          }

          .chat-close {
            background: rgba(0, 0, 0, 0.05);
            color: #6b7280;
          }

          .chat-close:hover {
            background: rgba(0, 0, 0, 0.1);
            color: #1f2937;
          }

          .message-avatar {
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.08) 100%);
          }

          .welcome-icon {
            background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(37, 99, 235, 0.08) 100%);
          }

          .chat-messages::-webkit-scrollbar-thumb {
            background: rgba(0, 0, 0, 0.15);
          }
        }
      `}</style>
    </>
  );
}

// Simple markdown-like rendering for message content
function MessageContent({ content }: { content: string }) {
  // Split by code blocks first
  const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const code = part.slice(3, -3).replace(/^\w+\n/, "");
          return (
            <pre
              key={i}
              style={{
                background: "rgba(0,0,0,0.3)",
                padding: "0.75rem",
                borderRadius: "0.5rem",
                overflow: "auto",
                fontSize: "0.8125rem",
                margin: "0.5rem 0",
              }}
            >
              <code>{code}</code>
            </pre>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              style={{
                background: "rgba(0,0,0,0.2)",
                padding: "0.125rem 0.375rem",
                borderRadius: "0.25rem",
                fontSize: "0.8125rem",
              }}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        // Handle bold text
        const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
        return boldParts.map((bp, j) => {
          if (bp.startsWith("**") && bp.endsWith("**")) {
            return <strong key={`${i}-${j}`}>{bp.slice(2, -2)}</strong>;
          }
          return <span key={`${i}-${j}`}>{bp}</span>;
        });
      })}
    </>
  );
}
