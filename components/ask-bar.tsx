"use client";

import { useState, useRef, ChangeEvent, useEffect } from "react";
import { Paperclip, X } from "lucide-react";

interface AttachedImage {
  id: string;
  url: string;
  file: File;
}

export function AskBar() {
  const [text, setText] = useState("");
  const [images, setImages] = useState<AttachedImage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.url));
    };
  }, [images]);

  const handleInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      
      const newImages = newFiles.map((file) => ({
        id: Math.random().toString(36).substring(7),
        url: URL.createObjectURL(file),
        file,
      }));

      setImages((prev) => [...prev, ...newImages]);
      
      if (textareaRef.current && text === "") {
        textareaRef.current.style.height = "40px";
      }
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeImage = (idToRemove: string) => {
    setImages((prev) => {
      const imageToRemove = prev.find(img => img.id === idToRemove);
      if (imageToRemove) URL.revokeObjectURL(imageToRemove.url);
      return prev.filter(img => img.id !== idToRemove);
    });
  };

  const isExpanded = images.length > 0 || text.split('\n').length > 1 || text.length > 50;

  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 flex flex-col bg-white/50 dark:bg-zinc-900/60 backdrop-blur-xl border border-white/40 dark:border-white/10 w-[540px] transition-[border-radius,background-color] duration-300 ${
        isExpanded ? "rounded-[24px]" : "rounded-full"
      }`}
      style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.06)" }}
    >
      
      <input 
        type="file" 
        multiple 
        accept="image/*" 
        className="hidden" 
        ref={fileInputRef}
        onChange={handleFileSelect}
      />

      {/* ── MULTIMEDIA PREVIEW ROW ── */}
      {images.length > 0 && (
        <div className="flex flex-row gap-3 px-4 pt-4 pb-1 overflow-x-auto w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {images.map((img) => (
            <div key={img.id} className="relative group shrink-0 animate-in fade-in zoom-in-95 duration-150">
              <div className="w-16 h-16 relative rounded-xl overflow-hidden border border-white/20 shadow-sm bg-black/5">
                <img src={img.url} alt="Attached preview" className="w-full h-full object-cover" />
              </div>
              <button
                onClick={() => removeImage(img.id)}
                className="absolute -top-2 -right-2 bg-zinc-800 dark:bg-zinc-700 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md border border-white/10 cursor-pointer hover:bg-black"
                aria-label="Remove image"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── INPUT ROW ── */}
      <div className="flex items-end gap-2 p-2 w-full">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-white/40 dark:hover:bg-zinc-800/50 rounded-full transition-colors flex-shrink-0 mb-[2px] cursor-pointer"
          aria-label="Attach file"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* Added Scrollbar-hiding Tailwind classes here */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          placeholder="Ask your market anything"
          rows={1}
          className="flex-1 bg-transparent border-none outline-none text-sm text-[#0A0A0A] dark:text-white placeholder:text-zinc-500 py-3 resize-none max-h-[200px] overflow-y-auto leading-relaxed [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{ minHeight: "40px" }}
        />

        <button
          className="bg-[#1C4ED8] text-white px-6 py-2.5 rounded-full text-[13px] font-medium border-none cursor-pointer whitespace-nowrap flex-shrink-0 transition-transform active:scale-95 mb-[2px]"
          style={{ boxShadow: "0 2px 8px rgba(28,78,216,0.25)" }}
        >
          Request answer
        </button>
      </div>
    </div>
  );
}