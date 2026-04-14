/**
 * Unit-Tests für Lohnsteuerberechnung
 *
 * Referenzwerte wurden mit dem offiziellen BMF-Lohnsteuerrechner (2024)
 * und dem Lohn- und Einkommensteuerrechner von brutto-netto.de abgeglichen.
 * Toleranz: ±5 % des Nettolohns (entspricht typischer Abweichung durch
 * Vorsorgepauschalen-Vereinfachung).
 */

import { describe, it, expect } from "vitest";
import {
  berechneLohnsteuer,
  berechneSelbststaendigenNetto,
  type LohnsteuerEingaben,
} from "./lohnsteuer";

const BASE: Omit<LohnsteuerEingaben, "steuerklasse"> = {
  bruttoMonatlich: 3_000,
  kinderanzahl: 0,
  kirchensteuer: false,
  bundesland: "andere",
  jahr: 2024,
};

describe("berechneLohnsteuer – Steuerklassen", () => {
  it("Klasse I, 3.000 €/Monat brutto – Netto ca. 2.000–2.150 €", () => {
    const r = berechneLohnsteuer({ ...BASE, steuerklasse: 1 });
    expect(r.nettoMonatlich).toBeGreaterThan(2_000);
    expect(r.nettoMonatlich).toBeLessThan(2_150);
    // Lohnsteuer muss positiv sein
    expect(r.lohnsteuerMonatlich).toBeGreaterThan(0);
  });

  it("Klasse II, 3.000 €/Monat brutto – Netto höher als Klasse I", () => {
    const r1 = berechneLohnsteuer({ ...BASE, steuerklasse: 1 });
    const r2 = berechneLohnsteuer({ ...BASE, steuerklasse: 2 });
    // Entlastungsbetrag führt zu niedrigerer Steuer → höherem Netto
    expect(r2.nettoMonatlich).toBeGreaterThan(r1.nettoMonatlich);
  });

  it("Klasse III, 3.000 €/Monat brutto – Netto höher als Klasse I (Splitting)", () => {
    const r1 = berechneLohnsteuer({ ...BASE, steuerklasse: 1 });
    const r3 = berechneLohnsteuer({ ...BASE, steuerklasse: 3 });
    expect(r3.nettoMonatlich).toBeGreaterThan(r1.nettoMonatlich);
    expect(r3.nettoMonatlich).toBeGreaterThan(2_250); // deutlich höher
  });

  it("Klasse IV, 3.000 €/Monat brutto – Netto wie Klasse I", () => {
    const r1 = berechneLohnsteuer({ ...BASE, steuerklasse: 1 });
    const r4 = berechneLohnsteuer({ ...BASE, steuerklasse: 4 });
    // Klasse IV ≈ Klasse I (gleiche Allowances)
    expect(Math.abs(r4.nettoMonatlich - r1.nettoMonatlich)).toBeLessThan(5);
  });

  it("Klasse V, 3.000 €/Monat brutto – Netto deutlich niedriger als Klasse I", () => {
    const r1 = berechneLohnsteuer({ ...BASE, steuerklasse: 1 });
    const r5 = berechneLohnsteuer({ ...BASE, steuerklasse: 5 });
    expect(r5.nettoMonatlich).toBeLessThan(r1.nettoMonatlich - 400);
    // Referenz: ca. 1.550–1.650 € netto
    expect(r5.nettoMonatlich).toBeGreaterThan(1_450);
    expect(r5.nettoMonatlich).toBeLessThan(1_750);
  });

  it("Klasse VI, 3.000 €/Monat brutto – Netto am niedrigsten", () => {
    const r5 = berechneLohnsteuer({ ...BASE, steuerklasse: 5 });
    const r6 = berechneLohnsteuer({ ...BASE, steuerklasse: 6 });
    expect(r6.nettoMonatlich).toBeLessThan(r5.nettoMonatlich);
    expect(r6.nettoMonatlich).toBeGreaterThan(1_300);
    expect(r6.nettoMonatlich).toBeLessThan(1_650);
  });
});

describe("berechneLohnsteuer – Kinderfreibetrag / Pflegeversicherung", () => {
  it("Mit Kind: PV-Satz niedriger (1,7 %) → höheres Netto", () => {
    const ohneKind = berechneLohnsteuer({ ...BASE, steuerklasse: 1, kinderanzahl: 0 });
    const mitKind = berechneLohnsteuer({ ...BASE, steuerklasse: 1, kinderanzahl: 1 });
    expect(mitKind.nettoMonatlich).toBeGreaterThan(ohneKind.nettoMonatlich);
    // Differenz ≈ 0.6 % von min(3000, BBG_KV=5175) = 18 € monatlich
    const diff = mitKind.nettoMonatlich - ohneKind.nettoMonatlich;
    expect(diff).toBeGreaterThan(10);
    expect(diff).toBeLessThan(30);
  });
});

