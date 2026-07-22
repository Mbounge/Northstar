import React from "react";
import { createRoot } from "react-dom/client";
import { NorthstarPhase4E2EHarness } from "@/components/canvas/testing/northstar-phase4-e2e-harness";

const root = document.getElementById("root");
if (!root) throw new Error("Phase 4 browser harness root is missing.");
createRoot(root).render(<NorthstarPhase4E2EHarness />);
