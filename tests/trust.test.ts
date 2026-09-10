import { describe, it, expect } from "vitest";
import {
  carriedEvidence,
  checkStillValid,
  effectiveTrustLevel,
  evidenceByKind,
  evidenceChecklist,
  evidenceSupplied,
  expiryFrom,
  isExpired,
  type CarriedRecord,
  type EvidenceKind,
  type EvidenceRecord,
  type SubjectType,
  type TrustLevel,
} from "../lib/trust";

/**
 * The checklist decides whether an application can be sent at all, so the two
 * failure modes that matter are a checklist that never goes green (the member
 * is stranded on a rung they have already earned) and one that goes green on
 * evidence that has lapsed (a badge outliving the check behind it).
 */

const row = (kind: string, status: string): EvidenceRecord => ({ kind, status });

/** The page's own gate: a checklist line is done when a supplied row backs it. */
function outstanding(level: TrustLevel, subject: SubjectType, rows: EvidenceRecord[]): EvidenceKind[] {
  const byKind = evidenceByKind(rows);
  return evidenceChecklist(level, subject).filter((kind) => !evidenceSupplied(byKind.get(kind)?.status));
}

const LEVEL_2_SET = [
  row("domain_control", "passed"),
  row("identity_document", "pending"),
  row("liveness", "pending"),
];

const LEVEL_3_SET = [
  ...LEVEL_2_SET,
  row("company_registry", "pending"),
  row("director_authority", "pending"),
];

describe("evidenceChecklist", () => {
  it("is cumulative: level 3 stands on the rungs below it", () => {
    expect(evidenceChecklist(3, "startup")).toEqual([
      "domain_control", "identity_document", "liveness",
      "company_registry", "director_authority",
    ]);
  });

  it("asks an investor for different evidence at level 4", () => {
    expect(evidenceChecklist(4, "investor")).toContain("accreditation");
    expect(evidenceChecklist(4, "investor")).toContain("fund_proof");
    expect(evidenceChecklist(4, "investor")).not.toContain("revenue_proof");
    expect(evidenceChecklist(4, "startup")).toContain("revenue_proof");
  });

  it("asks for nothing at level 0", () => {
    expect(evidenceChecklist(0, "startup")).toEqual([]);
  });

  it("names each kind once, however many rungs require it", () => {
    const list = evidenceChecklist(4, "startup");
    expect(new Set(list).size).toBe(list.length);
  });
});

describe("the level 3 checklist", () => {
  it("goes green for a case carrying the level 2 set plus the level 3 rung", () => {
    expect(outstanding(3, "startup", LEVEL_3_SET)).toEqual([]);
  });

  it("still names what is genuinely missing", () => {
    expect(outstanding(3, "startup", LEVEL_2_SET)).toEqual(["company_registry", "director_authority"]);
  });

  it("does not strand a member whose second domain attempt failed", () => {
    // The domain proof keeps a row per domain tried, oldest first. Reading only
    // the last row of a kind would leave this case permanently outstanding on
    // evidence the submit route already counts as held.
    const rows = [
      row("domain_control", "passed"),
      row("domain_control", "failed"),
      ...LEVEL_3_SET.slice(1),
    ];
    expect(outstanding(3, "startup", rows)).toEqual([]);
  });

  it("does not accept a kind whose only rows failed", () => {
    const rows = [
      row("domain_control", "failed"),
      row("domain_control", "failed"),
      ...LEVEL_3_SET.slice(1),
    ];
    expect(outstanding(3, "startup", rows)).toEqual(["domain_control"]);
  });
});

describe("evidenceByKind", () => {
  it("prefers a supplied row over a failed one whichever came last", () => {
    expect(evidenceByKind([row("domain_control", "failed"), row("domain_control", "passed")])
      .get("domain_control")?.status).toBe("passed");
    expect(evidenceByKind([row("domain_control", "passed"), row("domain_control", "failed")])
      .get("domain_control")?.status).toBe("passed");
  });

  it("keeps the most recent row when several are supplied", () => {
    const rows = [
      { kind: "company_registry", status: "pending", id: "old" },
      { kind: "company_registry", status: "pending", id: "new" },
    ];
    expect(evidenceByKind(rows).get("company_registry")?.id).toBe("new");
  });

  it("keeps the most recent row when none are supplied", () => {
    const rows = [
      { kind: "domain_control", status: "failed", id: "old" },
      { kind: "domain_control", status: "failed", id: "new" },
    ];
    expect(evidenceByKind(rows).get("domain_control")?.id).toBe("new");
  });

  it("counts received and confirmed, nothing else", () => {
    expect(evidenceSupplied("passed")).toBe(true);
    expect(evidenceSupplied("pending")).toBe(true);
    expect(evidenceSupplied("failed")).toBe(false);
    expect(evidenceSupplied(undefined)).toBe(false);
  });
});

