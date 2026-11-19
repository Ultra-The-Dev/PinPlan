// Company settings (src/lib/companySettings.ts): what goes to the company's row, and which copy wins.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { NEUTRAL_BUSINESS } from "@/lib/catalog";
import {
  businessWithCompany,
  companyFromBusiness,
  companyFromRow,
  companySyncAction,
  companyToRow,
  sameCompany,
  type CompanySettings,
  type CompanySyncInput,
} from "@/lib/companySettings";

const acme: CompanySettings = {
  name: "Acme Low Voltage",
  phone: "555-0100",
  email: "office@example.com",
  website: "example.com",
  address: "1 Main St",
  terms: "Net 30",
  logo: "data:image/png;base64,AAAA",
  logoImageId: null,
};

describe("company settings ↔ business settings", () => {
  it("takes the company fields from the business settings and puts them back", () => {
    const b = { ...NEUTRAL_BUSINESS, name: " Acme Low Voltage ", phone: "555-0100", email: "office@example.com", website: "example.com", address: "1 Main St", estimateTerms: "Net 30", logo: "data:image/png;base64,AAAA", brandColor: "#123456" };
    const c = companyFromBusiness(b);
    expect(c).toEqual(acme);
    const back = businessWithCompany({ ...NEUTRAL_BUSINESS, brandColor: "#123456", tagline: "Since 1999" }, c);
    expect(back).toMatchObject({ name: "Acme Low Voltage", estimateTerms: "Net 30", logo: acme.logo, brandColor: "#123456", tagline: "Since 1999" });
  });
  it("round-trips through a database row", () => {
    const row = companyToRow({ ...acme, logoImageId: "img1" }, "owner-1", "2026-11-19T10:00:00.000Z");
    expect(row).toMatchObject({ owner_id: "owner-1", business_name: "Acme Low Voltage", terms: "Net 30", logo_image_id: "img1", updated_at: "2026-11-19T10:00:00.000Z" });
    expect(companyFromRow(row)).toEqual({ ...acme, logoImageId: "img1" });
    expect(companyFromRow({ business_name: null, logo_image_id: "" })).toEqual({ ...companyFromBusiness({}), logoImageId: null });
  });
  it("keeps an oversized logo on the device instead of failing the save", () => {
    expect(companyToRow({ ...acme, logo: "x".repeat(1_500_001) }, "o", "t").logo).toBe("");
    expect(companyToRow({ ...acme, phone: "9".repeat(80) }, "o", "t").phone).toHaveLength(60);
  });
});

describe("companySyncAction (newest change wins)", () => {
  const remoteAt = "2026-11-19T10:00:00.000Z";
  const other = { ...acme, phone: "555-0199" };
  const base: CompanySyncInput = { local: acme, localSavedAt: "2026-11-19T09:00:00.000Z", mark: null, remote: null, canWrite: true };

  it("sends the first copy when the company has none", () => {
    expect(companySyncAction(base)).toBe("push");
  });
  it("doesn't send a blank business, or a technician's copy", () => {
    expect(companySyncAction({ ...base, local: { ...acme, name: "" } })).toBe("none");
    expect(companySyncAction({ ...base, canWrite: false })).toBe("none");
  });
  it("does nothing when both are the same", () => {
    expect(companySyncAction({ ...base, remote: { values: { ...acme }, updatedAt: remoteAt } })).toBe("none");
    expect(sameCompany(acme, { ...acme })).toBe(true);
  });
  it("takes the company's copy when nothing changed here since the last sync", () => {
    const mark = { userId: "u", updatedAt: "2026-11-18T00:00:00.000Z", values: acme };
    expect(companySyncAction({ ...base, mark, localSavedAt: "2026-11-19T11:00:00.000Z", remote: { values: other, updatedAt: remoteAt } })).toBe("pull");
  });
  it("compares times when both changed: the newer one wins", () => {
    const mark = { userId: "u", updatedAt: "2026-11-18T00:00:00.000Z", values: other };
    const changed = { ...base, mark, local: { ...acme, address: "2 Side St" } };
    expect(companySyncAction({ ...changed, localSavedAt: "2026-11-19T11:00:00.000Z", remote: { values: other, updatedAt: remoteAt } })).toBe("push");
    expect(companySyncAction({ ...changed, localSavedAt: "2026-11-19T09:00:00.000Z", remote: { values: other, updatedAt: remoteAt } })).toBe("pull");
  });
  it("technicians always take the company's copy", () => {
    expect(companySyncAction({ ...base, canWrite: false, localSavedAt: "2030-01-01T00:00:00.000Z", remote: { values: other, updatedAt: remoteAt } })).toBe("pull");
  });
  it("a fresh device with a blank business takes the company's copy", () => {
    expect(companySyncAction({ ...base, local: companyFromBusiness(NEUTRAL_BUSINESS), remote: { values: acme, updatedAt: remoteAt } })).toBe("pull");
  });
});
