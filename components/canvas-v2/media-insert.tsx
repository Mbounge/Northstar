"use client";
import { useRef, useState } from "react";
import { Film, Link2 } from "lucide-react";
export function CanvasV2MediaInsert({ disabled, onFiles, onUrl }: { disabled: boolean; onFiles: (files: File[]) => void; onUrl: (url: string, type: "video" | "gif") => Promise<boolean> }) {
  const file = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState(false), [url, setUrl] = useState(""), [type, setType] = useState<"video" | "gif">("video");
  return <div className="col-span-full mt-2 rounded-lg border border-black/10 p-3 dark:border-white/10">
    <input ref={file} aria-label="Choose playable media" className="sr-only" type="file" multiple accept="video/mp4,video/webm,image/gif" disabled={disabled} onChange={event => { onFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }}/>
    <div className="flex items-center justify-between"><button disabled={disabled} className="flex items-center gap-2 text-xs font-medium disabled:opacity-40" onClick={() => file.current?.click()}><Film size={16} className="text-[#9d8cff]"/>Video or GIF</button><button aria-label="Link hosted media" onClick={() => setLink(value => !value)} className="rounded p-1.5 hover:bg-violet-500/10"><Link2 size={14}/></button></div>
    <p className="mt-2 text-[10px] leading-relaxed opacity-50">Drop MP4, WebM or GIF files onto the board. Local media stays in this browser session.</p>
    {link && <form className="mt-3 flex flex-col gap-2" onSubmit={async e => { e.preventDefault(); if (await onUrl(url, type)) { setUrl(""); setLink(false); } }}><input aria-label="Hosted media URL" value={url} onChange={e => setUrl(e.target.value)} placeholder="Video link or direct media URL" className="rounded bg-black/5 px-2 py-1.5 text-xs dark:bg-white/5"/><div className="flex justify-between"><select aria-label="Hosted media type" value={type} onChange={e => setType(e.target.value as typeof type)} className="rounded bg-black/5 p-1 text-xs dark:bg-[#303036]"><option value="video">Video</option><option value="gif">GIF</option></select><button type="submit" disabled={disabled || !url} className="rounded bg-[#6d54e8] px-2 py-1 text-xs text-white disabled:opacity-30">Add media</button></div></form>}
  </div>;
}