describe("berechneLohnsteuer – Kirchensteuer", () => {
  it("Mit Kirchensteuer (9 %): Netto niedriger", () => {
    const ohne = berechneLohnsteuer({ ...BASE, steuerklasse: 1, kirchensteuer: false });
    const mit = berechneLohnsteuer({
      ...BASE,
      steuerklasse: 1,
      kirchensteuer: true,
      bundesland: "andere",
    });
    expect(mit.nettoMonatlich).toBeLessThan(ohne.nettoMonatlich);
    expect(mit.kirchensteuerMonatlich).toBeGreaterThan(0);
  });

  it("Bayern (8 %): Kirchensteuer niedriger als andere Bundesländer (9 %)", () => {
    const by = berechneLohnsteuer({
      ...BASE,
      steuerklasse: 1,
      kirchensteuer: true,
      bundesland: "BY",
    });
    const andere = berechneLohnsteuer({
      ...BASE,
      steuerklasse: 1,
      kirchensteuer: true,
      bundesland: "andere",
    });
    expect(by.kirchensteuerMonatlich).toBeLessThan(andere.kirchensteuerMonatlich);
  });
});

describe("berechneLohnsteuer – Sozialabgaben", () => {
  it("Über BBG_KV (5.175 €): KV/PV werden gekappt", () => {
    const hoch = berechneLohnsteuer({ ...BASE, steuerklasse: 1, bruttoMonatlich: 8_000 });
    // KV-Beitrag darf BBG × Satz nicht übersteigen
    const maxKV = 5_175 * (0.073 + 0.0085);
    expect(hoch.sozialabgaben.kv).toBeLessThanOrEqual(maxKV + 0.01);
  });

  it("Unter BBG_KV: KV proportional zum Brutto", () => {
    const r1 = berechneLohnsteuer({ ...BASE, steuerklasse: 1, bruttoMonatlich: 2_000 });
    const r2 = berechneLohnsteuer({ ...BASE, steuerklasse: 1, bruttoMonatlich: 4_000 });
    expect(r2.sozialabgaben.kv).toBeCloseTo(r1.sozialabgaben.kv * 2, 0);
  });
});

describe("berechneLohnsteuer – Grundbedingungen", () => {
  it("Netto ist positiv für alle Steuerklassen", () => {
    [1, 2, 3, 4, 5, 6].forEach((sk) => {
      const r = berechneLohnsteuer({ ...BASE, steuerklasse: sk as 1 | 2 | 3 | 4 | 5 | 6 });
      expect(r.nettoMonatlich).toBeGreaterThan(0);
    });
  });

  it("Netto < Brutto für alle Steuerklassen", () => {
    [1, 2, 3, 4, 5, 6].forEach((sk) => {
      const r = berechneLohnsteuer({ ...BASE, steuerklasse: sk as 1 | 2 | 3 | 4 | 5 | 6 });
      expect(r.nettoMonatlich).toBeLessThan(BASE.bruttoMonatlich);
    });
  });

  it("Steigendes Brutto → steigendes Netto (Klasse I)", () => {
    const r1 = berechneLohnsteuer({ ...BASE, steuerklasse: 1, bruttoMonatlich: 2_000 });
    const r2 = berechneLohnsteuer({ ...BASE, steuerklasse: 1, bruttoMonatlich: 4_000 });
    const r3 = berechneLohnsteuer({ ...BASE, steuerklasse: 1, bruttoMonatlich: 8_000 });
    expect(r2.nettoMonatlich).toBeGreaterThan(r1.nettoMonatlich);
    expect(r3.nettoMonatlich).toBeGreaterThan(r2.nettoMonatlich);
  });

  it("Ergebnis enthält Hinweise-Array", () => {
    const r = berechneLohnsteuer({ ...BASE, steuerklasse: 1 });
    expect(Array.isArray(r.hinweise)).toBe(true);
    expect(r.hinweise.length).toBeGreaterThan(0);
  });
});

describe("berechneSelbststaendigenNetto", () => {
  const SELBST_BASE = {
    kinderanzahl: 0,
    kirchensteuer: false,
    bundesland: "andere" as const,
    kvMonatsbeitrag: 400,
    rvMonatsbeitrag: 300,
    jahr: 2024 as const,
  };

  it("Jahresgewinn 60.000 € → monatl. Netto zwischen 3.000 und 4.500 €", () => {
    const r = berechneSelbststaendigenNetto({
      ...SELBST_BASE,
      jahresgewinn: 60_000,
    });
    expect(r.nettoMonatlich).toBeGreaterThan(3_000);
    expect(r.nettoMonatlich).toBeLessThan(4_500);
  });

  it("Höherer Gewinn → höheres Netto", () => {
    const r1 = berechneSelbststaendigenNetto({ ...SELBST_BASE, jahresgewinn: 40_000 });
    const r2 = berechneSelbststaendigenNetto({ ...SELBST_BASE, jahresgewinn: 80_000 });
    expect(r2.nettoMonatlich).toBeGreaterThan(r1.nettoMonatlich);
  });

  it("Mit Kirchensteuer → geringeres Netto", () => {
    const ohne = berechneSelbststaendigenNetto({ ...SELBST_BASE, jahresgewinn: 60_000 });
    const mit = berechneSelbststaendigenNetto({
      ...SELBST_BASE,
      jahresgewinn: 60_000,
      kirchensteuer: true,
    });
    expect(mit.nettoMonatlich).toBeLessThan(ohne.nettoMonatlich);
  });

  it("Ergebnis enthält Hinweise", () => {
    const r = berechneSelbststaendigenNetto({ ...SELBST_BASE, jahresgewinn: 50_000 });
    expect(r.hinweise.length).toBeGreaterThan(0);
  });
});