describe("carry-forward from an approved case", () => {
  const past = "2020-01-01T00:00:00Z";
  const future = "2099-01-01T00:00:00Z";
  const live2 = { levelGranted: 2, expiresAt: future };
  const lapsed2 = { levelGranted: 2, expiresAt: past };

  const DAY = 24 * 60 * 60 * 1000;
  const days = (n: number) => new Date(Date.now() - n * DAY).toISOString();

  /** Evidence as carry-forward reads it: dated, because a check is worth what
   *  its date says. */
  const checked = (kind: string, status: string, at: string | null = days(30)): CarriedRecord =>
    ({ kind, status, checkedAt: at });

  /** A level 2 approval with every rung under it actually proved. */
  const APPROVED_2 = [
    checked("domain_control", "passed"),
    checked("identity_document", "passed"),
    checked("liveness", "passed"),
  ];

  /** The next application's checklist, once it has inherited what it may. */
  function afterCarry(
    level: TrustLevel,
    subject: SubjectType,
    grant: { levelGranted: number | null; expiresAt: string | null },
    approved: CarriedRecord[],
  ): EvidenceKind[] {
    return outstanding(level, subject, carriedEvidence(approved, grant, subject));
  }

  it("does not ask a live level 2 holder to prove the same rungs again", () => {
    expect(afterCarry(3, "startup", live2, APPROVED_2)).toEqual(["company_registry", "director_authority"]);
  });

  it("lets that member submit for level 3 on the new rung alone", () => {
    const rows = [
      ...carriedEvidence(APPROVED_2, live2, "startup"),
      row("company_registry", "pending"),
      row("director_authority", "pending"),
    ];
    expect(outstanding(3, "startup", rows)).toEqual([]);
  });

  it("asks a lapsed level 2 holder for the whole ladder again", () => {
    expect(carriedEvidence(APPROVED_2, lapsed2, "startup")).toEqual([]);
    expect(afterCarry(3, "startup", lapsed2, APPROVED_2)).toEqual(evidenceChecklist(3, "startup"));
  });

  it("carries nothing for a kind that never passed", () => {
    // Pending is enough to send a case to a reviewer, never enough to be
    // inherited by the next one: a reserved vendor check has not happened, and
    // an unread upload is not a check either.
    const rows = [
      checked("domain_control", "passed"),
      checked("identity_document", "pending"),
      checked("liveness", "failed"),
    ];
    expect(carriedEvidence(rows, live2, "startup").map((e) => e.kind)).toEqual(["domain_control"]);
    expect(afterCarry(3, "startup", live2, rows))
      .toEqual(["identity_document", "liveness", "company_registry", "director_authority"]);
  });

  it("does not carry evidence past the level that was actually granted", () => {
    // A level 4 application that came back granted at 2: the revenue proof on
    // it was never accepted for level 4 and must not reach it by inheritance.
    const rows = [...APPROVED_2, checked("revenue_proof", "passed")];
    expect(carriedEvidence(rows, live2, "startup").map((e) => e.kind)).not.toContain("revenue_proof");
    expect(afterCarry(4, "startup", live2, rows))
      .toEqual(["company_registry", "director_authority", "revenue_proof"]);
  });

  it("does not let one proof ride from case to case forever", () => {
    // A copy keeps the original's date, so a check can outlive the grant it
    // first rode in on while the newest grant is still live. Twelve months
    // from the check itself, it is asked for again.
    const stale = APPROVED_2.map((e) => checked(e.kind, e.status, days(400)));
    expect(carriedEvidence(stale, live2, "startup")).toEqual([]);
    expect(afterCarry(3, "startup", live2, stale)).toEqual(evidenceChecklist(3, "startup"));
    expect(checkStillValid(days(400))).toBe(false);
    expect(checkStillValid(days(300))).toBe(true);
    expect(checkStillValid(null)).toBe(false);
  });

  it("carries nothing from an approval that granted nothing", () => {
    expect(carriedEvidence(APPROVED_2, { levelGranted: 0, expiresAt: future }, "startup")).toEqual([]);
    expect(carriedEvidence(APPROVED_2, { levelGranted: null, expiresAt: future }, "startup")).toEqual([]);
  });
});

describe("expiry", () => {
  const past = "2020-01-01T00:00:00Z";
  const future = "2099-01-01T00:00:00Z";

  it("asks a lapsed subject for the whole ladder again", () => {
    // The page builds its checklist from the level a subject effectively holds,
    // and an expired grant holds nothing, so every rung is demanded afresh.
    const shown = effectiveTrustLevel(2, past);
    expect(shown).toBe(0);
    expect(outstanding(3, "startup", [])).toEqual(evidenceChecklist(3, "startup"));
    expect(evidenceChecklist(shown, "startup")).toEqual([]);
  });

  it("leaves a live grant standing", () => {
    expect(effectiveTrustLevel(2, future)).toBe(2);
    expect(effectiveTrustLevel(2, null)).toBe(2);
  });

  it("dates a grant twelve months out", () => {
    const granted = new Date("2026-03-01T00:00:00Z");
    expect(expiryFrom(granted).toISOString().slice(0, 7)).toBe("2027-03");
    expect(isExpired(expiryFrom(granted).toISOString())).toBe(false);
    expect(isExpired(past)).toBe(true);
    expect(isExpired(null)).toBe(false);
  });
});
