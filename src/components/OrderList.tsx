"use client";
// Material order list: what to buy for the job, grouped by supplier, cable by the box.
import { Download, ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";
import { downloadText, slug } from "@/lib/download";
import { formatMoney } from "@/lib/estimate";
import { useEditor } from "@/lib/store";
import { useRole } from "@/lib/team";
import { can } from "@/lib/teamLogic";
import { materialCsv, materialList } from "@/lib/wiring";

export default function OrderList() {
  const { project, sheets, markers, runs, closets, catalog, products, settings } = useEditor();
  const [withTentative, setWithTentative] = useState(false);
  const prices = can(useRole(), "prices");
  const rows = useMemo(
    () => (project ? materialList({ project, sheets, markers, runs, closets }, catalog, products, { includeTentative: withTentative, wirePrices: { ...settings?.pricing.wirePrices, ...project.pricing?.wirePrices } }) : []),
    [project, sheets, markers, runs, closets, catalog, products, settings, withTentative],
  );
  if (!project) return null;
  const cur = settings?.pricing.currency ?? "USD";
  const suppliers = [...new Set(rows.map((r) => r.supplier))];
  const total = rows.reduce((n, r) => n + r.total, 0);
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <ShoppingCart className="h-5 w-5 text-slate-500" /> Order list
          </h3>
          <p className="mt-0.5 text-sm text-slate-500">What to buy, by supplier. Cable is rounded up to full boxes; HDMI to stock lengths.{prices && " Costs are your prices, before markup."}</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="accent-brand-600" checked={withTentative} onChange={(e) => setWithTentative(e.target.checked)} /> Include “?” items
        </label>
        <button className="btn" disabled={!rows.length} onClick={() => downloadText(materialCsv(rows, { prices }), `${slug(project.address)}-order-list.csv`)}>
          <Download /> Order list CSV
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="card p-6 text-center text-sm text-slate-500">Place devices and draw home runs to build the order list.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className={`tbl ${prices ? "min-w-[640px]" : "min-w-[480px]"}`}>
            <thead>
              <tr>
                <th>Item</th>
                <th>SKU</th>
                <th className="text-right">Qty</th>
                {prices && <th className="text-right">Unit cost</th>}
                {prices && <th className="text-right">Total</th>}
              </tr>
            </thead>
            {suppliers.map((s) => (
              <tbody key={s}>
                <tr>
                  <td colSpan={prices ? 5 : 3} className="bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    {s}
                  </td>
                </tr>
                {rows
                  .filter((r) => r.supplier === s)
                  .map((r, i) => (
                    <tr key={i}>
                      <td>
                        <div className="font-medium">{r.item}</div>
                        {r.note && <div className="text-xs text-slate-500">{r.note}</div>}
                      </td>
                      <td className="text-slate-500">{r.sku}</td>
                      <td className="text-right tabular-nums whitespace-nowrap">
                        {r.qty} <span className="text-slate-400">{r.unit}</span>
                      </td>
                      {prices && (
                        <>
                          <td className="text-right tabular-nums">{r.unitCost ? formatMoney(r.unitCost, cur) : <span className="text-slate-300">—</span>}</td>
                          <td className="text-right tabular-nums">{r.total ? formatMoney(r.total, cur) : <span className="text-slate-300">—</span>}</td>
                        </>
                      )}
                    </tr>
                  ))}
              </tbody>
            ))}
            {prices && (
              <tbody>
                <tr className="border-t border-slate-200">
                  <td colSpan={4} className="text-right font-semibold">
                    Material cost
                  </td>
                  <td className="text-right font-semibold tabular-nums">{formatMoney(total, cur)}</td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      )}
    </section>
  );
}
