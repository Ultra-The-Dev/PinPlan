"use client";
// Sign a form field: the signer's name and role, "Sign as someone else" for an inspector or customer signing on this
// device, and the draw-to-sign box (SignaturePad).
import { X } from "lucide-react";
import { useState } from "react";
import SignaturePad from "../SignaturePad";

export interface SignatureDraft {
  dataUrl: string;
  name: string;
  role: string;
}

export default function SignatureSheet({ title, me, otherFirst, onSave, onClose }: { title: string; me: string; otherFirst: boolean; onSave: (d: SignatureDraft) => Promise<void> | void; onClose: () => void }) {
  const [other, setOther] = useState(otherFirst);
  const [name, setName] = useState(otherFirst ? "" : me);
  const [role, setRole] = useState(/customer/i.test(title) ? "Customer" : /inspect|witness|ahj/i.test(title) ? "Inspector" : "");
  const [sig, setSig] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const who = other ? name.trim() : me;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-label={title} className="card animate-in max-h-[95dvh] w-full max-w-lg space-y-4 overflow-auto rounded-b-none p-5 shadow-pop sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-sm text-slate-500">Sign with a finger or stylus in the box.</p>
          </div>
          <button className="btn btn-sm btn-icon btn-ghost" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <div className="seg w-full" role="radiogroup" aria-label="Who is signing">
          <button type="button" role="radio" aria-checked={!other} className={`tab flex-1 justify-center ${!other ? "tab-active" : ""}`} onClick={() => setOther(false)}>
            Me ({me})
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={other}
            className={`tab flex-1 justify-center ${other ? "tab-active" : ""}`}
            onClick={() => {
              setOther(true);
              if (name === me) setName("");
            }}
          >
            Sign as someone else
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {other && (
            <label className="block">
              <span className="label">Their name</span>
              <input className="input h-11 text-base" autoFocus placeholder="e.g. Jane Smith" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          <label className={`block ${other ? "" : "sm:col-span-2"}`}>
            <span className="label">Role (optional)</span>
            <input className="input h-11 text-base" list="pp-sign-roles" placeholder="Customer, inspector, foreman…" value={role} onChange={(e) => setRole(e.target.value)} />
            <datalist id="pp-sign-roles">
              {["Customer", "Inspector", "General contractor", "Foreman", "Technician", "Owner's rep"].map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </label>
        </div>
        <SignaturePad onChange={setSig} />
        <p className="text-xs text-slate-500">
          {other ? "Their signature is saved with your name as the person who collected it." : "Your name and the time are saved with the signature."}
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn h-11" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-brand h-11 px-5"
            disabled={!sig || !who || busy}
            onClick={async () => {
              if (!sig || !who) return;
              setBusy(true);
              try {
                await onSave({ dataUrl: sig, name: who, role: role.trim() });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save signature"}
          </button>
        </div>
      </div>
    </div>
  );
}
