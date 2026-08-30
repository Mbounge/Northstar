"use client";

import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { ArrowUp, Layers3 } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  createCanvasV2GatewayHandoff,
  storeCanvasV2GatewayHandoff,
} from "@/lib/canvas-v2/gateway-handoff";

const STANDARD_TRANSITION_MS = 560;
const REDUCED_TRANSITION_MS = 70;

export function AskBar() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transitionTimerRef = useRef<number | undefined>(undefined);
  const launchStartedRef = useRef(false);

  useEffect(() => {
    router.prefetch("/canvas");
    return () => {
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
      delete document.documentElement.dataset.northstarCanvasTransition;
    };
  }, [router]);

  const resizeTextarea = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 44), 136)}px`;
  };

  const handleInput = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
    resizeTextarea();
  };

  const openCanvas = () => {
    if (launchStartedRef.current) return;
    launchStartedRef.current = true;
    const handoff = createCanvasV2GatewayHandoff(text);
    storeCanvasV2GatewayHandoff(window.sessionStorage, handoff);
    setTransitioning(true);
    document.documentElement.dataset.northstarCanvasTransition = "leaving";

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    transitionTimerRef.current = window.setTimeout(() => {
      router.push("/canvas");
    }, reducedMotion ? REDUCED_TRANSITION_MS : STANDARD_TRANSITION_MS);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      openCanvas();
    }
  };

  const hasPrompt = text.trim().length > 0;
  const expanded = text.includes("\n") || text.length > 72;

  return (
    <>
      <div
        data-northstar-gateway
        data-transitioning={transitioning ? "true" : "false"}
        className={`absolute left-1/2 w-[min(590px,calc(100vw-48px))] -translate-x-1/2 border border-white/60 bg-white/58 shadow-[0_12px_44px_rgba(53,58,108,.12),inset_0_1px_0_rgba(255,255,255,.8)] backdrop-blur-2xl transition-[transform,border-radius,box-shadow,background-color] duration-500 ease-[cubic-bezier(.22,1,.36,1)] dark:border-white/[.12] dark:bg-[#17171f]/68 dark:shadow-[0_16px_48px_rgba(0,0,0,.28),inset_0_1px_0_rgba(255,255,255,.06)] ${expanded ? "rounded-[25px]" : "rounded-full"} ${transitioning ? "-translate-y-6 scale-[1.018] shadow-[0_26px_80px_rgba(76,67,180,.24)]" : "hover:shadow-[0_16px_52px_rgba(53,58,108,.16)]"}`}
      >
        <div className="flex w-full items-end gap-2 p-2">
          <button
            type="button"
            onClick={openCanvas}
            disabled={transitioning}
            aria-label="Open a blank North Star canvas"
            title="Open Canvas"
            className="mb-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#66677a] transition duration-300 hover:bg-white/65 hover:text-[#604ee0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7967ee]/60 disabled:opacity-50 dark:text-[#aaa7b5] dark:hover:bg-white/[.08] dark:hover:text-[#c0b7ff]"
          >
            <Layers3 className="h-[18px] w-[18px]" strokeWidth={1.7} />
          </button>

          <label htmlFor="northstar-home-prompt" className="sr-only">Ask North Star anything</label>
          <textarea
            ref={textareaRef}
            id="northstar-home-prompt"
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={transitioning}
            placeholder="Ask North Star anything…"
            rows={1}
            className="min-h-11 flex-1 resize-none overflow-y-auto border-none bg-transparent px-1 py-3 text-[14px] leading-5 text-[#171720] outline-none placeholder:text-[#737587] disabled:opacity-70 dark:text-white dark:placeholder:text-[#8f8c9c] [&::-webkit-scrollbar]:hidden"
          />

          <div className="relative mb-0.5 shrink-0">
            <button
              type="button"
              onClick={openCanvas}
              disabled={transitioning}
              aria-label={hasPrompt ? "Continue in Canvas with this prompt" : "Open a blank North Star canvas"}
              className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-white/35 bg-[linear-gradient(145deg,#7187ed_0%,#586bd5_44%,#484994_100%)] text-white shadow-[0_6px_17px_rgba(67,79,176,.28),inset_0_1px_0_rgba(255,255,255,.34),inset_0_-1px_0_rgba(35,38,104,.2)] transition duration-300 hover:-translate-y-0.5 hover:saturate-[1.08] hover:brightness-[1.04] hover:shadow-[0_9px_23px_rgba(67,79,176,.34),inset_0_1px_0_rgba(255,255,255,.38)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7083e8]/70 focus-visible:ring-offset-2 active:translate-y-0 active:scale-95 disabled:opacity-60 dark:border-white/[.18] dark:bg-[linear-gradient(145deg,#7d8ff0_0%,#6173da_45%,#4b4c99_100%)] dark:shadow-[0_7px_20px_rgba(20,25,80,.38),inset_0_1px_0_rgba(255,255,255,.3)] dark:focus-visible:ring-offset-[#17171f]"
            >
              <ArrowUp className={`relative h-[17px] w-[17px] transition duration-300 ${transitioning ? "-translate-y-0.5" : ""}`} strokeWidth={2.15} />
            </button>
          </div>
        </div>
        <p className="sr-only" role="status" aria-live="polite">{transitioning ? "Opening North Star Canvas" : ""}</p>
      </div>

      {transitioning && (
        <div
          data-testid="northstar-gateway-transition"
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[90] animate-[northstarGatewayVeil_620ms_cubic-bezier(.22,1,.36,1)_forwards] bg-[radial-gradient(ellipse_70%_52%_at_50%_100%,rgba(119,98,245,.24),rgba(102,135,225,.09)_45%,transparent_76%)] dark:bg-[radial-gradient(ellipse_70%_52%_at_50%_100%,rgba(116,91,255,.24),rgba(53,63,145,.12)_45%,transparent_76%)]"
        />
      )}
    </>
  );
}
