import { useState, useRef, useEffect } from "react";
import { Bot, X, Send, Loader2, Wrench } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message {
  role: "user" | "assistant" | "tool_status";
  content: string;
  thought?: string;
}

interface ConversationEntry {
  role: string;
  content: string;
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = { role: "user", content: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, conversation }),
      });

      if (!res.ok) {
        throw new Error("Failed to connect to AI server.");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Stream not supported.");

      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      let currentAssistantMessage = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (let line of lines) {
          line = line.trim();
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "chunk") {
                currentAssistantMessage += data.content;
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  // Update the last assistant message
                  if (newMsgs[newMsgs.length - 1].role === "assistant") {
                    newMsgs[newMsgs.length - 1] = {
                      ...newMsgs[newMsgs.length - 1],
                      content: currentAssistantMessage,
                    };
                  }
                  return newMsgs;
                });
              } else if (data.type === "thought") {
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  const lastMsg = newMsgs[newMsgs.length - 1];
                  if (lastMsg.role === "assistant") {
                    newMsgs[newMsgs.length - 1] = {
                      ...lastMsg,
                      thought: (lastMsg.thought || "") + data.content,
                    };
                  }
                  return newMsgs;
                });
              } else if (data.type === "tool_start") {
                setMessages((prev) => [
                  ...prev,
                  {
                    role: "tool_status",
                    content: `Using tool: ${data.name}...`,
                  },
                ]);
              } else if (data.type === "tool_result") {
                setMessages((prev) => {
                  const newMsgs = [...prev];
                  // Update the last tool_status message
                  if (newMsgs[newMsgs.length - 1].role === "tool_status") {
                    newMsgs[newMsgs.length - 1] = {
                      role: "tool_status",
                      content: `Finished tool: ${data.name} (Found ${data.count} items)`,
                    };
                  }
                  // Start a new assistant message context for the follow-up text
                  return [...newMsgs, { role: "assistant", content: "" }];
                });
                currentAssistantMessage = "";
              } else if (data.type === "done") {
                setConversation(data.conversation || []);
              } else if (data.type === "error") {
                setError(data.message);
              }
            } catch (e) {}
          }
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
    } finally {
      // Remove any empty assistant messages that might have been left over
      setMessages((prev) =>
        prev.filter((m) => m.content.trim() !== "" || m.role === "tool_status"),
      );
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* FAB Button */}
      <Button
        variant="default"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        className="fixed right-4 bottom-4 z-50 h-12 w-12 rounded-full border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] bg-[#FFD700] text-black transition-all"
        aria-label="Toggle AI Chat"
      >
        <Bot className="size-6" />
      </Button>

      {/* Chat Panel */}
      {open && (
        <div
          className="fixed right-4 bottom-20 z-50 flex w-[420px] max-w-[calc(100vw-2rem)] flex-col rounded-xl border-4 border-black bg-zinc-900 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden"
          style={{ height: "600px", maxHeight: "calc(100vh - 6rem)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b-4 border-black bg-[#FFD700] px-4 py-3 shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="size-5 text-black" />
              <span className="font-bold text-black text-sm uppercase tracking-wide">
                AI Assistant
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded p-0.5 hover:bg-black/20 transition-colors"
              aria-label="Close chat"
            >
              <X className="size-4 text-black" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !loading && (
              <div className="flex h-full flex-col items-center justify-center text-center text-zinc-500">
                <Bot className="size-10 mb-3 opacity-40" />
                <p className="text-xs leading-relaxed">
                  Ask me to find games, get recommendations, or answer retro
                  gaming questions!
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.role === "user"
                    ? "justify-end"
                    : msg.role === "tool_status"
                      ? "justify-center"
                      : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] break-words rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[#FFD700] text-black font-semibold rounded-br-none"
                      : msg.role === "tool_status"
                        ? "bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 italic flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px]"
                        : "bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-bl-none overflow-hidden"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="flex flex-col gap-2">
                      {msg.thought && (
                        <div className="rounded-md border border-zinc-700 bg-zinc-900/50 p-2 text-[10.5px] text-zinc-400 italic">
                          <div className="font-semibold text-zinc-500 mb-1 flex items-center gap-1.5">
                            <Bot className="size-3" />
                            Thought Process
                          </div>
                          <div className="whitespace-pre-wrap">
                            {msg.thought}
                          </div>
                        </div>
                      )}
                      {msg.content && (
                        <div className="prose prose-invert max-w-none text-[11px] leading-relaxed [&_a]:text-[#FFD700] [&_a]:underline [&_a]:break-all [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_p]:my-1.5 [&_p]:break-words [&_*]:text-[11px] [&_pre]:whitespace-pre-wrap [&_pre]:break-words">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  ) : msg.role === "tool_status" ? (
                    <>
                      <Wrench className="size-3" />
                      {msg.content}
                    </>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-zinc-800 border border-zinc-700 rounded-lg rounded-bl-none px-3 py-2 flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin text-[#FFD700]" />
                  <span className="text-[10px] text-zinc-400">Thinking…</span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-red-900/40 border border-red-700 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t-4 border-black bg-zinc-800 px-3 py-3 flex gap-2 items-center shrink-0">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about games…"
              disabled={loading}
              className="flex-1 h-10 text-xs bg-zinc-900 text-white border-zinc-700 focus:border-[#FFD700] placeholder:text-zinc-500"
            />
            <Button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              size="icon"
              className="h-10 w-10 shrink-0 bg-[#FFD700] text-black hover:bg-yellow-400 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
