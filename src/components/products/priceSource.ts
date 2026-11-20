// "Products for this job": the price an item gets when no product is chosen for it, and where that price comes from,
// in plain words. Read from the same pricing the table below uses (buildEstimate with the job's own changes), so the
// two always agree. Pure (no React).
import { buildEstimate, money } from "@/lib/estimate";
import { t } from "@/lib/i18n";
import type { Takeoff } from "@/lib/takeoff";
import type { DeviceType, EstimateLine, PricingSettings, Product } from "@/lib/types";

export interface PriceSource {
  /** Unit price the pricing table uses for this item when no product is chosen. */
  price: number;
  /** Where it comes from: "typed for this job", "price list + 10% markup", "no price yet", … */
  source: string;
}

/**
 * The no-product price for every device type and cable on the job, keyed like the product choices (`<typeId>` and
 * `cable:<type>` via `cableKeyOf`). Uses the job's pricing (markup, labor in the price) and the prices typed in the
 * table for this job. A line removed from the pricing still gets its price here, so the choice list can show it.
 */
export function jobPriceSources(
  takeoff: Takeoff,
  catalog: DeviceType[],
  pricing: PricingSettings,
  overrides: EstimateLine[],
  cableKeyOf: (wireType: string) => string,
): Map<string, PriceSource> {
  const live = overrides.filter((o) => !o.deleted);
  // No products and nothing removed: every device type and cable gets its plain line, priced as the table prices it.
  const est = buildEstimate(takeoff, catalog, pricing, live.map((o) => (o.removed ? { ...o, removed: false } : o)));
  const typed = new Map(live.filter((o) => o.unitPrice != null).map((o) => [o.key, o]));
  const byId = new Map(catalog.map((d) => [d.id, d]));
  const pct = pricing.markupPct;
  const out = new Map<string, PriceSource>();
  for (const l of est.lines) {
    let key: string;
    let fromList: string;
    if (l.key.startsWith("dev:") || l.key.startsWith("opt:")) {
      const d = byId.get(l.key.slice(4));
      if (!d) continue;
      key = d.id;
      // The confirmed line wins over the optional (?) one when both exist.
      if (out.has(key) && l.key.startsWith("opt:")) continue;
      const labor = pricing.laborMode === "combined" && !!d.laborPrice;
      fromList = pct
        ? labor
          ? t("price list + {pct}% markup + labor", { pct })
          : t("price list + {pct}% markup", { pct })
        : labor
          ? t("price list + labor")
          : t("price list");
    } else if (l.key.startsWith("wire:")) {
      key = cableKeyOf(l.key.slice(5));
      fromList = pct ? t("wire price in Settings + {pct}% markup", { pct }) : t("wire price in Settings");
    } else continue;
    const source = typed.has(l.key) ? t("typed for this job") : l.unitPrice === 0 ? t("no price yet") : fromList;
    out.set(key, { price: l.unitPrice, source });
  }
  return out;
}

/** A product's unit price on the job, as the pricing table prices its line (markup on material, labor in the price
 *  when labor is combined). A price typed on the product's line in the table is not included. */
export function productJobPrice(p: Pick<Product, "unitPrice" | "laborPrice">, pricing: Pick<PricingSettings, "markupPct" | "laborMode">): number {
  const material = p.unitPrice * (1 + pricing.markupPct / 100);
  return money(pricing.laborMode === "combined" ? material + p.laborPrice : material);
}
