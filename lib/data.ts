// lib/data.ts
import { supabase } from './supabase';

// --- TYPES ---
export interface MobileInteraction { section: string; clicked_text: string; screenshots: string[]; }
export interface MobileTab { name: string; survey_screenshots: string[]; interactions: MobileInteraction[]; }
export interface MobileSession { app: string; tabs: MobileTab[]; }
export interface WebManifest { flow_name: string; url: string; screenshots: string[]; }
export interface SocialPost { id?: string; platform: string; entity: string; url?: string; raw_text: string; screenshot: string; timestamp: string; comments?: string[]; meta?: { sentiment?: string; category?: string; summary?: string; }; }
export interface BusinessPage { name: string; url: string; screenshots: string[]; intelligence?: any; }
export interface BusinessJob { title: string; url: string; captured?: boolean; screenshots?: string[]; text_file?: string; intelligence?: any; }
export interface BusinessManifest { company: string; timestamp: string; pages: BusinessPage[]; jobs: BusinessJob[]; }
export interface RosterPerson { name: string; role: string; type: string; socials?: { linkedin?: string; twitter?: string; instagram?: string; }; profile_screenshots?: string; }
export interface DeltaChange { pillar: "Mobile" | "Web"; section: string; severity: "HIGH" | "MEDIUM" | "LOW"; description: string; image_old?: string; image_new?: string; }
export interface DeltaReport { timestamp: string; compared_against: string; tracking_period?: string; changes: DeltaChange[]; }
export interface CompanyMeta { id: string; name: string; lastScan: string; }

// --- HELPERS ---

// 1. Get List of Tracked Companies for a specific Tenant
export async function getTrackedCompanies(tenantId: string): Promise<CompanyMeta[]> {
  if (!tenantId) return [];
  const { data, error } = await supabase.storage.from('data').list(tenantId, { limit: 100 });
  if (error || !data) return [];
  
  // Supabase returns pseudo-folders without an ID
  const folders = data.filter(item => !item.id && item.name !== '.emptyFolderPlaceholder');
  
  return folders.map(folder => ({
    id: folder.name,
    name: folder.name.charAt(0).toUpperCase() + folder.name.slice(1),
    lastScan: new Date().toISOString().split('T')[0] 
  }));
}

// 2. Get All Snapshots for a Company within a Tenant
export async function getAvailableSnapshots(tenantId: string, companyId: string): Promise<string[]> {
  if (!tenantId || !companyId) return [];
  const { data, error } = await supabase.storage.from('data').list(`${tenantId}/${companyId}/snapshots`, { limit: 100 });
  if (error || !data) return [];
  
  // Return sorted ascending (oldest first)
  return data.filter(item => !item.id).map(s => s.name).sort(); 
}

// --- MAIN DATA LOADER ---
export async function getDashboardData(tenantId: string, companyId: string, specificSnapshotId?: string) {
  if (!tenantId || !companyId) return null;
  
  let snapshotId = specificSnapshotId;

  if (!snapshotId) {
    const snapshots = await getAvailableSnapshots(tenantId, companyId);
    if (snapshots.length > 0) {
      snapshotId = snapshots[0]; 
    }
  }

  if (!snapshotId) return null;

  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/data`;

  // Helper to fetch JSON from Supabase Public URL
  const readJson = async (subPath: string) => {
    try {
      const res = await fetch(`${publicUrl}/${tenantId}/${companyId}/snapshots/${snapshotId}/${subPath}`, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (error) {
      return null;
    }
  };

  // Fetch all pillars in parallel for speed
  const [mobileData, webData, marketingData, businessData, rosterData, deltaReport] = await Promise.all([
    readJson('product/mobile/session_manifest.json') as Promise<MobileSession | null>,
    readJson('product/web/ui_manifest.json') as Promise<WebManifest[] | null>,
    readJson('marketing/master_feed.json') as Promise<SocialPost[] | null>,
    readJson('business/master_manifest.json') as Promise<BusinessManifest | null>,
    readJson(`business/${companyId}_omni_roster.json`) as Promise<RosterPerson[] | null>,
    readJson('product/delta_report.json') as Promise<DeltaReport | null>
  ]);

  return {
    id: companyId,
    snapshotId: snapshotId,
    mobile: mobileData,
    web: webData,
    marketing: marketingData,
    business: businessData,
    roster: rosterData,
    deltaReport: deltaReport
  };
}