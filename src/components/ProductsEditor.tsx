"use client";
// Brand/model product library: the specific products a device type (or cable) can be installed with.
import { Archive, ArchiveArrowUp, Download, Pencil, Plus, Search, Trash, Upload, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getCatalog, getProducts, newId, nowIso, put, putMany, remove } from "@/lib/db";
import { downloadText } from "@/lib/download";
import { formatMoney } from "@/lib/estimate";
import { CABLE_TYPES, cableKey, cableTypeFromKey, parseProductCsv, productCsvTemplate, productTitle, typeKeyName, type ProductImport } from "@/lib/products";
import { wireColor } from "@/lib/symbols";
import { toast } from "@/lib/toast";
import type { DeviceType, Product } from "@/lib/types";
import SymbolIcon from "./editor/SymbolIcon";
import Modal from "./ui/Modal";

export function blankProduct(deviceTypeId: string): Product {
  return { id: newId(), deviceTypeId, brand: "", model: "", sku: null, unitPrice: 0, laborPrice: 0, notes: null, updatedAt: nowIso() };
}

/** Add / edit one product. Used by the library and by the job's product picker. */
export function ProductDialog(props: {
  product: Product;
  catalog: DeviceType[];
  isNew: boolean;
  /** Lock the type (when adding from a job's device type row). */
  lockType?: boolean;
  onSave: (p: Product) => void;
  onCancel: () => void;
}) {
  const [p, setP] = useState(props.product);
  const [price, setPrice] = useState(String(props.product.unitPrice || ""));
  const [labor, setLabor] = useState(String(props.product.laborPrice || ""));
  const cable = cableTypeFromKey(p.deviceTypeId);
  const type = props.catalog.find((d) => d.id === p.deviceTypeId);
  const per = cable ? "per ft" : type?.unit === "LF" ? "per LF" : "each";
  const n = (s: string) => {
    const v = Number(s.replace(/[$,\s]/g, ""));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  const valid = !!(p.brand.trim() || p.model.trim());
  const id = useId();
  return (
    <Modal onClose={props.onCancel} labelledBy={`${id}-title`}>
      <form
        className="card animate-in w-full max-w-md space-y-4 p-5 shadow-pop"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) props.onSave({ ...p, brand: p.brand.trim(), model: p.model.trim(), sku: p.sku?.trim() || null, notes: p.notes?.trim() || null, unitPrice: n(price), laborPrice: n(labor) });
        }}
      >
        <div className="flex items-start gap-3">
          <h2 id={`${id}-title`} className="flex-1 text-base font-semibold">
            {props.isNew ? "New product" : "Edit product"}
          </h2>
          <button type="button" className="btn btn-sm btn-icon btn-ghost -mt-1 -mr-2" aria-label="Close" onClick={props.onCancel}>
            <X />
          </button>
        </div>
        <label className="block text-sm">
          <span className="label">For</span>
          <select className="input" value={p.deviceTypeId} disabled={props.lockType} onChange={(e) => setP({ ...p, deviceTypeId: e.target.value })}>
            <optgroup label="Devices">
              {props.catalog
                .filter((d) => !d.archived || d.id === p.deviceTypeId)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Cable (priced per ft)">
              {CABLE_TYPES.map((w) => (
                <option key={w} value={cableKey(w)}>
                  {w} cable
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="label">Brand</span>
            <input className="input" autoFocus={props.isNew} placeholder="Ubiquiti" value={p.brand} onChange={(e) => setP({ ...p, brand: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="label">Model</span>
            <input className="input" placeholder="U7 Pro" value={p.model} onChange={(e) => setP({ ...p, model: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="label">Price ({per})</span>
            <input className="input text-right tabular-nums" inputMode="decimal" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="label">Labor ({per})</span>
            <input className="input text-right tabular-nums" inputMode="decimal" placeholder="0" value={labor} onChange={(e) => setLabor(e.target.value)} />
          </label>
          <label className="col-span-2 block text-sm">
            <span className="label">SKU / part number</span>
            <input className="input" value={p.sku ?? ""} onChange={(e) => setP({ ...p, sku: e.target.value })} />
          </label>
          <label className="col-span-2 block text-sm">
            <span className="label">Notes</span>
            <input className="input" placeholder="Color, finish, supplier…" value={p.notes ?? ""} onChange={(e) => setP({ ...p, notes: e.target.value })} />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={props.onCancel}>
            Cancel
          </button>
          <button className="btn btn-brand" disabled={!valid}>
            {props.isNew ? "Add product" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function ProductsEditor() {
  const [catalog, setCatalog] = useState<DeviceType[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [preview, setPreview] = useState<ProductImport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([getCatalog(), getProducts()]).then(([c, p]) => {
      setCatalog(c);
      setProducts(p);
    });
  }, []);

  async function save(p: Product, quiet = false) {
    const saved = await put("products", p);
    setProducts((ps) => (ps.some((x) => x.id === p.id) ? ps.map((x) => (x.id === p.id ? saved : x)) : [...ps, saved]));
    if (!quiet) toast(`Saved ${productTitle(p)}`);
  }
  async function del(p: Product) {
    if (!confirm(`Delete ${productTitle(p)}? Jobs that use it go back to the device type's price.`)) return;
    await remove("products", p.id);
    setProducts((ps) => ps.filter((x) => x.id !== p.id));
  }
  async function onFile(file: File | undefined) {
    if (!file || !catalog) return;
    setPreview(parseProductCsv(await file.text(), catalog, { newId }));
    if (fileRef.current) fileRef.current.value = "";
  }
  async function applyImport() {
    if (!preview) return;
    // Same brand + model + type replaces the existing product's prices instead of adding a duplicate.
    const key = (p: Product) => `${p.deviceTypeId}|${p.brand.toLowerCase()}|${p.model.toLowerCase()}`;
    const existing = new Map(products.map((p) => [key(p), p]));
    const rows = preview.products.map((p) => {
      const e = existing.get(key(p));
      return e ? { ...e, unitPrice: p.unitPrice, laborPrice: p.laborPrice, sku: p.sku ?? e.sku, notes: p.notes ?? e.notes, archived: false } : p;
    });
    if (rows.length) await putMany("products", rows);
    setProducts(await getProducts());
    toast(`Imported ${rows.length} product${rows.length === 1 ? "" : "s"}`);
    setPreview(null);
  }

  const groups = useMemo(() => {
    if (!catalog) return [];
    const ql = q.trim().toLowerCase();
    const shown = products.filter(
      (p) => (showArchived || !p.archived) && (!ql || `${productTitle(p)} ${p.sku ?? ""} ${typeKeyName(p.deviceTypeId, catalog)}`.toLowerCase().includes(ql)),
    );
    const keys = [...catalog.map((d) => d.id), ...CABLE_TYPES.map(cableKey)];
    const known = new Set(keys);
    const orphan = [...new Set(shown.map((p) => p.deviceTypeId).filter((k) => !known.has(k)))];
    return [...keys, ...orphan]
      .map((k) => ({ key: k, items: shown.filter((p) => p.deviceTypeId === k).sort((a, b) => productTitle(a).localeCompare(productTitle(b))) }))
      .filter((g) => g.items.length);
  }, [catalog, products, q, showArchived]);

  if (!catalog) return <p className="p-6 text-slate-500">Loading…</p>;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div className="mr-auto max-w-xl">
          <h1 className="page-title">Products</h1>
          <p className="mt-1 text-sm text-slate-500">
            The brands and models you install. Pick one per device type on each job (Estimate tab), or a different one on a single device. Cable products are priced per foot.
          </p>
        </div>
        <div className="relative w-56">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search" aria-label="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <input ref={fileRef} type="file" accept=".csv,.tsv,text/csv,text/plain" className="hidden" aria-label="Price list file" onChange={(e) => onFile(e.target.files?.[0])} />
        <button className="btn" onClick={() => fileRef.current?.click()} title="Import a price list: device type, brand, model, SKU, price, labor, notes">
          <Upload /> Import price list
        </button>
        <button className="btn btn-brand" onClick={() => setEditing(blankProduct(catalog.find((d) => !d.archived)?.id ?? cableKey("Cat6")))}>
          <Plus /> Add product
        </button>
      </div>

      {products.length === 0 ? (
        <div className="card px-6 py-10 text-center">
          <p className="font-medium">No products yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Add the cameras, access points, speakers and cable you buy, or import your supplier price list as a CSV.
          </p>
          <button className="btn btn-sm mt-4" onClick={() => downloadText(productCsvTemplate(catalog), "pinplan-products-template.csv")}>
            <Download /> CSV template
          </button>
        </div>
      ) : (
        <>
          <label className="mb-3 flex cursor-pointer items-center justify-end gap-2 text-sm text-slate-600">
            <input type="checkbox" className="accent-brand-600" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
          </label>
          {groups.map(({ key, items }) => {
            const d = catalog.find((x) => x.id === key);
            const per = cableTypeFromKey(key) ? "/ft" : d?.unit === "LF" ? "/LF" : "";
            return (
              <section key={key} className="mb-5">
                <div className="mb-2 flex items-center gap-2 px-1">
                  {d && d.kind !== "led" ? <SymbolIcon type={d} size={22} /> : <span className="block h-1.5 w-5 rounded" style={{ background: d?.color ?? wireColor(cableTypeFromKey(key) ?? "") }} />}
                  <h2 className="font-semibold">{typeKeyName(key, catalog)}</h2>
                  <span className="text-xs text-slate-500">{items.length}</span>
                  <button className="btn btn-sm btn-ghost ml-auto text-brand-600" onClick={() => setEditing(blankProduct(key))}>
                    <Plus /> Add
                  </button>
                </div>
                <div className="card divide-y divide-slate-100">
                  {items.map((p) => (
                    <div key={p.id} className={`flex items-center gap-3 px-4 py-2.5 ${p.archived ? "opacity-50" : ""}`}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{productTitle(p)}</div>
                        <div className="truncate text-xs text-slate-500">{[p.sku, p.notes].filter(Boolean).join(" · ") || " "}</div>
                      </div>
                      <div className="text-right text-sm tabular-nums">
                        <div>
                          {formatMoney(p.unitPrice)}
                          <span className="text-slate-500">{per}</span>
                        </div>
                        <div className="text-xs text-slate-500">+ {formatMoney(p.laborPrice)} labor</div>
                      </div>
                      <div className="flex gap-1">
                        <button className="btn btn-sm btn-icon btn-ghost" aria-label={`Edit ${productTitle(p)}`} title="Edit" onClick={() => setEditing(p)}>
                          <Pencil />
                        </button>
                        <button className="btn btn-sm btn-icon btn-ghost" aria-label={p.archived ? "Restore" : "Archive"} title={p.archived ? "Restore" : "Archive (hide from pickers)"} onClick={() => save({ ...p, archived: !p.archived }, true)}>
                          {p.archived ? <ArchiveArrowUp /> : <Archive />}
                        </button>
                        <button className="btn btn-sm btn-icon btn-ghost text-slate-500" aria-label={`Delete ${productTitle(p)}`} title="Delete" onClick={() => del(p)}>
                          <Trash />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
          {!groups.length && <p className="px-1 text-sm text-slate-500">Nothing matches “{q}”.</p>}
          <button className="btn btn-sm btn-ghost mt-2" onClick={() => downloadText(productCsvTemplate(catalog), "pinplan-products-template.csv")}>
            <Download /> CSV template
          </button>
        </>
      )}

      {preview && (
        <Modal onClose={() => setPreview(null)} labelledBy="products-import-title">
          <div className="card animate-in flex max-h-[80vh] w-full max-w-lg flex-col p-5 shadow-pop">
            <h2 id="products-import-title" className="text-base font-semibold">
              Import price list
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {preview.products.length} product{preview.products.length === 1 ? "" : "s"} found. Ones you already have (same brand and model) get the new prices.
            </p>
            <div className="mt-3 min-h-0 flex-1 divide-y divide-slate-100 overflow-auto rounded-lg ring-1 ring-slate-200">
              {preview.products.map((p) => (
                <div key={p.id} className="flex gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {productTitle(p)} <span className="text-slate-500">· {typeKeyName(p.deviceTypeId, catalog)}</span>
                  </span>
                  <span className="tabular-nums">{formatMoney(p.unitPrice)}</span>
                </div>
              ))}
              {preview.skipped.map((s) => (
                <div key={s} className="px-3 py-2 text-sm text-amber-700">
                  {s}
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn" onClick={() => setPreview(null)}>
                Cancel
              </button>
              <button className="btn btn-brand" disabled={!preview.products.length} onClick={applyImport}>
                Import {preview.products.length}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <ProductDialog
          product={editing}
          catalog={catalog}
          isNew={!products.some((p) => p.id === editing.id)}
          onCancel={() => setEditing(null)}
          onSave={async (p) => {
            await save(p);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
