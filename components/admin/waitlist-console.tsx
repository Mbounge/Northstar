"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
type Row = { email: string; created_at: string; source: string };
export function WaitlistConsole() {
  const [rows, setRows] = useState<Row[]>([]), [total, setTotal] = useState(0), [page, setPage] = useState(0);
  const [error, setError] = useState(""), [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch(`/api/admin/waitlist?page=${page}`, { cache: "no-store", signal: controller.signal }).then(async r => {
      const value = await r.json(); if (!r.ok) throw new Error(value.error || "Could not load the waitlist.");
      setRows(value.rows); setTotal(value.total);
    }).catch(e => { if (e.name !== "AbortError") setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page]);
  return <main className="min-h-screen bg-[#0e0e17] text-[#eee8f8] px-6 py-12"><div className="max-w-5xl mx-auto"><Link href="/admin" className="text-violet-300 text-sm">← Admin</Link><div className="flex flex-wrap items-end justify-between gap-5 my-9"><div><p className="text-xs uppercase tracking-widest text-violet-300 mb-3">Northstar early access</p><h1 className="text-4xl tracking-tight">Waitlist <span className="text-white/40">{total.toLocaleString()}</span></h1></div><Link prefetch={false} download href="/api/admin/waitlist?format=csv" className="rounded-lg border border-white/15 px-4 py-3 text-sm hover:bg-white/10">Download CSV</Link></div><p className="text-sm text-white/50 leading-7 mb-8">These are email signups, not approved accounts. Invite people in small groups, then approve their account and organization in <Link href="/admin?tab=requests" className="text-violet-300 underline">Requests</Link>. This page does not send emails or grant access.</p>{error && <p role="alert" className="text-rose-300 py-6">{error}</p>}<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-white/40 border-b border-white/10"><tr><th className="py-4 font-normal">Email</th><th className="py-4 font-normal">Joined</th><th className="py-4 font-normal">Source</th></tr></thead><tbody>{rows.map(row => <tr key={row.email} className="border-b border-white/5"><td className="py-4 pr-6">{row.email}</td><td className="py-4 pr-6 text-white/60">{new Date(row.created_at).toLocaleString()}</td><td className="py-4 text-white/60">{row.source}</td></tr>)}</tbody></table></div>{loading && <p role="status" className="py-6 text-white/50">Loading signups…</p>}{!loading && !error && !total && <p className="py-12 text-white/50">New signups will appear here.</p>}<div className="flex justify-between items-center gap-3 mt-7 text-sm"><button disabled={!page || loading} onClick={() => setPage(page-1)} className="disabled:opacity-30">← Previous</button><span className="text-white/40">Page {page+1}</span><button disabled={(page+1)*100>=total || loading} onClick={() => setPage(page+1)} className="disabled:opacity-30">Next →</button></div><p className="mt-8 text-xs text-white/35">CSV includes up to the 10,000 most recent signups.</p></div></main>;
}
