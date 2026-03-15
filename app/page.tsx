//app/page.tsx

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Activity, ArrowRight, ShieldCheck } from "lucide-react";
import { getTrackedCompanies } from "@/lib/data";

export default async function PortfolioPage() {
  const companies = await getTrackedCompanies();

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-8">
      
      {/* Hero Header */}
      <div className="text-center max-w-2xl mb-12">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="h-1 w-12 bg-emerald-500 rounded-full" />
          <span className="text-xs font-mono text-emerald-500 uppercase tracking-widest">System Online</span>
          <div className="h-1 w-12 bg-emerald-500 rounded-full" />
        </div>
        <h1 className="text-5xl font-bold text-white tracking-tight mb-4">
          {/* COMPETITOR<span className="text-zinc-600">OS</span> */}
        </h1>
        <p className="text-zinc-400 text-lg">
          Select a target to initialize the intelligence terminal.
        </p>
      </div>

      {/* Company Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-5xl">
        
        {/* Existing Companies */}
        {companies.map((company) => (
          <Link key={company.id} href={`/dashboard/${company.id}`} className="group">
            <Card className="bg-zinc-900/50 border-zinc-800 hover:border-blue-500/50 hover:bg-zinc-900 transition-all h-full">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="w-12 h-12 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xl mb-4">
                    {company.name[0]}
                  </div>
                  <Badge variant="outline" className="border-emerald-500/20 text-emerald-400 bg-emerald-500/5 text-[10px]">
                    <Activity className="w-3 h-3 mr-1" /> Active
                  </Badge>
                </div>
                <CardTitle className="text-white text-xl group-hover:text-blue-400 transition-colors">
                  {company.name}
                </CardTitle>
                <CardDescription className="text-zinc-500 font-mono text-xs">
                  ID: {company.id.toUpperCase()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-xs text-zinc-400 mt-4 group-hover:translate-x-1 transition-transform">
                  Initialize Terminal <ArrowRight className="w-3 h-3 ml-2" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}

        {/* Add New Target (Placeholder) */}
        <Card className="bg-zinc-950 border-zinc-800 border-dashed hover:border-zinc-700 transition-all cursor-pointer group flex flex-col items-center justify-center text-center p-8 h-full min-h-[250px]">
          <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4 group-hover:bg-zinc-800 transition-colors">
            <Plus className="w-8 h-8 text-zinc-500 group-hover:text-white" />
          </div>
          <h3 className="text-lg font-medium text-zinc-300">Add New Target</h3>
          <p className="text-sm text-zinc-500 mt-2 max-w-xs">
            Deploy agents to scan a new competitor.
          </p>
        </Card>

      </div>

      {/* Footer */}
      <div className="mt-16 text-zinc-600 text-xs font-mono flex items-center gap-2">
        <ShieldCheck className="w-4 h-4" />
        SECURE CONNECTION ESTABLISHED
      </div>
    </div>
  );
}