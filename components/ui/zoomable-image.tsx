"use client";

import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

// Helper component for the buttons
const Controls = () => {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-700 p-1.5 rounded-full shadow-xl z-50">
      <button 
        onClick={() => zoomIn()} 
        className="p-2 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors"
        title="Zoom In"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
      <button 
        onClick={() => zoomOut()} 
        className="p-2 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors"
        title="Zoom Out"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
      <div className="w-px h-4 bg-zinc-700 mx-1" />
      <button 
        onClick={() => resetTransform()} 
        className="p-2 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors"
        title="Reset"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
    </div>
  );
};

interface ZoomableImageProps {
  src: string;
  alt: string;
}

export function ZoomableImage({ src, alt }: ZoomableImageProps) {
  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black">
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={4}
        centerOnInit
      >
        <>
          <Controls />
          <TransformComponent 
            wrapperStyle={{ width: "100%", height: "100%" }}
            contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {/* Image needs explicit styling to play nice with the transform engine */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={src} 
              alt={alt} 
              className="max-w-full max-h-full object-contain"
              style={{ width: "auto", height: "auto" }}
            />
          </TransformComponent>
        </>
      </TransformWrapper>
    </div>
  );
}