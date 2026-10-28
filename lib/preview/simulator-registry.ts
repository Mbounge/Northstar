export type Simulator = { slug: string; path: string; embedPath: string; assetRoot?: string };

const simulators: Record<string, Simulator> = {
  medito: {
    slug: "medito",
    path: "/preview-lab/replica/medito",
    embedPath: "/preview-lab/replica/medito?embedded=1",
  },
  graet: {
    slug: "graet",
    assetRoot: "/graet-replica/",
    path: "/preview-lab/replica/graet",
    embedPath: "/preview-lab/replica/graet?embedded=1",
  },
};

export function simulatorForApp(appName: string): Simulator | null {
  return simulators[appName.trim().toLocaleLowerCase("en-US")] ?? null;
}

/** Canvas reuse requires the approved source/asset adapter, beyond a viewable preview. */
export function canvasSimulatorForApp(appName: string): Simulator | null {
  const simulator = simulatorForApp(appName);
  return simulator?.assetRoot ? simulator : null;
}
