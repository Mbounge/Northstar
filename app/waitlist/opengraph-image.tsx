import { ImageResponse } from "next/og";
export const alt = "Northstar — Your creative studio. On one canvas. Join the waitlist.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function OpenGraphImage() {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", background: "#10101a", color: "#f2eff9", display: "flex", flexDirection: "column", padding: "64px 72px", fontFamily: "sans-serif" }}><div style={{ fontSize: 30, display: "flex", marginBottom: 63 }}>Northstar</div><div style={{ fontSize: 73, letterSpacing: -3, lineHeight: 1.1, display: "flex", flexDirection: "column" }}><span>Your creative studio.</span><span style={{ color: "#bba5ef" }}>On one canvas.</span></div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", fontSize: 24 }}><span style={{ color: "#c6b1ef" }}>Join the waitlist →</span><span style={{ fontSize: 20, color: "#8e849f" }}>usenorthstar.ai</span></div></div>, size);
}
