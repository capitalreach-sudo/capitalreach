"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Navbar } from "@/components/shared/navbar";
import { ArrowLeft, Upload, FileText, Trash2, ExternalLink } from "lucide-react";
import Link from "next/link";

const DOC_TYPES = [
  { value: "pitch_deck", label: "Pitch Deck (PDF)" },
  { value: "financial_model", label: "Financial Model (XLSX)" },
  { value: "cap_table", label: "Cap Table (PDF/XLSX)" },
  { value: "other", label: "Other" },
];

export default function DocumentsPage() {
  const [startup, setStartup] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState("pitch_deck");
  const [docLabel, setDocLabel] = useState("");
  const [requiresNda, setRequiresNda] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }
      const { data: s } = await supabase.from("startups").select("id, name, subscription_tier").eq("owner_id", user.id).single();
      if (!s) { router.push("/onboarding/startup"); return; }
      setStartup(s);
      const { data: docs } = await supabase.from("startup_documents").select("*").eq("startup_id", s.id);
      setDocuments(docs || []);
    })();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !startup) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("startupId", startup.id);
    formData.append("type", docType);
    formData.append("label", docLabel || file.name);
    formData.append("requiresNda", String(requiresNda));

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) {
      toast({ title: "Upload failed", description: data.error, variant: "destructive" });
    } else {
      toast({ title: "Document uploaded!" });
      setDocuments(prev => [...prev, data.document]);
      if (fileRef.current) fileRef.current.value = "";
      setDocLabel("");
    }
    setUploading(false);
  }

  async function deleteDocument(docId: string) {
    await supabase.from("startup_documents").delete().eq("id", docId);
    setDocuments(prev => prev.filter(d => d.id !== docId));
    toast({ title: "Document removed" });
  }

  const isLimitedPlan = startup?.subscription_tier === "starter";
  const atLimit = isLimitedPlan && documents.length >= 3;

  return (
    <>
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard/startup">
            <Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="h-4 w-4" /> Back</Button>
          </Link>
          <h1 className="text-2xl font-bold text-cr-ink">Document Manager</h1>
        </div>

        {isLimitedPlan && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-5 flex items-center justify-between">
            <p className="text-sm text-amber-300">{documents.length}/3 documents (Starter plan). Upgrade to Growth for unlimited.</p>
            <Link href="/pricing"><Button size="sm" variant="outline" className="text-xs">Upgrade</Button></Link>
          </div>
        )}

        {/* Upload form */}
        {!atLimit && (
          <form onSubmit={handleUpload} className="bg-cr-paper border rounded-2xl p-5 mb-6 space-y-4">
            <h2 className="font-semibold text-cr-ink">Upload Document</h2>
            <div>
              <Label>Document Type</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Label (optional)</Label>
              <Input value={docLabel} onChange={e => setDocLabel(e.target.value)} placeholder="Pitch Deck v3 — June 2026" />
            </div>
            <div>
              <Label>File</Label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.xlsx,.xls,.mp4"
                className="block w-full text-sm text-cr-i3 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-cr-copper/10 file:text-cr-cu-l hover:file:bg-cr-copper/15 cursor-pointer"
                required
              />
              <p className="text-xs text-cr-i4 mt-1">PDF, XLSX, or MP4 · Max 50MB</p>
            </div>
            <div className="flex items-center justify-between p-3 bg-cr-p2 rounded-lg">
              <div>
                <p className="text-sm font-medium text-cr-ink">Require NDA to access</p>
                <p className="text-xs text-cr-i3">Investors must sign an NDA before viewing this document</p>
              </div>
              <Switch checked={requiresNda} onCheckedChange={setRequiresNda} />
            </div>
            <Button type="submit" className="w-full gap-2" disabled={uploading}>
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : "Upload Document"}
            </Button>
          </form>
        )}

        {/* Document list */}
        <div className="bg-cr-paper border rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-cr-p2">
            <h2 className="font-semibold text-cr-ink text-sm">Uploaded Documents ({documents.length})</h2>
          </div>
          {documents.length === 0 ? (
            <div className="p-8 text-center text-cr-i4">
              <FileText className="h-8 w-8 mx-auto mb-2 text-cr-i4" />
              <p>No documents uploaded yet.</p>
            </div>
          ) : (
            <div className="divide-y">
              {documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-cr-copper flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-cr-ink">{doc.label}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-cr-i4 capitalize">{doc.type.replace(/_/g, " ")}</span>
                        {doc.requires_nda && <Badge variant="warning" className="text-xs py-0">NDA Required</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-cr-copper hover:text-cr-cu-l">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <button onClick={() => deleteDocument(doc.id)} className="text-cr-i4 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
