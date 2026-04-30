"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Loader2, ExternalLink } from "lucide-react";
import { VideoCard } from "./VideoCard";

type Source = {
  videoUrl: string;
  thumbnailUrl: string;
  creator: string;
  platform: string;
  score: number;
  preview: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

export function AskQuestionChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  async function handleAskQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    const userQuestion = question.trim();
    setQuestion("");

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: userQuestion }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/ask-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userQuestion }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to get answer");
      }

      const data = await res.json();

      // Add assistant message with sources
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer,
          sources: data.sources,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Error: ${error instanceof Error ? error.message : "Failed to get answer"}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 flex items-center justify-center z-50"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Chat Bubble */}
      {isOpen && (
        <div
          className="fixed bottom-6 right-6 w-96 max-h-[600px] rounded-2xl shadow-2xl z-50 animate-in slide-in-from-bottom-5 duration-300"
          style={{
            background: "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.3)",
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200/50">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <MessageCircle className="h-4 w-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Ask AI</h3>
                <p className="text-xs text-muted-foreground">
                  Based on your videos
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="h-8 w-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="h-[400px] overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                <MessageCircle className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm">
                  Ask me anything about your transcribed videos!
                </p>
                <p className="text-xs mt-2">
                  Try: &ldquo;What topics are discussed?&rdquo;
                </p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div key={index}>
                  {/* Message bubble */}
                  <div
                    className={`flex ${
                      msg.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                        msg.role === "user"
                          ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                          : "bg-gray-100 text-gray-900"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    </div>
                  </div>

                  {/* Sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 ml-4">
                      <p className="text-xs text-muted-foreground mb-2">
                        Sources:
                      </p>
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {msg.sources.slice(0, 3).map((source, idx) => (
                          <a
                            key={idx}
                            href={source.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 w-20 group relative"
                          >
                            <div className="aspect-[9/16] rounded-lg overflow-hidden border border-gray-200 bg-muted">
                              {source.thumbnailUrl ? (
                                <img
                                  src={source.thumbnailUrl}
                                  alt="Source"
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                                  Video
                                </div>
                              )}
                            </div>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all rounded-lg flex items-center justify-center">
                              <ExternalLink className="h-3 w-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            <p className="text-xs text-center mt-1 truncate">
                              @{source.creator}
                            </p>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-purple-500" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleAskQuestion} className="p-4 border-t border-gray-200/50">
            <div className="flex gap-2">
              <Input
                placeholder="Ask a question..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={isLoading}
                className="flex-1 rounded-full border-gray-300 focus:border-purple-500 focus:ring-purple-500"
              />
              <Button
                type="submit"
                disabled={isLoading || !question.trim()}
                className="rounded-full h-10 w-10 p-0 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
