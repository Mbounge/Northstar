// app/admin/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { ShieldAlert, CheckCircle2, XCircle, Building2, Mail, Users, Plus, AlertTriangle, UserX, Search, Loader2, ArrowLeft, User as UserIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { Unbounded } from "next/font/google";

const unbounded = Unbounded({ subsets: ["latin"], weight: ["200", "300", "400", "600", "700"] });

type ActionType = "approve" | "reject" | "revoke";

export default function AdminDashboard() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<"requests" | "directory" | "customers">("requests");
  
  // Real DB State
  const [users, setUsers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Modals
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean; type: ActionType; user: any | null;
  }>({ isOpen: false, type: "approve", user: null });
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");

  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");

  // NEW: State for viewing an organization's users
  const [viewingOrgId, setViewingOrgId] = useState<string | null>(null);

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
      alert("You must assign the user to a company to approve them.");
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
    } else {
      alert("Failed to update user.");
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
    } else {
      alert("Failed to create organization.");
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "Unknown";
    try { return formatDistanceToNow(new Date(dateString), { addSuffix: true }); } 
    catch { return "Unknown"; }
  };

  // Helper variables for the org viewing modal
  const viewingOrg = viewingOrgId ? customers.find(c => c.id === viewingOrgId) : null;
  const orgUsersList = viewingOrgId ? users.filter(u => u.customer_id === viewingOrgId && u.status === "approved") : [];

  return (
    <div className="relative min-h-screen bg-[#EEF0F8] dark:bg-[#09090b] flex flex-col overflow-hidden font-sans">
      
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

      {/* ── VIEW ORG USERS MODAL ── */}
      {viewingOrgId && viewingOrg && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default" onClick={() => setViewingOrgId(null)} />
          <div
            className="relative z-10 w-[700px] max-h-[80vh] flex flex-col border border-white/10 shadow-2xl animate-in zoom-in-95 duration-200 rounded-none"
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
                    <div key={user.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white/10 flex items-center justify-center text-white/60 font-bold text-[14px]">
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
                          className="text-[12px] text-rose-400 hover:text-rose-300 font-medium bg-transparent border border-rose-500/30 hover:bg-rose-500/10 px-3 py-1.5 transition-colors cursor-pointer"
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
            className="relative z-10 w-[599px] py-12 flex flex-col items-center justify-center border border-white/10 animate-in zoom-in-95 duration-200"
            style={{ background: "rgba(0,0,0,0.60)", backdropFilter: "blur(24px)", boxShadow: "0 24px 80px rgba(0,0,0,0.40)" }}
          >
            <button onClick={() => setOrgModalOpen(false)} className="absolute top-8 left-8 p-2 text-white bg-transparent border-none cursor-pointer hover:opacity-70 transition-opacity">
              <ArrowLeft className="w-6 h-6" />
            </button>
            
            <h2 className={`${unbounded.className} text-center text-white tracking-[-0.02em] mb-10 m-0 p-0`}>
              <span className="font-[200] text-[36px] block leading-[1.1]">Add a new</span>
              <span className="font-[700] text-[36px] block leading-[1.1]">organization</span>
            </h2>
            
            <form onSubmit={handleCreateOrg} className="flex flex-col w-[349px] gap-[8px]">
              <input
                autoFocus
                type="text"
                placeholder="e.g. Sequoia Capital"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                className="w-full h-[56px] bg-transparent border border-zinc-300 dark:border-white px-4 text-[14px] text-white outline-none rounded-none box-border placeholder:text-zinc-500 focus:bg-white/5 transition-colors"
              />
              <button
                type="submit"
                disabled={!newOrgName.trim()}
                className="w-full h-[56px] cursor-pointer bg-white/10 hover:bg-white/20 border-0 border-y border-white/30 hover:border-white/50 text-white rounded-none transition-all duration-300 ease-out flex items-center justify-center disabled:opacity-50"
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
            className="relative z-10 w-[599px] py-12 flex flex-col items-center justify-center border border-white/10 px-12 animate-in zoom-in-95 duration-200"
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
                  className="w-full h-[56px] bg-transparent border border-zinc-300 dark:border-white px-4 text-[14px] text-white outline-none rounded-none box-border appearance-none focus:bg-white/5 transition-colors cursor-pointer"
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
              className="w-[349px] h-[56px] cursor-pointer bg-white/10 hover:bg-white/20 border-0 border-y border-white/30 hover:border-white/50 text-white rounded-none transition-all duration-300 ease-out flex items-center justify-center disabled:opacity-50"
            >
              <span className="font-sans text-[16px] font-[700] leading-[24px] tracking-[-0.01em]">
                Confirm {confirmModal.type}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <header className="relative z-10 w-full px-8 pt-9 pb-6 flex items-center justify-between box-border">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 transition-opacity hover:opacity-70">
            <ArrowLeft className="w-5 h-5 text-zinc-900 dark:text-white" strokeWidth={2.5} />
          </Link>
          <h1 className={`${unbounded.className} text-[30px] font-semibold tracking-tight text-[#0A0A0A] dark:text-white m-0`}>
            North Star <span className="font-[300] opacity-50">Admin</span>
          </h1>
        </div>
        <ThemeToggle />
      </header>

      {/* ── TABS ── */}
      <div className="relative z-10 w-full px-12 mb-6">
        <div className="flex flex-row items-center gap-8 border-b border-black/10 dark:border-white/10"> 
          <button onClick={() => setActiveTab("requests")} className={`h-[49px] px-4 flex items-center gap-2 transition-colors duration-200 ease-in-out border-none text-[16px] cursor-pointer whitespace-nowrap rounded-none bg-transparent ${activeTab === "requests" ? "font-bold text-black dark:text-white border-b-2 border-black dark:border-white" : "font-medium text-black/60 dark:text-white/60 hover:opacity-70"}`}>
            <ShieldAlert className="w-4 h-4" /> Requests
            {pendingUsers.length > 0 && <span className="ml-1 bg-white/20 dark:bg-white/10 px-2 py-0.5 rounded-sm text-[12px]">{pendingUsers.length}</span>}
          </button>
          <button onClick={() => setActiveTab("directory")} className={`h-[49px] px-4 flex items-center gap-2 transition-colors duration-200 ease-in-out border-none text-[16px] cursor-pointer whitespace-nowrap rounded-none bg-transparent ${activeTab === "directory" ? "font-bold text-black dark:text-white border-b-2 border-black dark:border-white" : "font-medium text-black/60 dark:text-white/60 hover:opacity-70"}`}>
            <Users className="w-4 h-4" /> Directory
          </button>
          <button onClick={() => setActiveTab("customers")} className={`h-[49px] px-4 flex items-center gap-2 transition-colors duration-200 ease-in-out border-none text-[16px] cursor-pointer whitespace-nowrap rounded-none bg-transparent ${activeTab === "customers" ? "font-bold text-black dark:text-white border-b-2 border-black dark:border-white" : "font-medium text-black/60 dark:text-white/60 hover:opacity-70"}`}>
            <Building2 className="w-4 h-4" /> Organizations
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-12 pb-20 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        
        {isLoading ? (
          <div className="flex items-center justify-center py-40 text-black dark:text-white">
            <Loader2 className="w-8 h-8 animate-spin opacity-50" />
          </div>
        ) : (
          <>
            {/* ── REQUESTS TAB ── */}
            {activeTab === "requests" && (
              <div className="animate-in fade-in duration-500">
                <div className="bg-white/40 dark:bg-black/30 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-xl overflow-hidden rounded-none">
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
                              <button onClick={() => handleActionClick(user, "approve")} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/60 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 border border-white/80 dark:border-white/20 text-black dark:text-white transition-colors text-[13px] font-semibold rounded-none cursor-pointer">
                                Approve
                              </button>
                              <button onClick={() => handleActionClick(user, "reject")} className="flex items-center gap-1.5 px-3 py-1.5 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 border border-transparent text-black/60 dark:text-white/60 transition-colors text-[13px] font-medium rounded-none cursor-pointer">
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
                <div className="flex justify-between items-center mb-6">
                  <div className="relative w-[349px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-black/50 dark:text-white/50" />
                    <input type="text" placeholder="Search users..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} 
                      className="w-full bg-white/40 dark:bg-black/30 backdrop-blur-md border border-white/60 dark:border-white/10 rounded-none pl-11 pr-4 py-3 text-[14px] text-black dark:text-white focus:outline-none focus:border-black/30 dark:focus:border-white/30 transition-colors placeholder:text-black/50 dark:placeholder:text-white/50" 
                    />
                  </div>
                </div>
                
                <div className="bg-white/40 dark:bg-black/30 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-xl overflow-hidden rounded-none">
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
                            <span className={`px-2 py-1 rounded-sm text-[11px] font-bold uppercase tracking-wider ${user.role === 'admin' ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-black/10 dark:bg-white/10 text-black dark:text-white'}`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex justify-end gap-2">
                              {user.status === "approved" ? ( 
                                <button onClick={() => handleActionClick(user, "revoke")} className="flex items-center gap-1.5 px-3 py-1.5 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 border border-transparent text-rose-600 dark:text-rose-400 transition-colors text-[13px] font-medium rounded-none cursor-pointer">Revoke</button> 
                              ) : ( 
                                <button onClick={() => handleActionClick(user, "approve")} className="flex items-center gap-1.5 px-3 py-1.5 bg-white/60 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 border border-white/80 dark:border-white/20 text-black dark:text-white transition-colors text-[13px] font-semibold rounded-none cursor-pointer">Approve</button> 
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
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Add New Card */}
                  <button onClick={() => setOrgModalOpen(true)} className="flex flex-col items-center justify-center gap-3 bg-white/40 dark:bg-black/30 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-xl hover:bg-white/60 dark:hover:bg-white/5 transition-colors p-8 rounded-none cursor-pointer min-h-[160px]">
                    <Plus className="w-8 h-8 text-black/50 dark:text-white/50" />
                    <span className="text-[15px] font-bold text-black/70 dark:text-white/70">Create Workspace</span>
                  </button>

                  {customers.map((customer) => {
                    const userCount = users.filter(u => u.customer_id === customer.id).length;
                    return (
                      <div 
                        key={customer.id} 
                        onClick={() => setViewingOrgId(customer.id)}
                        className="bg-white/40 dark:bg-black/30 backdrop-blur-2xl border border-white/60 dark:border-white/10 shadow-xl hover:bg-white/50 dark:hover:bg-white/5 transition-all p-8 rounded-none min-h-[160px] flex flex-col justify-between cursor-pointer group"
                      >
                        <div>
                          <h3 className="font-bold text-[18px] text-black dark:text-white mb-2 group-hover:text-blue-500 transition-colors">{customer.name}</h3>
                          <div className="flex items-center gap-2 text-[14px] text-black/60 dark:text-white/60"><Users className="w-4 h-4" /> {userCount} active users</div>
                        </div>
                        <div className="flex justify-between items-end mt-4">
                          <span className="text-[11px] text-black/40 dark:text-white/40 font-mono hover:underline">View members →</span>
                          <span className="bg-black/5 dark:bg-white/10 text-black dark:text-white px-2 py-1 rounded-sm text-[10px] font-bold uppercase tracking-wider">Active</span>
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