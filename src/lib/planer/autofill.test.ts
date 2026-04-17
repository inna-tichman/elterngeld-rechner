import { describe, expect, it } from "vitest";
import { baueAuszahlungsMonate, erstelleAutoPlan } from "./autofill";

describe("erstelleAutoPlan", () => {
  it("füllt Basis-Modell inkl. Bonusmonate als Plus", () => {
    const plan = erstelleAutoPlan({
      modell: "basis",
      monateBasis: 12,
      monatePlus: 24,
      mixBasis: 4,
      mixPlus: 16,
      partnerschaftsbonus: true,
    });

    expect(plan.size).toBe(16);
    expect(plan.get(1)?.elternteilA?.typ).toBe("basis");
    expect(plan.get(12)?.elternteilA?.typ).toBe("basis");
    expect(plan.get(13)?.elternteilA?.typ).toBe("plus");
    expect(plan.get(16)?.elternteilA?.typ).toBe("plus");
  });

  it("füllt Plus-Modell inkl. 8 Bonusmonaten", () => {
    const plan = erstelleAutoPlan({
      modell: "plus",
      monateBasis: 12,
      monatePlus: 20,
      mixBasis: 4,
      mixPlus: 16,
      partnerschaftsbonus: true,
    });

    expect(plan.size).toBe(28);
    expect(plan.get(1)?.elternteilA?.typ).toBe("plus");
    expect(plan.get(28)?.elternteilA?.typ).toBe("plus");
  });
});

describe("baueAuszahlungsMonate", () => {
  it("gibt Monatsliste mit deutschem Label und Beträgen aus", () => {
    const plan = erstelleAutoPlan({
      modell: "mix",
      monateBasis: 12,
      monatePlus: 24,
      mixBasis: 2,
      mixPlus: 2,
      partnerschaftsbonus: false,
    });
    const monate = baueAuszahlungsMonate("2026-09", plan, 1200, 600);

    expect(monate).toHaveLength(4);
    expect(monate[0]).toMatchObject({ label: "Sep. 2026", betrag: 1200, typ: "basis" });
    expect(monate[1]).toMatchObject({ label: "Okt. 2026", betrag: 1200, typ: "basis" });
    expect(monate[2]).toMatchObject({ label: "Nov. 2026", betrag: 600, typ: "plus" });
  });
});
