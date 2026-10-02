// app/admin/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ShieldAlert, CheckCircle2, XCircle, Building2, Mail, Users, Plus, UserX, Search, Loader2, ArrowLeft, User as UserIcon, RefreshCw, Smartphone, FolderOpen, Megaphone } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { CaptureConsoleLive } from "@/components/admin/capture-console-live";
import { TenantWorkspace } from "@/components/admin/tenant-workspace";
import { MarketingStudio } from "@/components/admin/marketing-studio";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { Unbounded } from "next/font/google";

const unbounded = Unbounded({ subsets: ["latin"], weight: ["200", "300", "400", "600", "700"] });

type ActionType = "approve" | "reject" | "revoke";
type ToastType = "success" | "error" | "info";
type AdminTab = "requests" | "directory" | "customers" | "tenants" | "captures" | "marketing";
const adminTabs = new Set<AdminTab>(["requests", "directory", "customers", "tenants", "captures", "marketing"]);

export default function AdminDashboard() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<AdminTab>("tenants");
  
  // Real DB State
  const [users, setUsers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Custom Toast State
  const [toast, setToast] = useState<{
    isOpen: boolean; message: string; type: ToastType;
  }>({ isOpen: false, message: "", type: "success" });

  // Sync state per Organization
  const [syncingOrgId, setSyncingOrgId] = useState<string | null>(null);

  // Modals
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean; type: ActionType; user: any | null;
  }>({ isOpen: false, type: "approve", user: null });
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");

  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");

  // State for viewing an organization's users
  const [viewingOrgId, setViewingOrgId] = useState<string | null>(null);

  // Helper to trigger the beautiful inline Toast alert
  const showToast = (message: string, type: ToastType = "success") => {
    setToast({ isOpen: true, message, type });
    setTimeout(() => {
      setToast(prev => ({ ...prev, isOpen: false }));
    }, 5000); // Displays for 5 seconds before disappearing
  };

  // 1. Fetch real users and customers from Supabase
  const fetchData = async () => {
    setIsLoading(true);
    
    const { data: usersData } = await supabase
      .from('user_profiles')
      .select('*, customer:customers(name)')
      .order('created_at', { ascending: false });
      
    const { data: customersData } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true });

    if (usersData) setUsers(usersData);
    if (customersData) setCustomers(customersData);
    
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const readTab = () => {
      const requested = new URLSearchParams(window.location.search).get("tab") as AdminTab | null;
      setActiveTab(requested && adminTabs.has(requested) ? requested : "tenants");
    };
    readTab();
    window.addEventListener("popstate", readTab);
    return () => window.removeEventListener("popstate", readTab);
  }, []);

  const selectAdminTab = (tab: AdminTab) => {
    if (tab === activeTab) return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.pushState(null, "", url);
    setActiveTab(tab);
  };

  // Filtered views
  const pendingUsers = users.filter(u => u.status === "pending");
  const processedUsers = users.filter(u => u.status !== "pending");
  const filteredProcessedUsers = processedUsers.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.full_name && u.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.customer && u.customer.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.role && u.role.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleActionClick = (user: any, type: ActionType) => {
    setSelectedCompanyId(user.customer_id || ""); 
    setConfirmModal({ isOpen: true, type, user });
  };
  
  const executeAction = async () => {
    if (!confirmModal.user) return;
    
    if (confirmModal.type === "approve" && !selectedCompanyId) {
      showToast("You must assign the user to an organization to approve them.", "error");
      return;
    }

    const newStatus = confirmModal.type === "approve" ? "approved" : "rejected";
    const updatePayload = confirmModal.type === "approve" 
      ? { status: newStatus, customer_id: selectedCompanyId }
      : { status: newStatus, customer_id: null };

    const { error } = await supabase
      .from('user_profiles')
      .update(updatePayload)
      .eq('id', confirmModal.user.id);

    if (!error) {
      fetchData();
      setConfirmModal({ isOpen: false, type: "approve", user: null });
      setSelectedCompanyId("");
      showToast(`User successfully ${confirmModal.type}d!`, "success");
    } else {
      showToast("Failed to update user profile.", "error");
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    const { error } = await supabase
      .from('customers')
      .insert({ name: newOrgName.trim() });

    if (!error) {
      setNewOrgName("");
      setOrgModalOpen(false);
      fetchData(); 
      showToast(`Organization "${newOrgName.trim()}" created!`, "success");
    } else {
      showToast("Failed to create organization.", "error");
    }
  };

  // Triggers the background storage-to-db sync specifically for this organization ID
  const handleSyncOrganization = async (orgId: string) => {
    setSyncingOrgId(orgId);
    try {
      const res = await fetch(`/api/sync-db?tenant_id=${orgId}`);
      const data = await res.json();
      if (data.success) {
        showToast(data.message, "success");
        fetchData();
      } else {
        showToast(data.error || "Failed to sync organization.", "error");
      }
    } catch {
      showToast("An unexpected error occurred during synchronization.", "error");
    } finally {
      setSyncingOrgId(null);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "Unknown";
    try { return formatDistanceToNow(new Date(dateString), { addSuffix: true }); } 
    catch { return "Unknown"; }
  };

  const viewingOrg = viewingOrgId ? customers.find(c => c.id === viewingOrgId) : null;
  const orgUsersList = viewingOrgId ? users.filter(u => u.customer_id === viewingOrgId && u.status === "approved") : [];

  return (
    <div className="relative min-h-screen bg-[#eceef7] dark:bg-[#08090e] flex flex-col overflow-hidden font-sans text-[#20202a] dark:text-[#f6f5fb]">
      
      {/* ── AMBIENT BACKGROUND ── */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none flex items-center justify-center">
        <div 
          className="relative flex-shrink-0"
          style={{ 
            width: '1450px', 
            height: '1450px', 
            transform: 'rotate(310deg)',
            opacity: 0.3,
            mixBlendMode: "multiply",
            filter: "blur(48px)"
          }}
        >
          <Image 
            src="/topaz_enhance.png" 
            alt="Ambient Background" 
            fill 
            className="object-cover -scale-x-100" 
            priority 
            quality={80}
          />
        </div>
      </div>

      {/* ── INLINE THEME TOAST NOTIFICATION ── */}
      {toast.isOpen && (
        <div 
          className={`
            fixed bottom-8 right-8 z-[200] flex items-center gap-3.5 px-6 py-4 border shadow-2xl 
            animate-in slide-in-from-bottom-5 duration-300 rounded-2xl max-w-md
            ${toast.type === "success" ? "border-emerald-500/30 text-emerald-400 bg-emerald-950/20" : ""}
            ${toast.type === "error" ? "border-rose-500/30 text-rose-400 bg-rose-950/20" : ""}
            ${toast.type === "info" ? "border-sky-500/30 text-sky-400 bg-sky-950/20" : ""}
          `}
          style={{ backdropFilter: "blur(20px)" }}
        >
          {toast.type === "success" && <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />}
          {toast.type === "error" && <XCircle className="w-5 h-5 shrink-0 text-rose-400" />}
          {toast.type === "info" && <Loader2 className="w-5 h-5 shrink-0 text-sky-400 animate-spin" />}
          <span className="font-sans text-[13.5px] font-medium leading-relaxed tracking-[0.01em]">{toast.message}</span>
        </div>
      )}

      {/* ── VIEW ORG USERS MODAL ── */}
      {viewingOrgId && viewingOrg && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default" onClick={() => setViewingOrgId(null)} />
          <div
            className="relative z-10 w-[700px] max-w-[calc(100vw-32px)] max-h-[80vh] flex flex-col overflow-hidden rounded-[24px] border border-white/10 shadow-2xl animate-in zoom-in-95 duration-200"
            style={{ background: "rgba(0,0,0,0.60)", backdropFilter: "blur(24px)" }}
          >
            {/* Header */}
            <div className="px-8 pt-8 pb-6 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <button onClick={() => setViewingOrgId(null)} className="p-2 -ml-2 text-white bg-transparent border-none cursor-pointer hover:opacity-70 transition-opacity">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 className={`${unbounded.className} text-[24px] font-[600] text-white leading-tight m-0`}>
                    {viewingOrg.name}
                  </h2>
                  <p className="text-[13px] text-white/60 m-0 mt-1 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" /> {orgUsersList.length} active members
                  </p>
                </div>
              </div>
            </div>

            {/* User List */}
            <div className="flex-1 overflow-y-auto px-8 py-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {orgUsersList.length === 0 ? (
                <div className="py-12 text-center flex flex-col items-center">
                  <UserX className="w-8 h-8 text-white/20 mb-3" />
                  <p className="text-white/50 text-[14px]">No active users assigned to this workspace.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {orgUsersList.map(user => (
                    <div key={user.id} className="flex items-center justify-between gap-4 rounded-2xl p-4 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 shrink-0 rounded-xl bg-white/10 flex items-center justify-center text-white/60 font-bold text-[14px]">
                          {user.full_name ? user.full_name.charAt(0).toUpperCase() : <UserIcon className="w-4 h-4" />}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-[15px] text-white">
                            {user.full_name || <span className="italic opacity-50 font-normal">Unknown Name</span>}
                          </span>
                          <span className="text-[12px] text-white/50">{user.email}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${user.role === 'admin' ? 'bg-white text-black' : 'bg-white/10 text-white'}`}>
                          {user.role}
                        </span>
                        <button 
                          onClick={() => handleActionClick(user, "revoke")} 
                          className="rounded-lg text-[12px] text-rose-400 hover:text-rose-300 font-medium bg-transparent border border-rose-500/30 hover:bg-rose-500/10 px-3 py-1.5 transition-colors cursor-pointer"
                        >
                          Revoke
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE ORGANIZATION MODAL ── */}
      {orgModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default" onClick={() => setOrgModalOpen(false)} />
          <div
            className="relative z-10 w-[599px] max-w-[calc(100vw-32px)] rounded-[24px] py-12 flex flex-col items-center justify-center border border-white/10 animate-in zoom-in-95 duration-200"
            style={{ background: "rgba(0,0,0,0.60)", backdropFilter: "blur(24px)", boxShadow: "0 24px 80px rgba(0,0,0,0.40)" }}
          >
            <button onClick={() => setOrgModalOpen(false)} className="absolute top-8 left-8 p-2 text-white bg-transparent border-none cursor-pointer hover:opacity-70 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>
            
            <h2 className={`${unbounded.className} text-center text-white tracking-[-0.02em] mb-10 m-0 p-0`}>
              <span className="font-[200] text-[36px] block leading-[1.1]">Add a new</span>
              <span className="font-[700] text-[36px] block leading-[1.1]">organization</span>
            </h2>
            
            <form onSubmit={handleCreateOrg} className="flex w-[349px] max-w-[calc(100vw-80px)] flex-col gap-2">
              <input
                autoFocus
                type="text"
                placeholder="e.g. Sequoia Capital"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                className="w-full h-[56px] rounded-xl bg-white/5 border border-white/20 px-4 text-[14px] text-white outline-none box-border placeholder:text-white/40 focus:border-violet-400 transition-colors"
              />
              <button
                type="submit"
                disabled={!newOrgName.trim()}
                className="w-full h-[56px] cursor-pointer rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50"
              >
                <span className="font-sans text-[16px] font-[700] leading-[24px] tracking-[-0.01em]">Create</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── APPROVE/REJECT MODAL OVERLAY ── */}
      {confirmModal.isOpen && confirmModal.user && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default" onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })} />
          <div
            className="relative z-10 w-[599px] max-w-[calc(100vw-32px)] rounded-[24px] py-12 flex flex-col items-center justify-center border border-white/10 px-8 animate-in zoom-in-95 duration-200"
            style={{ background: "rgba(0,0,0,0.60)", backdropFilter: "blur(24px)", boxShadow: "0 24px 80px rgba(0,0,0,0.40)" }}
          >
            <button onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })} className="absolute top-8 left-8 p-2 text-white bg-transparent border-none cursor-pointer hover:opacity-70 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>

            <h2 className={`${unbounded.className} text-center text-white tracking-[-0.02em] mb-4 m-0 p-0`}>
              <span className="font-[200] text-[36px] block leading-[1.1]">
                {confirmModal.type === "approve" ? "Approve" : confirmModal.type === "revoke" ? "Revoke" : "Reject"}
              </span>
              <span className="font-[700] text-[36px] block leading-[1.1]">Access?</span>
            </h2>
            
            <p className={`${unbounded.className} text-[16px] font-[300] leading-[24px] text-white/80 text-center m-0 p-0 mb-8`}>
              {confirmModal.user.full_name || confirmModal.user.email}
              {confirmModal.type !== "approve" && <span className="block text-rose-400 mt-2 text-[14px]">This will revoke platform access.</span>}
            </p>

            {confirmModal.type === "approve" && (
              <div className="w-[349px] flex flex-col gap-[8px] mb-8">
                <label className="text-[12px] font-sans text-white/60 uppercase tracking-wider mb-1">Assign to Workspace</label>
                <select 
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="w-full h-[56px] rounded-xl bg-white/5 border border-white/20 px-4 text-[14px] text-white outline-none box-border appearance-none focus:border-violet-400 transition-colors cursor-pointer"
                >
                  <option value="" disabled className="text-black">-- Select an organization --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id} className="text-black">{c.name}</option>
                  ))}
                </select>
                {customers.length === 0 && <p className="text-[12px] text-rose-400 mt-1">Create an organization first.</p>}
              </div>
            )}

            <button
              onClick={executeAction} 
              disabled={confirmModal.type === "approve" && !selectedCompanyId}
              className="w-[349px] max-w-full h-[56px] cursor-pointer rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-all duration-200 flex items-center justify-center disabled:opacity-50"
            >
              <span className="font-sans text-[16px] font-[700] leading-[24px] tracking-[-0.01em]">
                Confirm {confirmModal.type}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <header className="relative z-10 w-full max-w-[1640px] mx-auto px-5 sm:px-10 xl:px-14 pt-7 pb-5 flex items-center justify-between box-border">
        <div className="flex items-center gap-4">
          <Link href="/" aria-label="Back to North Star" className="p-2 rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10">
            <ArrowLeft className="w-5 h-5 text-zinc-900 dark:text-white" strokeWidth={2.5} />
          </Link>
          <h1 className={`${unbounded.className} text-[clamp(19px,2.5vw,29px)] font-semibold tracking-tight text-[#0A0A0A] dark:text-white m-0`}>
            North Star <span className="font-[300] opacity-50">/ Admin</span>
          </h1>
        </div>
        <ThemeToggle />
      </header>

      {/* ── TABS ── */}
      <div className="relative z-10 w-full max-w-[1640px] mx-auto px-5 sm:px-10 xl:px-14 mb-9">
        <nav aria-label="Admin sections" className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-b border-black/10 dark:border-white/10 pb-3">
          <div className="flex w-full min-w-0 flex-nowrap items-center gap-1 overflow-x-auto rounded-[15px] border border-black/[.07] bg-white/45 p-1 shadow-sm backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-white/[.08] dark:bg-white/[.055] sm:w-auto">
            {([['tenants', 'Apps & tenants', FolderOpen], ['captures', 'Captures', Smartphone], ['marketing', 'Marketing', Megaphone]] as const).map(([id, label, Icon]) => <button key={id} onClick={() => selectAdminTab(id)} aria-current={activeTab === id ? 'page' : undefined} className={`flex shrink-0 items-center gap-2 rounded-[11px] px-3 py-2.5 text-[12px] font-semibold transition-colors sm:px-4 sm:text-[13px] ${activeTab === id ? 'bg-[#211c37] text-white shadow-[0_8px_24px_rgba(36,25,73,.22)] dark:bg-white/15 dark:text-white' : 'text-slate-600 hover:bg-white/70 dark:text-white/60 dark:hover:bg-white/10'}`}><Icon className="h-4 w-4" />{label}</button>)}
          </div>
          <div className="flex w-full flex-nowrap items-center justify-between gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-auto sm:justify-start">
            {([['customers', 'Organizations', Building2], ['directory', 'People', Users], ['requests', 'Requests', ShieldAlert]] as const).map(([id, label, Icon]) => <button key={id} onClick={() => selectAdminTab(id)} aria-current={activeTab === id ? 'page' : undefined} className={`flex items-center gap-2 rounded-[10px] px-3 py-2.5 text-[12px] font-semibold transition-colors ${activeTab === id ? 'bg-violet-600/10 text-violet-800 dark:bg-violet-300/15 dark:text-violet-200' : 'text-slate-500 hover:bg-black/5 dark:text-white/45 dark:hover:bg-white/10'}`}><Icon className="h-3.5 w-3.5" />{label}{id === 'requests' && pendingUsers.length > 0 && <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] leading-none text-white">{pendingUsers.length}</span>}</button>)}
          </div>
        </nav>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main className="relative z-10 flex-1 w-full max-w-[1640px] mx-auto px-5 sm:px-10 xl:px-14 pb-20 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        
        {isLoading && activeTab !== "captures" ? (
          <div className="flex items-center justify-center py-40 text-black dark:text-white">
            <Loader2 className="w-8 h-8 animate-spin opacity-50" />
          </div>
        ) : (
          <>
            {activeTab === "captures" && (
            <CaptureConsoleLive organizations={customers.map((customer) => ({ id: customer.id, name: customer.name }))} />
            )}
            {activeTab === "tenants" && (
              <TenantWorkspace tenants={customers.map((customer) => ({ id: customer.id, name: customer.name }))} />
            )}
            {activeTab === "marketing" && (
              <MarketingStudio organizations={customers.map((customer) => ({ id: customer.id, name: customer.name }))} />
            )}
            {/* ── REQUESTS TAB ── */}
            {activeTab === "requests" && (
              <div className="animate-in fade-in duration-500">
                <div className="mb-6"><div className="text-[11px] font-bold uppercase tracking-[.18em] text-violet-600 dark:text-violet-300">Access</div><h2 className="mt-2 text-[30px] font-semibold tracking-[-.045em]">Requests</h2><p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">Review the people waiting to join North Star.</p></div>
                <div className="overflow-x-auto rounded-[22px] border border-black/[.08] bg-white/75 shadow-[0_18px_55px_rgba(35,28,71,.06)] backdrop-blur-2xl dark:border-white/[.09] dark:bg-[#171821]/90">
                  <table className="w-full text-left text-[14px]">
                    <thead className="bg-black/5 dark:bg-white/5 border-b border-black/10 dark:border-white/10 text-zinc-600 dark:text-zinc-400 font-medium">
                      <tr>
                        <th className="px-6 py-4">Full Name</th>
                        <th className="px-6 py-4">Email</th>
                        <th className="px-6 py-4">Requested</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5 dark:divide-white/10">
                      {pendingUsers.length > 0 ? (pendingUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-white/50 dark:hover:bg-white/5 transition-colors text-black dark:text-white">
                          <td className="px-6 py-4 font-semibold">{user.full_name || <span className="opacity-50 italic font-normal">Unknown</span>}</td>
                          <td className="px-6 py-4 opacity-80 flex items-center gap-2"><Mail className="w-3.5 h-3.5" />{user.email}</td>
                          <td className="px-6 py-4 opacity-60">{formatDate(user.created_at)}</td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => handleActionClick(user, "approve")} className="flex items-center gap-1.5 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 text-[13px] font-semibold text-violet-800 transition-colors hover:bg-violet-500/20 dark:text-violet-200 cursor-pointer">
                                Approve
                              </button>
                              <button onClick={() => handleActionClick(user, "reject")} className="flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-[13px] font-medium text-black/60 transition-colors hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/5 cursor-pointer">
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))) : (<tr><td colSpan={4} className="px-6 py-12 text-center text-black/50 dark:text-white/50 font-medium text-[14px]">No pending requests.</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── DIRECTORY TAB ── */}
            {activeTab === "directory" && (
              <div className="animate-in fade-in duration-500">
                <div className="mb-6"><div className="text-[11px] font-bold uppercase tracking-[.18em] text-violet-600 dark:text-violet-300">People</div><h2 className="mt-2 text-[30px] font-semibold tracking-[-.045em]">Directory</h2><p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">Find people and manage their workspace access.</p></div>
                <div className="flex justify-between items-center mb-6">
                  <div className="relative w-full max-w-[349px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/50 dark:text-white/50" />
                    <input type="text" placeholder="Search users..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} 
                      className="w-full rounded-xl border border-black/[.08] bg-white/65 py-3 pl-11 pr-4 text-[14px] text-black outline-none backdrop-blur-md transition-colors placeholder:text-black/50 focus:border-violet-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/50"
                    />
                  </div>
                </div>
                
                <div className="overflow-x-auto rounded-[22px] border border-black/[.08] bg-white/75 shadow-[0_18px_55px_rgba(35,28,71,.06)] backdrop-blur-2xl dark:border-white/[.09] dark:bg-[#171821]/90">
                  <table className="w-full text-left text-[14px]">
                    <thead className="bg-black/5 dark:bg-white/5 border-b border-black/10 dark:border-white/10 text-zinc-600 dark:text-zinc-400 font-medium">
                      <tr>
                        <th className="px-6 py-4">User</th>
                        <th className="px-6 py-4">Organization</th>
                        <th className="px-6 py-4">Role</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5 dark:divide-white/10">
                      {filteredProcessedUsers.length > 0 ? (filteredProcessedUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-white/50 dark:hover:bg-white/5 transition-colors text-black dark:text-white">
                          <td className="px-6 py-4">
                            <div className="font-bold text-[15px] mb-1">{user.full_name || <span className="opacity-50 italic font-normal">Unknown</span>}</div>
                            <div className="text-[12px] opacity-70 flex items-center gap-1.5"><Mail className="w-3 h-3" /> {user.email}</div>
                          </td>
                          <td className="px-6 py-4 font-medium opacity-90">{user.customer ? user.customer.name : <span className="opacity-50 italic">Unassigned</span>}</td>
                          <td className="px-6 py-4">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${user.role === 'admin' ? 'bg-violet-600 text-white' : 'bg-black/10 dark:bg-white/10 text-black dark:text-white'}`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2">
                              {user.status === "approved" ? ( 
                                <button onClick={() => handleActionClick(user, "revoke")} className="flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-[13px] font-medium text-rose-600 transition-colors hover:bg-rose-500/10 dark:text-rose-400 cursor-pointer">Revoke</button>
                              ) : ( 
                                <button onClick={() => handleActionClick(user, "approve")} className="flex items-center gap-1.5 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 text-[13px] font-semibold text-violet-800 transition-colors hover:bg-violet-500/20 dark:text-violet-200 cursor-pointer">Approve</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))) : (<tr><td colSpan={4} className="px-6 py-12 text-center text-black/50 dark:text-white/50 font-medium text-[14px]">No users found.</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── CUSTOMERS TAB ── */}
            {activeTab === "customers" && (
              <div className="animate-in fade-in duration-500">
                <div className="mb-6"><div className="text-[11px] font-bold uppercase tracking-[.18em] text-violet-600 dark:text-violet-300">Workspaces</div><h2 className="mt-2 text-[30px] font-semibold tracking-[-.045em]">Organizations</h2><p className="mt-1 text-[13px] text-slate-500 dark:text-white/50">The teams and people using North Star.</p></div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Add New Card */}
                  <button onClick={() => setOrgModalOpen(true)} className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-violet-500/30 bg-violet-500/[.04] p-8 text-violet-700 shadow-[0_18px_55px_rgba(35,28,71,.04)] backdrop-blur-2xl transition hover:-translate-y-0.5 hover:bg-violet-500/[.09] dark:text-violet-200 cursor-pointer">
                    <Plus className="w-8 h-8 text-black/50 dark:text-white/50" />
                    <span className="text-[15px] font-bold text-black/70 dark:text-white/70">Create Workspace</span>
                  </button>

                  {customers.map((customer) => {
                    const userCount = users.filter(u => u.customer_id === customer.id && u.status === "approved").length;
                    return (
                      <div 
                        key={customer.id} 
                        className="bg-white/75 dark:bg-[#171821]/90 backdrop-blur-2xl border border-black/[.08] dark:border-white/[.09] shadow-[0_18px_55px_rgba(35,28,71,.06)] p-7 rounded-[22px] min-h-[180px] flex flex-col justify-between group transition hover:-translate-y-0.5 hover:shadow-[0_22px_55px_rgba(35,28,71,.13)]"
                      >
                        <div className="cursor-pointer" onClick={() => setViewingOrgId(customer.id)}>
                          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-[13px] bg-violet-600/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200"><Building2 className="h-5 w-5" /></div><h3 className="font-bold text-[20px] tracking-tight text-black dark:text-white mb-2 group-hover:text-violet-600 dark:group-hover:text-violet-300 transition-colors">{customer.name}</h3>
                          <div className="flex items-center gap-2 text-[14px] text-black/60 dark:text-white/60"><Users className="w-4 h-4" /> {userCount} active users</div>
                        </div>
                        <div className="flex justify-between items-end mt-4 pt-4 border-t border-black/5 dark:border-white/5">
                          {/* Left: View Members */}
                          <button type="button" onClick={() => setViewingOrgId(customer.id)} className="rounded-lg px-2 py-1 text-[12px] font-semibold text-violet-700 hover:bg-violet-500/10 dark:text-violet-200 cursor-pointer">View members →</button>
                          
                          {/* Right: DB Sync Button (with Loading State) */}
                          <button
                            onClick={() => handleSyncOrganization(customer.id)}
                            disabled={syncingOrgId !== null}
                            className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white/40 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-black transition-all hover:bg-white/70 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10 cursor-pointer"
                            title="Synchronize Storage files to Postgres Database"
                          >
                            {syncingOrgId === customer.id ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Syncing...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-3.5 h-3.5" />
                                Sync Storage
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
