export type Simulator = { slug: string; path: string; embedPath: string };

const simulators: Record<string, Simulator> = {
  graet: {
    slug: "graet",
    path: "/preview-lab/replica/graet",
    embedPath: "/preview-lab/replica/graet?embedded=1",
  },
};

export function simulatorForApp(appName: string): Simulator | null {
  return simulators[appName.trim().toLocaleLowerCase("en-US")] ?? null;
}
