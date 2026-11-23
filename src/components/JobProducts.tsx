"use client";
// "Products for this job": pick the brand/model used for each device type and cable on the job.
import { Tags } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { put } from "@/lib/db";
import { formatMoney } from "@/lib/estimate";
import { sumQty } from "@/lib/markerCount";
import { useT } from "@/lib/i18n";
import { cableKey, productTitle, withProductChoice } from "@/lib/products";
import { useEditor } from "@/lib/store";
import { wireColor } from "@/lib/symbols";
import type { Takeoff } from "@/lib/takeoff";
import type { PricingSettings, Product } from "@/lib/types";
import { blankProduct, ProductDialog } from "./ProductsEditor";
import SymbolIcon from "./editor/SymbolIcon";
import { jobPriceSources, productJobPrice, type PriceSource } from "./products/priceSource";

const NEW = "__new__";

export default function JobProducts({ takeoff, pricing }: { takeoff: Takeoff; pricing: PricingSettings }) {
  const t = useT();
  const total = takeoff.total;
  const project = useEditor((s) => s.project);
  const catalog = useEditor((s) => s.catalog);
  const products = useEditor((s) => s.products);
  const markers = useEditor((s) => s.markers);
  const estimateLines = useEditor((s) => s.estimateLines);
  const updateProject = useEditor((s) => s.updateProject);
  const reloadCatalog = useEditor((s) => s.reloadCatalog);
  const [adding, setAdding] = useState<Product | null>(null);
  // The price each item gets without a product: the same one the pricing table below uses.
  const prices = useMemo(() => jobPriceSources(takeoff, catalog, pricing, estimateLines, cableKey), [takeoff, catalog, pricing, estimateLines]);
  if (!project) return null;

  const cur = pricing.currency;
  const noProduct = (p: PriceSource | undefined, fallback: number, per = "") => {
    const { price, source } = p ?? { price: fallback, source: fallback ? t("price list") : t("no price yet") };
    return t("No product · {price} ({source})", { price: `${formatMoney(price, cur)}${per}`, source });
  };
  const choose = (key: string, productId: string | null) => updateProject({ productChoices: withProductChoice(project, key, productId) });
  const rows = [
    ...catalog
      .filter((d) => (d.kind === "led" ? (total.ledFt[d.id] ?? 0) + (total.ledTentativeFt[d.id] ?? 0) : (total.counts[d.id] ?? 0)) > 0)
      .map((d) => ({
        key: d.id,
        name: d.name,
        qty: d.kind === "led" ? `${(total.ledFt[d.id] ?? 0) + (total.ledTentativeFt[d.id] ?? 0)} LF` : `× ${total.counts[d.id]}`,
        icon: d.kind === "led" ? <span className="block h-1.5 w-5 rounded" style={{ background: d.color }} /> : <SymbolIcon type={d} size={22} />,
        fallback: noProduct(prices.get(d.id), d.unitPrice),
        per: "",
        overrides: sumQty(markers.filter((m) => m.deviceTypeId === d.id && m.productId)),
      })),
    ...Object.keys(total.wireFt)
      .filter((w) => total.wireFt[w] > 0 && w !== "Unspecified")
      .sort()
      .map((w) => ({
        key: cableKey(w),
        name: t("{wire} cable", { wire: w }),
        qty: t("{n} ft", { n: total.wireFt[w] }),
        icon: <span className="block h-1 w-5 rounded" style={{ background: wireColor(w) }} />,
        fallback: noProduct(prices.get(cableKey(w)), pricing.wirePrices[w] ?? 0, "/ft"),
        per: "/ft",
        overrides: 0,
      })),
  ];

  return (
    <section className="card p-4">
      <div className="mb-1 flex items-center gap-2">
        <Tags className="h-4 w-4 text-slate-500" />
        <h3 className="font-semibold">{t("Products for this job")}</h3>
        <Link href="/products" className="tap ml-auto text-sm font-medium text-brand-600 hover:underline">
          {t("Product library")}
        </Link>
      </div>
      <p className="mb-3 text-sm text-slate-500">{t("Choose the brand and model for each item. With no product, an item uses the price shown, the same as in the table below. A single device can use another product from its inspector on the plan.")}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">{t("Place devices or draw home runs to choose products.")}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((r) => {
            const options = products.filter((p) => p.deviceTypeId === r.key && (!p.archived || project.productChoices?.[r.key] === p.id));
            const chosen = project.productChoices?.[r.key] ?? "";
            const valid = options.some((p) => p.id === chosen);
            return (
              <div key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                <span className="flex w-6 justify-center">{r.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.name}</div>
                  <div className="text-xs text-slate-400">
                    {r.qty}
                    {r.overrides ? ` · ${t.tn("{n} with its own product", "{n} with their own product", r.overrides)}` : ""}
                  </div>
                </div>
                <select
                  aria-label={t("Product for {name}", { name: r.name })}
                  className="input h-9 w-full sm:w-72"
                  value={valid ? chosen : ""}
                  onChange={(e) => {
                    if (e.target.value === NEW) setAdding(blankProduct(r.key));
                    else choose(r.key, e.target.value || null);
                  }}
                >
                  <option value="">{r.fallback}</option>
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {productTitle(p)} — {formatMoney(productJobPrice(p, pricing), cur)}
                      {r.per}
                    </option>
                  ))}
                  <option value={NEW}>{t("+ New product…")}</option>
                </select>
              </div>
            );
          })}
        </div>
      )}
      {adding && (
        <ProductDialog
          product={adding}
          catalog={catalog}
          isNew
          lockType
          onCancel={() => setAdding(null)}
          onSave={async (p) => {
            const saved = await put("products", p);
            await reloadCatalog();
            await choose(saved.deviceTypeId, saved.id);
            setAdding(null);
          }}
        />
      )}
    </section>
  );
}
