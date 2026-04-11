// app/admin/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Command, ShieldAlert, CheckCircle2, XCircle, Building2, Mail, Users, Plus, AlertTriangle, UserX, Search, Loader2, ArrowLeft } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow } from "date-fns";

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

  // 1. Fetch real users and customers from Supabase
  const fetchData = async () => {
    setIsLoading(true);
    
    // Fetch users AND join their associated customer name
    const { data: usersData } = await supabase
      .from('user_profiles')
      .select('*, customer:customers(name)')
      .order('created_at', { ascending: false });
      
    // Fetch customers
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
    setSelectedCompanyId(user.customer_id || ""); // default to current if exists
    setConfirmModal({ isOpen: true, type, user });
  };
  
  // 2. Execute Approve/Reject
  const executeAction = async () => {
    if (!confirmModal.user) return;
    
    // Prevent approval if no company is selected
    if (confirmModal.type === "approve" && !selectedCompanyId) {
      alert("You must assign the user to a company to approve them.");
      return;
    }

    const newStatus = confirmModal.type === "approve" ? "approved" : "rejected";
    const updatePayload = confirmModal.type === "approve" 
      ? { status: newStatus, customer_id: selectedCompanyId }
      : { status: newStatus, customer_id: null }; // Strip company if rejected/revoked

    // Actual DB update
    const { error } = await supabase
      .from('user_profiles')
      .update(updatePayload)
      .eq('id', confirmModal.user.id);

    if (!error) {
      // Optimistic refresh
      fetchData();
      setConfirmModal({ isOpen: false, type: "approve", user: null });
      setSelectedCompanyId("");
    } else {
      alert("Failed to update user.");
    }
  };

  // 3. Create a new Organization
  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    const { error } = await supabase
      .from('customers')
      .insert({ name: newOrgName.trim() });

    if (!error) {
      setNewOrgName("");
      setOrgModalOpen(false);
      fetchData(); // Refresh list
    } else {
      alert("Failed to create organization.");
    }
  };

  // Format dates safely
  const formatDate = (dateString: string) => {
    if (!dateString) return "Unknown";
    try { return formatDistanceToNow(new Date(dateString), { addSuffix: true }); } 
    catch { return "Unknown"; }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#050505] font-sans text-zinc-900 dark:text-zinc-100 transition-colors duration-300 relative">
      
      {/* ── CREATE ORGANIZATION MODAL ── */}
      {orgModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-[16px] font-semibold text-zinc-900 dark:text-white mb-1">Add New Organization</h3>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-4">Create a workspace to assign users to.</p>
            <form onSubmit={handleCreateOrg}>
              <input
                autoFocus
                type="text"
                placeholder="e.g. Sequoia Capital"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                className="w-full bg-transparent border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-[13px] text-zinc-900 dark:text-white mb-4 outline-none focus:border-indigo-500"
              />
              <div className="flex w-full gap-3">
                <button type="button" onClick={() => setOrgModalOpen(false)} className="flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-zinc-300 transition-colors">Cancel</button>
                <button type="submit" disabled={!newOrgName.trim()} className="flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium text-white transition-colors bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50">Create Org</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── APPROVE/REJECT MODAL OVERLAY ── */}
      {confirmModal.isOpen && confirmModal.user && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              {confirmModal.type === "approve" ? ( <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center mb-4"><CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-500" /></div> ) 
              : confirmModal.type === "revoke" ? ( <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 flex items-center justify-center mb-4"><UserX className="w-6 h-6 text-amber-600 dark:text-amber-500" /></div> ) 
              : ( <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center mb-4"><AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-500" /></div> )}
              
              <h3 className="text-[16px] font-semibold text-zinc-900 dark:text-white mb-1">
                {confirmModal.type === "approve" ? "Approve Access?" : confirmModal.type === "revoke" ? "Revoke Access?" : "Reject Access?"}
              </h3>
              
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed mb-4">
                Are you sure you want to {confirmModal.type} access for <br/>
                <span className="font-semibold text-zinc-900 dark:text-zinc-200">{confirmModal.user.full_name || confirmModal.user.email}</span>? 
                {confirmModal.type !== "approve" && " They will be locked out of the platform."}
              </p>

              {/* COMPANY ASSIGNMENT DROPDOWN (Only for Approval) */}
              {confirmModal.type === "approve" && (
                <div className="w-full text-left mb-6 border-t border-zinc-100 dark:border-zinc-800 pt-4">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5 block">Assign to Organization <span className="text-rose-500">*</span></label>
                  <select 
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2.5 text-[13px] text-zinc-900 dark:text-white outline-none focus:border-emerald-500 transition-colors"
                  >
                    <option value="" disabled>-- Select a company --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {customers.length === 0 && (
                    <p className="text-[10px] text-rose-500 mt-1">You must create an Organization first!</p>
                  )}
                </div>
              )}

              <div className="flex w-full gap-3 mt-2">
                <button onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })} className="flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:text-zinc-300 transition-colors">Cancel</button>
                <button 
                  onClick={executeAction} 
                  disabled={confirmModal.type === "approve" && !selectedCompanyId}
                  className={`flex-1 px-4 py-2.5 rounded-lg text-[13px] font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${ confirmModal.type === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : confirmModal.type === "revoke" ? "bg-amber-600 hover:bg-amber-700" : "bg-rose-600 hover:bg-rose-700" }`}
                >
                  Yes, {confirmModal.type.charAt(0).toUpperCase() + confirmModal.type.slice(1)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ADMIN TOPBAR ── */}
      <header className="h-14 border-b border-zinc-200 dark:border-zinc-800/80 px-6 flex items-center justify-between bg-white dark:bg-[#0a0a0a]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm"><Command className="w-4 h-4 text-white" /></div>
          <div><h1 className="text-[14px] font-semibold tracking-tight leading-tight">Northstar Admin</h1><p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Superuser Access</p></div>
        </div>
        <div className="flex items-center gap-4">
          <Link 
            href="/" 
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-[12px] font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Return to App
          </Link>
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800" />
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        
        {/* ── TABS ── */}
        <div className="flex gap-2 mb-8 border-b border-zinc-200 dark:border-zinc-800 pb-px">
          <button onClick={() => setActiveTab("requests")} className={`px-4 py-2 text-[13px] font-medium transition-colors relative ${ activeTab === "requests" ? "text-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300" }`}>
            <div className="flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Access Requests {pendingUsers.length > 0 && <span className="bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{pendingUsers.length}</span>}</div>
            {activeTab === "requests" && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-600" />}
          </button>
          <button onClick={() => setActiveTab("directory")} className={`px-4 py-2 text-[13px] font-medium transition-colors relative ${ activeTab === "directory" ? "text-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300" }`}>
            <div className="flex items-center gap-2"><Users className="w-4 h-4" /> User Directory</div>
            {activeTab === "directory" && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-600" />}
          </button>
          <button onClick={() => setActiveTab("customers")} className={`px-4 py-2 text-[13px] font-medium transition-colors relative ${ activeTab === "customers" ? "text-zinc-900 dark:text-white" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300" }`}>
            <div className="flex items-center gap-2"><Building2 className="w-4 h-4" /> Organizations</div>
            {activeTab === "customers" && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-600" />}
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-zinc-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* ── TAB CONTENT: REQUESTS ── */}
            {activeTab === "requests" && (
              <div className="animate-in fade-in duration-300">
                <div className="mb-6"><h2 className="text-lg font-semibold mb-1">Pending Access Requests</h2><p className="text-[13px] text-zinc-500">Users who are stuck on the verification screen.</p></div>
                <div className="bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-[13px]">
                    <thead className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-medium"><tr>
                      <th className="px-6 py-3">Full Name</th>
                      <th className="px-6 py-3">Email Address</th>
                      <th className="px-6 py-3">Requested</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr></thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {pendingUsers.length > 0 ? (pendingUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/20 transition-colors">
                          <td className="px-6 py-4 font-semibold text-zinc-900 dark:text-white">{user.full_name || <span className="text-zinc-400 font-normal italic">Unknown</span>}</td>
                          <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400 flex items-center gap-2"><Mail className="w-3.5 h-3.5" />{user.email}</td>
                          <td className="px-6 py-4 text-zinc-500">{formatDate(user.created_at)}</td>
                          <td className="px-6 py-4"><div className="flex justify-end gap-2"><button onClick={() => handleActionClick(user, "approve")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 font-medium transition-colors"><CheckCircle2 className="w-4 h-4" /> Approve</button><button onClick={() => handleActionClick(user, "reject")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-zinc-600 bg-zinc-100 hover:bg-zinc-200 dark:text-zinc-400 dark:bg-zinc-900 dark:hover:bg-zinc-800 font-medium transition-colors"><XCircle className="w-4 h-4" /> Reject</button></div></td>
                        </tr>
                      ))) : (<tr><td colSpan={4} className="px-6 py-8 text-center text-zinc-500 font-mono text-[12px]">No pending requests right now. Inbox zero!</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB CONTENT: DIRECTORY ── */}
            {activeTab === "directory" && (
              <div className="animate-in fade-in duration-300">
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-1">
                    <h2 className="text-lg font-semibold">User Directory ({processedUsers.length})</h2>
                    <div className="relative w-full max-w-xs">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input type="text" placeholder="Search by name, email, or company..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-[13px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
                    </div>
                  </div>
                  <p className="text-[13px] text-zinc-500">History of all approved and rejected users.</p>
                </div>
                <div className="bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-[13px]">
                    <thead className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 font-medium"><tr>
                      <th className="px-6 py-3">Full Name / Email</th>
                      <th className="px-6 py-3">Company</th>
                      <th className="px-6 py-3">Role</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr></thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {filteredProcessedUsers.length > 0 ? (filteredProcessedUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/20 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-zinc-900 dark:text-white mb-0.5">{user.full_name || <span className="text-zinc-400 font-normal italic">Unknown</span>}</div>
                            <div className="text-[11px] text-zinc-500 flex items-center gap-1.5"><Mail className="w-3 h-3" /> {user.email}</div>
                          </td>
                          <td className="px-6 py-4 font-medium">{user.customer ? <span className="px-2 py-1 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 rounded-md text-[11px]">{user.customer.name}</span> : <span className="text-zinc-400 italic">Unassigned</span>}</td>
                          
                          <td className="px-6 py-4">
                            {user.role === 'admin' ? (
                              <span className="px-2 py-1 bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400 rounded-md text-[10px] font-bold uppercase tracking-wider">Admin</span>
                            ) : (
                              <span className="px-2 py-1 bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 rounded-md text-[10px] font-bold uppercase tracking-wider">User</span>
                            )}
                          </td>
                          
                          <td className="px-6 py-4">{user.status === "approved" ? ( <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider"><CheckCircle2 className="w-3 h-3" /> Approved</span> ) : ( <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 text-[10px] font-bold uppercase tracking-wider"><XCircle className="w-3 h-3" /> Rejected</span> )}</td>
                          <td className="px-6 py-4"><div className="flex justify-end gap-2">{user.status === "approved" ? ( <button onClick={() => handleActionClick(user, "revoke")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 dark:text-amber-400 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 font-medium transition-colors"><UserX className="w-4 h-4" /> Revoke</button> ) : ( <button onClick={() => handleActionClick(user, "approve")} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 font-medium transition-colors"><CheckCircle2 className="w-4 h-4" /> Approve</button> )}</div></td>
                        </tr>
                      ))) : (<tr><td colSpan={5} className="px-6 py-8 text-center text-zinc-500 font-mono text-[12px]">No users found matching your search.</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB CONTENT: CUSTOMERS ── */}
            {activeTab === "customers" && (
              <div className="animate-in fade-in duration-300">
                <div className="mb-6 flex justify-between items-end">
                  <div><h2 className="text-lg font-semibold mb-1">Organizations</h2><p className="text-[13px] text-zinc-500">Workspaces you can assign approved users into.</p></div>
                  <button onClick={() => setOrgModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[13px] font-medium rounded-lg hover:opacity-80 transition-opacity shadow-sm"><Plus className="w-4 h-4" /> Add Organization</button>
                </div>
                
                {customers.length === 0 ? (
                  <div className="text-center py-16 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                    <Building2 className="w-8 h-8 text-zinc-300 mx-auto mb-3" />
                    <p className="text-zinc-500 text-[13px]">No organizations created yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {customers.map((customer) => {
                      const userCount = users.filter(u => u.customer_id === customer.id).length;
                      return (
                        <div key={customer.id} className="bg-white dark:bg-[#0a0a0a] border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
                          <div className="flex justify-between items-start">
                            <div><h3 className="font-semibold text-[15px] mb-1">{customer.name}</h3><div className="flex items-center gap-1 text-[12px] text-zinc-500"><Users className="w-3.5 h-3.5" /> {userCount} assigned users</div></div>
                            <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">Active</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}