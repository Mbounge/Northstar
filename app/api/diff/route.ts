// //app/api/diff/route.ts

// import { NextRequest, NextResponse } from "next/server";
// import { GoogleGenerativeAI } from "@google/generative-ai";
// import { getAvailableSnapshots, getDashboardData } from "@/lib/data";
// import { createClient } from "@supabase/supabase-js";
// import path from "path";

// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
// const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
// export const maxDuration = 60; 

// interface DeltaChange { pillar: "Mobile" | "Web"; section: string; severity: "HIGH" | "MEDIUM" | "LOW"; description: string; image_old?: string; image_new?: string; }
// interface DeltaReport { timestamp: string; compared_against: string; changes: DeltaChange[]; }

// const fetchSnapshotImage = async (companyId: string, snapshotId: string, subFolder: string, filenameRaw: string) => {
//   const filename = filenameRaw.split('/').pop();
//   const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${companyId}/snapshots/${snapshotId}/${subFolder}/${filename}`;
//   try {
//     const res = await fetch(url);
//     if (res.ok) {
//       const arrayBuffer = await res.arrayBuffer();
//       return { inlineData: { data: Buffer.from(arrayBuffer).toString("base64"), mimeType: "image/jpeg" } };
//     }
//   } catch (e) { console.error(`Error loading image ${filenameRaw}:`, e); }
//   return null;
// };

// async function compareMobileSnapshots(companyId: string, newSnapId: string, oldSnapId: string): Promise<DeltaChange[]> {
//   const changes: DeltaChange[] =[];
//   const newData = await getDashboardData(companyId, newSnapId);
//   const oldData = await getDashboardData(companyId, oldSnapId);

//   if (!newData?.mobile || !oldData?.mobile) return[];

//   for (const newTab of newData.mobile.tabs) {
//     const oldTab = oldData.mobile.tabs.find((t: any) => t.name === newTab.name);
    
//     if (!oldTab) {
//       changes.push({ pillar: "Mobile", section: newTab.name, severity: "HIGH", description: `New Navigation Tab detected: "${newTab.name}".`, image_new: newTab.survey_screenshots?.[0] });
//       continue;
//     }

//     const newImgPaths = newTab.survey_screenshots?.slice(0, 3) ||[];
//     const oldImgPaths = oldTab.survey_screenshots?.slice(0, 3) ||[];
//     if (newImgPaths.length === 0 || oldImgPaths.length === 0) continue;

//     const newImages = (await Promise.all(newImgPaths.map((p: string) => fetchSnapshotImage(companyId, newSnapId, 'product/mobile/screenshots', p))))
//       .filter((img) => img !== null) as { inlineData: { data: string; mimeType: string } }[];
      
//     const oldImages = (await Promise.all(oldImgPaths.map((p: string) => fetchSnapshotImage(companyId, oldSnapId, 'product/mobile/screenshots', p))))
//       .filter((img) => img !== null) as { inlineData: { data: string; mimeType: string } }[];

//     if (newImages.length === 0 || oldImages.length === 0) continue;

//     const prompt = `You are a Senior Product Designer performing a "Visual Regression & Structural Diff". I will show you Sequence A (OLD) and Sequence B (NEW). Identify only STRUCTURAL DESIGN CHANGES. Ignore scrolling, different data, or content dates. Valid changes: new sections, nav changes, layout redesigns. OUTPUT JSON: { "changed": true/false, "severity": "HIGH/MEDIUM/LOW", "description": "Concise description." }`;

//     try {
//       const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
//       const result = await model.generateContent([prompt, "\n--- SEQUENCE A (OLD) ---\n", ...oldImages, "\n--- SEQUENCE B (NEW) ---\n", ...newImages]);
//       const analysis = JSON.parse(result.response.text().replace(/```json/g, "").replace(/```/g, "").trim());

//       if (analysis.changed) {
//         const fixPath = (raw: string, snapId: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${companyId}/snapshots/${snapId}/product/mobile/screenshots/${path.basename(raw)}`;
//         changes.push({
//           pillar: "Mobile", section: newTab.name, severity: analysis.severity || "MEDIUM",
//           description: analysis.description, image_old: fixPath(oldImgPaths[0], oldSnapId), image_new: fixPath(newImgPaths[0], newSnapId)
//         });
//       }
//     } catch (e) { console.error(`AI Diff failed for ${newTab.name}`, e); }
//   }
//   return changes;
// }

// export async function POST(req: NextRequest) {
//   try {
//     const { companyId } = await req.json();
//     const snapshots = await getAvailableSnapshots(companyId);
//     if (snapshots.length < 2) return NextResponse.json({ message: "Need 2 snapshots", count: snapshots.length });

//     // Snapshots array is now oldest to newest. We want the two most recent.
//     const currentSnapshotId = snapshots[snapshots.length - 1]; 
//     const previousSnapshotId = snapshots[snapshots.length - 2]; 

//     const mobileChanges = await compareMobileSnapshots(companyId, currentSnapshotId, previousSnapshotId);
    
//     const report: DeltaReport = {
//       timestamp: new Date().toISOString(),
//       compared_against: previousSnapshotId,
//       changes: [...mobileChanges]
//     };

//     // Upload Report back to Supabase
//     await supabase.storage.from('data').upload(`${companyId}/snapshots/${currentSnapshotId}/product/delta_report.json`, JSON.stringify(report, null, 2), {
//       upsert: true,
//       contentType: 'application/json'
//     });

//     return NextResponse.json({ success: true, changesFound: report.changes.length });
//   } catch (error) {
//     return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
//   }
// }