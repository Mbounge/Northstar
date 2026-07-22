"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface NorthstarProjectionFrameRegistration {
  artifactId: string;
  frame: HTMLIFrameElement;
}

export interface NorthstarArchitectureContextValue {
  enabled: boolean;
  /** Only this artifact is owned by the direct writer. All other artifacts keep the established host. */
  directArtifactId: string | null;
  registerProjectionFrame(registration: NorthstarProjectionFrameRegistration): () => void;
}

const DISABLED_CONTEXT: NorthstarArchitectureContextValue = {
  enabled: false,
  directArtifactId: null,
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
