"use client";

import { AdminAppIcon } from "./admin-app-icon";

export type AdminRailApp = {
  id: string;
  name: string;
  iconUrl?: string | null;
  detail?: string;
  status?: "configured";
};

export function AdminAppRail({ organization, apps, selectedId, onSelect, loading = false }: {
  organization: string;
  apps: AdminRailApp[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading?: boolean;
}) {
  return <aside aria-label={`Apps for ${organization}`} className="order-1 min-w-0 xl:order-2 xl:sticky xl:top-4">
    <div className="mb-2 hidden text-center text-[10px] font-bold uppercase tracking-[.16em] text-slate-500 dark:text-white/45 xl:block">Apps</div>
    <div className="flex gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:max-h-[calc(100vh-90px)] xl:flex-col xl:items-center xl:overflow-y-auto xl:overflow-x-visible xl:pb-4">
      {apps.map((app) => <button key={app.id} type="button" title={app.detail ? `${app.name} · ${app.detail}` : app.name} aria-label={`View ${app.name}`} aria-pressed={selectedId === app.id} onClick={() => onSelect(app.id)} className="group relative shrink-0 rounded-[14px] transition duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-500">
        <AdminAppIcon appName={app.name} iconUrl={app.iconUrl} className={`h-[58px] w-[58px] rounded-[14px] shadow-[0_7px_22px_rgba(0,0,0,.16)] ${selectedId === app.id ? "ring-[3px] ring-violet-500" : ""}`} />
        {app.status === "configured" && <span aria-hidden="true" className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-[3px] border-[#101018] bg-emerald-400" />}
        <span className="sr-only">{app.name}{app.detail ? `, ${app.detail}` : ""}</span>
      </button>)}
      {!loading && !apps.length && <span className="px-2 py-4 text-[11px] text-slate-500">No apps</span>}
    </div>
  </aside>;
}
