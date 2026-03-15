//components/analyst-chat.tsx

"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Send, X, Bot, User, Loader2, Image as ImageIcon } from "lucide-react";
import Image from "next/image";
import { AssetReference } from "@/lib/intelligence";

interface Message {
  role: 'user' | 'model';
  text: string;
  citations?: AssetReference[];
}

interface AnalystChatProps {
  companyId: string;
}

export function AnalystChat({ companyId }: AnalystChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: "I've analyzed the Product, Marketing, and Business data. Ask me about their strategy." }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput("");
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMsg, 
          companyId,
          history: [] // Simplified history for now
        })
      });
      
      const data = await res.json();
      
      setMessages(prev => [...prev, { 
        role: 'model', 
        text: data.answer, 
        citations: data.citations 
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'model', text: "Error analyzing data. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-500 shadow-2xl shadow-blue-500/20 z-50 flex items-center justify-center transition-all hover:scale-105"
      >
        <MessageSquare className="w-6 h-6 text-white" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 w-[450px] h-[600px] bg-zinc-950 border-zinc-800 shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-200">
      
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold text-white text-sm">Strategic Analyst</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsOpen(false)}>
          <X className="w-4 h-4 text-zinc-500" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.role === 'model' ? 'bg-blue-600/20 text-blue-400' : 'bg-zinc-800 text-zinc-400'}`}>
              {m.role === 'model' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>
            
            <div className={`max-w-[85%] space-y-2`}>
              <div className={`p-3 rounded-lg text-sm leading-relaxed ${m.role === 'model' ? 'bg-zinc-900 text-zinc-200 border border-zinc-800' : 'bg-blue-600 text-white'}`}>
                {m.text}
              </div>

              {/* CITATIONS (Evidence Cards) */}
              {m.citations && m.citations.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {m.citations.map((cite, cIdx) => (
                    <div key={cIdx} className="w-32 shrink-0 bg-black border border-zinc-800 rounded-md overflow-hidden cursor-pointer hover:border-blue-500/50 transition-colors">
                      <div className="h-20 relative bg-zinc-900">
                        {cite.imageUrl ? (
                          <Image 
                            src={cite.imageUrl} 
                            alt="Evidence" 
                            fill 
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full"><ImageIcon className="w-6 h-6 text-zinc-700" /></div>
                        )}
                      </div>
                      <div className="p-2 bg-zinc-900/50">
                        <p className="text-[9px] text-zinc-400 truncate font-mono">{cite.title}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
             <div className="w-8 h-8 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center"><Bot className="w-4 h-4" /></div>
             <div className="bg-zinc-900 p-3 rounded-lg border border-zinc-800 flex items-center gap-2">
               <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
               <span className="text-xs text-zinc-500">Connecting dots...</span>
             </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-zinc-800 bg-zinc-900/30">
        <div className="flex gap-2">
          <Input 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            placeholder="Ask about strategy, hiring, or features..." 
            className="bg-zinc-950 border-zinc-800 focus-visible:ring-blue-600"
          />
          <Button type="submit" size="icon" className="bg-blue-600 hover:bg-blue-500">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>

    </Card>
  );
}