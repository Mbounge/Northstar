"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface NorthstarProjectionFrameRegistration {
  artifactId: string;
  frame: HTMLIFrameElement;
}

export interface NorthstarArchitectureContextValue {
  enabled: boolean;
  registerProjectionFrame(registration: NorthstarProjectionFrameRegistration): () => void;
}

const DISABLED_CONTEXT: NorthstarArchitectureContextValue = {
  enabled: false,
  registerProjectionFrame() {
    return () => undefined;
  },
};

const NorthstarArchitectureContext = createContext<NorthstarArchitectureContextValue>(DISABLED_CONTEXT);

export function NorthstarArchitectureProvider({
  value,
  children,
}: {
  value: NorthstarArchitectureContextValue;
  children: ReactNode;
}) {
  return (
    <NorthstarArchitectureContext.Provider value={value}>
      {children}
    </NorthstarArchitectureContext.Provider>
  );
}

export function useNorthstarArchitecture(): NorthstarArchitectureContextValue {
  return useContext(NorthstarArchitectureContext);
}
