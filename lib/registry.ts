/**
 * Company registry lookups: does this company exist, is it still active, and
 * may this person act for it?
 *
 * This is the check that stops the attack you cannot undo -- somebody listing
 * a real, attractive startup they have nothing to do with and redirecting the
 * money. A reviewer reading an uploaded certificate cannot catch a good forgery;
 * an official register can.
 *
 * Companies House (UK) is free and answers both questions, so it is the
 * default. Everything else falls back to manual review with the registry's own
 * URL handed to the reviewer -- an honest "a human checked the register" beats
 * a fabricated automated pass.
 */

export type RegistryStatus = "active" | "dissolved" | "not_found" | "unsupported" | "error";

export interface RegistryCompany {
  status: RegistryStatus;
  name: string | null;
  number: string | null;
  incorporatedOn: string | null;
  /** Officer surnames, lowercased -- enough to match a name, not a dossier. */
  officers: string[];
  /** Where a human can confirm this themselves. */
  sourceUrl: string | null;
  source: string;
}

const CH_BASE = "https://api.company-information.service.gov.uk";

function chAuth(): string | null {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key) return null;
  // Companies House uses the API key as the Basic-auth username, empty password.
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

export const REGISTRY_CONFIGURED = !!process.env.COMPANIES_HOUSE_API_KEY;

/** Registries this build can query automatically. Everything else is manual. */
export const AUTOMATED_REGISTRY_COUNTRIES = ["GB", "UK"];

export function registrySupported(country: string | null | undefined): boolean {
  return !!country && AUTOMATED_REGISTRY_COUNTRIES.includes(country.toUpperCase());
}

/**
 * Look a company up by its registration number.
 *
 * Returns "unsupported" rather than throwing for countries we cannot query, so
 * the caller routes the case to manual review instead of failing the applicant
 * for living in the wrong place.
 */
export async function lookupCompany(opts: {
  country: string | null;
  companyNumber: string;
}): Promise<RegistryCompany> {
  const base: RegistryCompany = {
    status: "unsupported", name: null, number: opts.companyNumber,
    incorporatedOn: null, officers: [], sourceUrl: null, source: "manual",
  };

  if (!registrySupported(opts.country)) return base;
  const auth = chAuth();
  if (!auth) return { ...base, status: "unsupported", source: "companies_house_unconfigured" };

  // Registration numbers are alphanumeric; anything else is a caller bug or an
  // injection attempt, and either way must not reach the URL.
  const num = opts.companyNumber.trim().toUpperCase();
  if (!/^[A-Z0-9]{6,10}$/.test(num)) return { ...base, status: "not_found", source: "companies_house" };

  const sourceUrl = `https://find-and-update.company-information.service.gov.uk/company/${num}`;

  try {
    const res = await fetch(`${CH_BASE}/company/${num}`, {
      headers: { Authorization: auth },
      // A registry answer is a fact about the world, not a hot path.
      next: { revalidate: 3600 },
    });
    if (res.status === 404) return { ...base, status: "not_found", source: "companies_house", sourceUrl };
    if (!res.ok) return { ...base, status: "error", source: "companies_house", sourceUrl };

    const c = await res.json() as {
      company_name?: string; company_number?: string;
      company_status?: string; date_of_creation?: string;
    };

    // Only "active" counts. A dissolved company raising a round is either a
    // mistake or exactly the thing this check exists to catch.
    const status: RegistryStatus = c.company_status === "active" ? "active" : "dissolved";

    let officers: string[] = [];
    try {
      const o = await fetch(`${CH_BASE}/company/${num}/officers`, {
        headers: { Authorization: auth }, next: { revalidate: 3600 },
      });
      if (o.ok) {
        const list = await o.json() as { items?: Array<{ name?: string; resigned_on?: string }> };
        officers = (list.items ?? [])
          .filter((i) => !i.resigned_on)              // resigned officers cannot authorise anything
          .map((i) => (i.name ?? "").toLowerCase())
          .filter(Boolean);
      }
    } catch { /* officer list is a bonus; the company record is the check */ }

    return {
      status,
      name: c.company_name ?? null,
      number: c.company_number ?? num,
      incorporatedOn: c.date_of_creation ?? null,
      officers,
      sourceUrl,
      source: "companies_house",
    };
  } catch {
    return { ...base, status: "error", source: "companies_house", sourceUrl };
  }
}

/**
 * Is this applicant plausibly an officer of that company?
 *
 * Deliberately a SIGNAL, not a verdict. Registers list "SMITH, Jane Elizabeth"
 * while a profile says "Jane Smith", directors join after incorporation, and
 * plenty of legitimate founders are not directors at all. A miss routes the
 * case to a human; it never rejects anyone on its own.
 */
export function officerMatch(fullName: string, officers: string[]): boolean {
  const parts = fullName.toLowerCase().split(/\s+/).filter((p) => p.length > 2);
  if (!parts.length || !officers.length) return false;
  const surname = parts[parts.length - 1];
  return officers.some((o) => o.includes(surname) && parts.some((p) => p !== surname && o.includes(p)));
}

/**
 * The registry outcome as trust signals, ready for scoreRisk(). Names match
 * SIGNAL_WEIGHTS in lib/trust.ts.
 */
export function registrySignals(
  company: RegistryCompany,
  claimedName: string,
  applicantName: string,
): Array<{ signal: string; severity: "info" | "low" | "medium" | "high" }> {
  const out: Array<{ signal: string; severity: "info" | "low" | "medium" | "high" }> = [];
  if (company.status === "not_found") out.push({ signal: "registry_not_found", severity: "high" });
  if (company.status === "dissolved") out.push({ signal: "registry_dissolved", severity: "high" });
  if (company.status === "active") {
    const a = (company.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const b = claimedName.toLowerCase().replace(/[^a-z0-9]/g, "");
    // Substring rather than equality: "Acme Ltd" against "Acme Limited" is the
    // same company, and a reviewer should not be paged for a legal suffix.
    if (a && b && !a.includes(b) && !b.includes(a)) {
      out.push({ signal: "registry_name_mismatch", severity: "medium" });
    }
    if (company.officers.length && !officerMatch(applicantName, company.officers)) {
      out.push({ signal: "director_not_listed", severity: "medium" });
    }
  }
  return out;
}
