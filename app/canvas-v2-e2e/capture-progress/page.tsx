import { notFound } from "next/navigation";
import { CaptureProgressView, type CaptureProgress } from "@/components/admin/capture-progress";

const preview: CaptureProgress = {
  tabs: [
    { name: "Home", state: "needs_followup", screens: 52, open_checks: [
      { path: "Home > Community", reason: "App context changed after swipe; the section survey could not be verified.", impact: "broad" },
      { path: "Home > For you", reason: "Changing cards made the visual end of the section uncertain.", impact: "broad" },
      { path: "Home > Community > Dam Featured Card", reason: "Capture limit reached; the bottom of this page was not confirmed.", impact: "local" },
      { path: "Home > Community > More on this day", reason: "Capture limit reached; the bottom of this page was not confirmed.", impact: "local" },
    ], subviews: [
      { name: "Home > Community", state: "needs_followup", screens: 6 },
      { name: "Home > For you", state: "needs_followup", screens: 1 },
    ] },
    { name: "Saved", state: "capturing", screens: 2, open_checks: [], subviews: [
      { name: "Saved > All articles", state: "capturing", screens: 1 },
      { name: "Saved > Collections", state: "needs_followup", screens: 1 },
    ] },
    { name: "Search", state: "not_reached", screens: 0, open_checks: [], subviews: [] },
    { name: "Activity", state: "not_reached", screens: 0, open_checks: [], subviews: [] },
    { name: "More", state: "not_reached", screens: 0, open_checks: [], subviews: [] },
  ],
  areas: [
    { name: "Profile", state: "not_identified", screens: 0 },
    { name: "Settings", state: "not_identified", screens: 0 },
  ],
  identified_tabs: 5,
  visited_tabs: 2,
  done_tabs: 0,
  navigation_percent: 40,
  current_path: "Saved > All articles",
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
