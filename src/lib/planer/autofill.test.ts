import { describe, expect, it } from "vitest";
import { baueAuszahlungsMonate, erstelleAutoPlan } from "./autofill";

describe("erstelleAutoPlan", () => {
  it("füllt Basis-Modell in Reihenfolge A dann B und hängt Bonus an", () => {
    const plan = erstelleAutoPlan({
      modell: "basis",
      monateBasis: 14,
      monatePlus: 24,
      mixBasis: 4,
      mixPlus: 16,
      partnerschaftsbonus: true,
    });

    expect(plan.size).toBe(18);
    expect(plan.get(1)?.elternteilA?.typ).toBe("basis");
    expect(plan.get(12)?.elternteilA?.typ).toBe("basis");
    expect(plan.get(13)?.elternteilB?.typ).toBe("basis");
    expect(plan.get(14)?.elternteilB?.typ).toBe("basis");
    expect(plan.get(15)?.elternteilA).toMatchObject({ typ: "plus", bonus: true });
    expect(plan.get(18)?.elternteilB).toMatchObject({ typ: "plus", bonus: true });
  });

  it("füllt Plus-Modell mit A dann B und verteilt Bonusmonate gleichmäßig", () => {
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
    expect(plan.get(20)?.elternteilA?.typ).toBe("plus");
    expect(plan.get(21)?.elternteilA).toMatchObject({ typ: "plus", bonus: true });
    expect(plan.get(24)?.elternteilA).toMatchObject({ typ: "plus", bonus: true });
    expect(plan.get(25)?.elternteilB).toMatchObject({ typ: "plus", bonus: true });
    expect(plan.get(28)?.elternteilB).toMatchObject({ typ: "plus", bonus: true });
  });
});

describe("baueAuszahlungsMonate", () => {
  it("gibt Monatsliste mit Label, Typ, Elternteil und Bonus aus", () => {
    const plan = erstelleAutoPlan({
      modell: "mix",
      monateBasis: 12,
      monatePlus: 24,
      mixBasis: 13,
      mixPlus: 2,
      partnerschaftsbonus: true,
    });
    const monate = baueAuszahlungsMonate("2026-09", plan, 1200, 600);

    expect(monate).toHaveLength(19);
    expect(monate[0]).toMatchObject({
      label: "Sep. 2026",
      betrag: 1200,
      typ: "basis",
      parent: "A",
      bonus: false,
    });
    expect(monate[12]).toMatchObject({ typ: "basis", parent: "B", bonus: false });
    expect(monate[13]).toMatchObject({ typ: "plus", parent: "A", bonus: false });
    expect(monate[15]).toMatchObject({ typ: "plus", parent: "A", bonus: true });
    expect(monate[18]).toMatchObject({ typ: "plus", parent: "B", bonus: true });
  });
});
