import { notFound } from "next/navigation";
import { CaptureProgressView, type CaptureProgress } from "@/components/admin/capture-progress";

const preview: CaptureProgress = {
  tabs: [
    { name: "Home", state: "capturing", screens: 144, subviews: [
      { name: "Home > Community", state: "needs_followup", screens: 6 },
      { name: "Home > For you", state: "capturing", screens: 1 },
    ] },
    { name: "Saved", state: "not_reached", screens: 0, subviews: [] },
    { name: "Search", state: "not_reached", screens: 0, subviews: [] },
    { name: "Activity", state: "not_reached", screens: 0, subviews: [] },
    { name: "More", state: "not_reached", screens: 0, subviews: [] },
  ],
  areas: [
    { name: "Profile", state: "not_identified", screens: 0 },
    { name: "Settings", state: "not_identified", screens: 0 },
  ],
  identified_tabs: 5,
  visited_tabs: 1,
  done_tabs: 0,
  navigation_percent: 20,
  current_path: "Home > For you",
  current_phase: "STRUCTURED_GRID",
  last_screen_at: Date.now() / 1000,
};

export default function CaptureProgressPreview() {
  if (process.env.NODE_ENV === "production" || process.env.NORTHSTAR_E2E !== "1") notFound();
  return <main className="min-h-screen bg-gradient-to-br from-[#e9e8f9] via-[#f6f8ff] to-[#f4f0ff] p-8 text-[#252339]">
    <div className="mx-auto max-w-[1280px]">
      <header className="mb-6 rounded-[20px] border border-white/80 bg-white/70 p-6 shadow-sm">
        <div className="text-[11px] font-bold uppercase tracking-[.16em] text-[#7859cf]">Capture studio / Wikipedia</div>
        <h1 className="mb-0 mt-2 text-[30px] font-semibold tracking-[-.045em]">Browsing capture</h1>
      </header>
      <CaptureProgressView progress={preview} />
    </div>
  </main>;
}
