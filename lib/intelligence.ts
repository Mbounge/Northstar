import { getDashboardData, BusinessPage } from "./data";

export interface AssetReference {
  id: string;
  type: 'job' | 'post' | 'screen' | 'person';
  title: string;
  imageUrl?: string;
  metadata?: string;
}

// Helper to find job screenshots with Snapshot Support
const findJobScreenshotPath = (jobTitle: string, pages: BusinessPage[], companyId: string, snapshotId: string) => {
  if (!pages || pages.length === 0) return undefined;

  const normalizedTitle = jobTitle.replace(/[\\/*?:"<>|]/g, '-').trim().replace(/ /g, '_'); 
  const targetPrefix = `Job_${normalizedTitle}`;
  const matches: string[] =[];

  pages.forEach(page => {
    if (page.name.startsWith(targetPrefix)) {
       matches.push(...page.screenshots);
    }
  });

  matches.sort((a, b) => {
    if (a.includes("FULLPAGE")) return -1;
    if (b.includes("FULLPAGE")) return 1;
    return 0;
  });

  if (matches.length > 0) {
    const filename = matches[0].split('/').pop();
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${companyId}/snapshots/${snapshotId}/business/screenshots/${filename}`;
  }
  
  return undefined;
};

export async function buildStrategicContext(companyId: string) {
  const data = await getDashboardData(companyId);
  
  if (!data || !data.mobile) return null;

  const { snapshotId } = data; 
  const assets: AssetReference[] =[];
  let contextText = `ANALYSIS TARGET: ${companyId}\n\n`;

  // --- 1. PRODUCT PILLAR ---
  contextText += "=== PILLAR 1: PRODUCT (Mobile & Web) ===\n";
  contextText += `Mobile App Structure: ${data.mobile.tabs.length} Tabs found.\n`;
  data.mobile.tabs.forEach((tab: any) => {
    contextText += `- Tab "${tab.name}": Contains sections like ${tab.interactions?.map((i:any) => i.section).join(', ')}.\n`;
    tab.interactions?.forEach((i: any) => {
      const assetId = `mobile_${i.section}_${i.clicked_text}`.replace(/[^a-zA-Z0-9]/g, '_');
      assets.push({
        id: assetId,
        type: 'screen',
        title: `Mobile: ${i.section}`,
        imageUrl: i.screenshots[0] ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${companyId}/snapshots/${snapshotId}/product/mobile/screenshots/${i.screenshots[0].split('/').pop()}` : undefined
      });
    });
  });

  // Web Summary
  contextText += `\nWeb Platform Flows: ${data.web?.length} flows mapped.\n`;
  data.web?.forEach((flow: any) => {
    contextText += `- Flow: ${flow.flow_name} (${flow.screenshots.length} steps)\n`;
    const assetId = `web_${flow.flow_name}`.replace(/[^a-zA-Z0-9]/g, '_');
    assets.push({
      id: assetId,
      type: 'screen',
      title: `Web Flow: ${flow.flow_name}`,
      imageUrl: flow.screenshots[0] ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${companyId}/snapshots/${snapshotId}/product/web/screenshots/${flow.screenshots[0].split('/').pop()}` : undefined
    });
  });

  // --- 2. MARKETING PILLAR ---
  contextText += "\n=== PILLAR 2: MARKETING (Social Signals) ===\n";
  const recentPosts = data.marketing?.slice(0, 15) ||[]; 
  
  recentPosts.forEach((post: any, idx: number) => {
    const assetId = `post_${idx}`;
    const safeText = post.raw_text || "Image only content"; 
    
    contextText += `[ID: ${assetId}] ${post.platform} (${post.timestamp}): ${safeText.substring(0, 150)}...\n`;
    contextText += `   Sentiment: ${post.meta?.sentiment}, Category: ${post.meta?.category}\n`;
    
    assets.push({
      id: assetId,
      type: 'post',
      title: `${post.platform} Post`,
      imageUrl: post.screenshot ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data/${companyId}/snapshots/${snapshotId}/marketing/screenshots/${post.screenshot.split('/').pop()}` : undefined,
      metadata: safeText
    });
  });

  // --- 3. BUSINESS PILLAR ---
  contextText += "\n=== PILLAR 3: BUSINESS (Hiring & Org) ===\n";
  const jobs = data.business?.jobs ||[];
  const pages = data.business?.pages ||[];

  contextText += `Open Positions: ${jobs.length}\n`;
  jobs.forEach((job: any, idx: number) => {
    const assetId = `job_${idx}`;
    contextText += `[ID: ${assetId}] Role: ${job.title}\n`;
    const imagePath = findJobScreenshotPath(job.title, pages, companyId, snapshotId);

    assets.push({
      id: assetId,
      type: 'job',
      title: `Job: ${job.title}`,
      imageUrl: imagePath,
      metadata: JSON.stringify(job.intelligence)
    });
  });

  contextText += `\nKey People Identified: ${data.roster?.length || 0}\n`;
  data.roster?.forEach((p: any) => {
    contextText += `- ${p.name} (${p.role})\n`;
  });

  return { contextText, assets };
}