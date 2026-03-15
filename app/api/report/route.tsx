//app/api/report/route.ts

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDashboardData } from "@/lib/data";
import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToStream, Font } from "@react-pdf/renderer";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
export const maxDuration = 60; 

Font.register({
  family: "Helvetica",
  fonts:[
    { src: "https://cdn.jsdelivr.net/npm/@canvas-fonts/helvetica@1.0.4/Helvetica.ttf" },
    { src: "https://cdn.jsdelivr.net/npm/@canvas-fonts/helvetica@1.0.4/Helvetica-Bold.ttf", fontWeight: "bold" },
  ],
});

const pdfStyles = StyleSheet.create({
  page: { padding: 50, fontFamily: "Helvetica", fontSize: 11, lineHeight: 1.5, color: "#111" },
  header: { marginBottom: 30, borderBottomWidth: 1, borderBottomColor: "#ccc", paddingBottom: 10 },
  title: { fontSize: 18, fontWeight: "bold", textTransform: "uppercase", letterSpacing: 0.5 },
  subtitle: { fontSize: 9, color: "#666", marginTop: 4 },
  section: { marginBottom: 25 },
  heading: { fontSize: 12, fontWeight: "bold", color: "#000", marginBottom: 8, textTransform: "uppercase", borderBottomWidth: 1, borderBottomColor: "#eee", paddingBottom: 4 },
  text: { marginBottom: 6, textAlign: "justify" },
  footer: { position: "absolute", bottom: 30, left: 50, right: 50, textAlign: "center", fontSize: 8, color: "#999", borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 10 },
});

const cleanText = (text: string) => {
  if (!text) return "";
  return text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/##/g, '').replace(/#/g, '').replace(/`/g, '').trim();
};

const fetchImageBufferForAI = async (url: string) => {
  try {
    const res = await fetch(url);
    if (res.ok) {
      const ab = await res.arrayBuffer();
      return { inlineData: { data: Buffer.from(ab).toString("base64"), mimeType: "image/jpeg" } };
    }
  } catch (e) {}
  return null;
};

async function runProductAgent(data: any, companyId: string, snapshotId: string) {
  const mobileUrls = data.mobile?.tabs.map((t:any) => t.survey_screenshots?.[0]).filter(Boolean).slice(0, 5) ||[];
  const webUrls = data.web?.map((w:any) => w.screenshots?.[0]).filter(Boolean).slice(0, 3) ||[];
  
  const allImages = (await Promise.all(
    [...mobileUrls, ...webUrls].map(url => fetchImageBufferForAI(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${companyId}/snapshots/${snapshotId}/product/mobile/screenshots/${url.split('/').pop()}`))
  )).filter((img) => img !== null) as { inlineData: { data: string; mimeType: string } }[];

  const prompt = `Analyze these screenshots of the Mobile App and Web Platform. Identify: 1. Key Features & Complexity. 2. UX/UI Modernity. 3. User Flows. Provide a dense, professional summary of the Product Strategy.`;
  const result = await genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" }).generateContent([prompt, ...allImages]);
  return result.response.text();
}

async function runMarketingAgent(data: any, companyId: string, snapshotId: string) {
  const postsText = data.marketing?.slice(0, 30).map((p:any) => `[${p.platform}] ${p.timestamp}: ${p.raw_text?.substring(0, 200) || "No text"}`).join("\n") || "No text data.";
  const prompt = `Analyze these social media posts and captions. Identify: 1. Brand Voice. 2. Key Campaigns. 3. Content Frequency. Provide a dense, professional summary of the Marketing Strategy. POSTS: ${postsText}`;
  const result = await genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" }).generateContent([prompt]);
  return result.response.text();
}

async function runBusinessAgent(data: any) {
  const jobsText = data.business?.jobs?.slice(0, 8).map((j:any) => j.title).join(", ") || "No job data.";
  const rosterText = data.roster?.map((p:any) => `${p.name} (${p.role})`).join(", ") || "No roster data.";
  const prompt = `Analyze these Job Titles and Org Chart. Identify: 1. Strategic Focus (Hiring). 2. Tech Stack hints. 3. Leadership Structure. Provide a dense, professional summary of the Business Strategy. ROSTER: ${rosterText}. JOBS: ${jobsText}`;
  const result = await genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" }).generateContent([prompt]);
  return result.response.text();
}

async function runFinalSynthesis(productReport: string, marketingReport: string, businessReport: string, companyId: string) {
  const prompt = `You are the Chief Strategy Officer. Synthesize these reports. TARGET: ${companyId.toUpperCase()}. [PRODUCT] ${productReport} [MARKETING] ${marketingReport} [BUSINESS] ${businessReport}. Synthesize into a "Competitor Situation Report" (SITREP). Be Direct, Objective, and Tactical. No Markdown formatting. OUTPUT JSON FORMAT: { "executive_summary": "...", "product_section": "...", "marketing_section": "...", "business_section": "...", "key_prediction": "..." }`;
  const result = await genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" }).generateContent(prompt);
  return JSON.parse(result.response.text().replace(/```json/g, "").replace(/```/g, "").trim());
}

const StrategyReport = ({ data, companyId }: { data: any, companyId: string }) => (
  <Document>
    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.header}>
        <Text style={pdfStyles.title}>COMPANY INTEL: {companyId.toUpperCase()}</Text>
        <Text style={pdfStyles.subtitle}>GENERATED: {new Date().toLocaleDateString()} | CONFIDENTIAL</Text>
      </View>
      <View style={pdfStyles.section}><Text style={pdfStyles.heading}>1. Executive Summary</Text><Text style={pdfStyles.text}>{cleanText(data.executive_summary)}</Text></View>
      <View style={pdfStyles.section}><Text style={pdfStyles.heading}>2. Product Architecture</Text><Text style={pdfStyles.text}>{cleanText(data.product_section)}</Text></View>
      <View style={pdfStyles.section}><Text style={pdfStyles.heading}>3. Market Positioning</Text><Text style={pdfStyles.text}>{cleanText(data.marketing_section)}</Text></View>
      <View style={pdfStyles.section}><Text style={pdfStyles.heading}>4. Organizational Posture</Text><Text style={pdfStyles.text}>{cleanText(data.business_section)}</Text></View>
      <View style={pdfStyles.section}><Text style={[pdfStyles.heading, { backgroundColor: "#111", color: "#fff", padding: 4 }]}>5. Strategic Prediction</Text><Text style={[pdfStyles.text, { fontWeight: "bold" }]}>{cleanText(data.key_prediction)}</Text></View>
      <View style={pdfStyles.footer}><Text>CompetitorOS Automated Intelligence • Do Not Distribute</Text></View>
    </Page>
  </Document>
);

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json();
    const rawData = await getDashboardData(companyId);
    if (!rawData) return NextResponse.json({ error: "No data" }, { status: 404 });

    const [productAnalysis, marketingAnalysis, businessAnalysis] = await Promise.all([
      runProductAgent(rawData, companyId, rawData.snapshotId!),
      runMarketingAgent(rawData, companyId, rawData.snapshotId!),
      runBusinessAgent(rawData)
    ]);

    const finalReport = await runFinalSynthesis(productAnalysis, marketingAnalysis, businessAnalysis, companyId);
    const stream = await renderToStream(<StrategyReport data={finalReport} companyId={companyId} />);
    
    return new NextResponse(stream as any, {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${companyId}_SITREP.pdf"` },
    });
  } catch (error) {
    return NextResponse.json({ error: "Generation Failed" }, { status: 500 });
  }
}