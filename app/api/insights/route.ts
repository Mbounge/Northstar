//app/api/insights/route.ts

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDashboardData } from "@/lib/data";
import fs from "fs";
import path from "path";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
export const maxDuration = 60; 

// --- TYPES & HELPERS (Unchanged) ---
// ... keep InsightResult, cleanJson, findJobImage, findProductImage ...
interface InsightResult {
  title: string;
  content: string;
  impact: 'High' | 'Medium' | 'Low';
  pillar: 'Product' | 'Marketing' | 'Business';
  reference_ids?: number[];
}

const cleanJson = (text: string) => text.replace(/```json/g, "").replace(/```/g, "").trim();

const findJobImage = (jobTitle: string, companyId: string, snapshotId: string, pages: any[]) => {
    if (!pages) return null;
    const normalized = jobTitle.replace(/[\\/*?:"<>|]/g, '-').trim().replace(/ /g, '_');
    const prefix = `Job_${normalized}`;
    
    const match = pages.find((p: any) => p.name.startsWith(prefix));
    if (match && match.screenshots.length > 0) {
        return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${companyId}/snapshots/${snapshotId}/business/screenshots/${match.screenshots[0].split('/').pop()}`;
    }
    return null;
};

const findProductImage = (flowName: string, companyId: string, snapshotId: string, type: 'web' | 'mobile', data: any) => {
    if (type === 'web') {
        const flow = data.web?.find((w: any) => w.flow_name === flowName);
        if (flow?.screenshots?.[0]) {
             return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${companyId}/snapshots/${snapshotId}/product/web/screenshots/${flow.screenshots[0].split('/').pop()}`;
        }
    } else {
        const tab = data.mobile?.tabs.find((t: any) => t.name === flowName);
        if (tab?.survey_screenshots?.[0]) {
            return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${companyId}/snapshots/${snapshotId}/product/mobile/screenshots/${tab.survey_screenshots[0].split('/').pop()}`;
        }
    }
    return null;
};

// --- AGENTS (Updated to use passed data, companyId, snapshotId) ---
// ... analyzeMarketing, analyzeBusiness, analyzeProduct remain mostly the same, 
// just ensure they use the passed 'snapshotId' for image paths ...

async function analyzeMarketing(data: any, companyId: string, snapshotId: string) {
  if (!data.marketing || data.marketing.length === 0) return [];
  const items = data.marketing.slice(0, 20);
  const context = items.map((p: any, i: number) => 
    `ITEM_ID [${i}]: Platform: ${p.platform} | Text: "${(p.raw_text || "").substring(0, 200)}..."`
  ).join("\n");

  const prompt = `
  Analyze these social media signals for ${companyId}.
  DATA: ${context}
  GUIDELINES: Write like an Insider Analyst. Group related posts. Return ITEM_IDs.
  OUTPUT JSON ARRAY: [{ "title": "Headline", "content": "Analysis.", "impact": "High/Medium", "reference_ids": [0, 2] }]
  `;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });
    const insights = JSON.parse(cleanJson(result.response.text()));
    
    return insights.map((insight: any) => {
      const images = (insight.reference_ids || []).map((id: number) => {
        const post = items[id];
        if (post && post.screenshot) {
          return `/data/${companyId}/snapshots/${snapshotId}/marketing/screenshots/${post.screenshot.split('/').pop()}`;
        }
        return null;
      }).filter(Boolean);

      return { ...insight, pillar: "Marketing", images };
    });
  } catch (e) { return []; }
}

async function analyzeBusiness(data: any, companyId: string, snapshotId: string) {
  if (!data.business?.jobs) return [];
  const jobs = data.business.jobs.slice(0, 20);
  const pages = data.business.pages || [];
  const context = jobs.map((j: any, i: number) => `ITEM_ID [${i}]: Role: ${j.title}`).join("\n");

  const prompt = `
  Analyze these job openings for ${companyId}.
  DATA: ${context}
  GUIDELINES: Identify strategic shifts (e.g. "Hiring Mobile Devs" = "Mobile Focus"). Return ITEM_IDs.
  OUTPUT JSON ARRAY: [{ "title": "Headline", "content": "Analysis.", "impact": "High/Medium", "reference_ids": [0] }]
  `;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });
    const insights = JSON.parse(cleanJson(result.response.text()));

    return insights.map((insight: any) => {
      const images = (insight.reference_ids || []).map((id: number) => {
        const job = jobs[id];
        if (job) {
            return findJobImage(job.title, companyId, snapshotId, pages);
        }
        return null;
      }).filter(Boolean);

      return { ...insight, pillar: "Business", images };
    });
  } catch (e) { return []; }
}

async function analyzeProduct(data: any, companyId: string, snapshotId: string) {
  if (!data.mobile && !data.web) return [];
  const webFlows = data.web || [];
  const mobileTabs = data.mobile?.tabs || [];
  const items: any[] = [
      ...webFlows.map((w: any) => ({ type: 'web', name: w.flow_name, raw: w })),
      ...mobileTabs.map((t: any) => ({ type: 'mobile', name: t.name, raw: t }))
  ];
  const context = items.map((item: any, i: number) => `ITEM_ID [${i}]: Type: ${item.type} | Name: ${item.name}`).join("\n");

  const prompt = `
  Analyze these app features/pages for ${companyId}.
  DATA: ${context}
  GUIDELINES: No jargon. Convert internal names to English. Return ITEM_IDs.
  OUTPUT JSON ARRAY: [{ "title": "Headline", "content": "Analysis.", "impact": "High/Medium", "reference_ids": [0] }]
  `;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025" });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });
    const insights = JSON.parse(cleanJson(result.response.text()));

    return insights.map((insight: any) => {
        const images = (insight.reference_ids || []).map((id: number) => {
            const item = items[id];
            if (item) {
                return findProductImage(item.name, companyId, snapshotId, item.type, data);
            }
            return null;
        }).filter(Boolean);

        return { ...insight, pillar: "Product", images };
    });
  } catch (e) { return []; }
}

// --- MAIN HANDLER ---
export async function POST(req: NextRequest) {
  try {
    // UPDATED: Now receives snapshotId
    const { companyId, snapshotId } = await req.json();
    
    // UPDATED: Fetches specific snapshot data
    const rawData = await getDashboardData(companyId, snapshotId);

    if (!rawData || !rawData.snapshotId) return NextResponse.json({ error: "No data" }, { status: 404 });

    // Use the confirmed snapshot ID from the data loader
    const confirmedSnapshotId = rawData.snapshotId;

    const [marketing, business, product] = await Promise.all([
      analyzeMarketing(rawData, companyId, confirmedSnapshotId),
      analyzeBusiness(rawData, companyId, confirmedSnapshotId),
      analyzeProduct(rawData, companyId, confirmedSnapshotId)
    ]);

    const allInsights = [...marketing, ...business, ...product];
    
    const impactScore = { "High": 3, "Medium": 2, "Low": 1 };
    allInsights.sort((a, b) => (impactScore[b.impact as keyof typeof impactScore] || 0) - (impactScore[a.impact as keyof typeof impactScore] || 0));

    return NextResponse.json({ insights: allInsights });

  } catch (error) {
    console.error("Insights Generation Failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}