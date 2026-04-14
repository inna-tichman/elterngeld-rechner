# Elterngeld Rechner

Kostenloser Elterngeld-Rechner als Next.js Web-App

## Features

### Einkommen eingeben – drei Wege

| Modus | Beschreibung |
|-------|-------------|
| **Netto direkt** | Monatliches Netto manuell eingeben (wie bisher) |
| **Aus Brutto** | Bruttogehalt eingeben → Netto wird per Lohnsteuer-Rechner ermittelt |
| **Selbstständig** | Jahresgewinn aus Steuerbescheid eingeben → monatl. Netto-Äquivalent |

### Lohnsteuer-Rechner (Ziel 1)

Implementiert in `src/lib/steuer/lohnsteuer.ts`:

- **Steuerklassen I–VI** nach §32a EStG 2024
- Lohnsteuer, Solidaritätszuschlag, Kirchensteuer (8 % BY/BW, 9 % andere)
- Sozialabgaben: KV (7,3 % + Zusatzbeitrag), PV (1,7 % mit Kind / 2,3 % ohne), RV (9,3 %), AV (1,3 %)
- Beitragsbemessungsgrenzen (BBG) werden korrekt angewendet
- Ergebnisse: monatliches Netto, alle Abzüge einzeln, zvE und Tarifsteuer als Zwischenwerte

**Vereinfachungen (klar dokumentiert in der UI):**
- Gesetzliche Krankenversicherung (GKV) vorausgesetzt; private KV nicht unterstützt
- Vorsorgepauschale wird durch tatsächliche Sozialabgaben-AN-Anteile angenähert
- Keine individuellen Freibeträge auf der Lohnsteuerkarte
- Klasse V/VI: Grundfreibetrag-Effekt wird durch Verschiebung simuliert
- Abweichungen zum echten Lohnzettel < 5 % für Standardfälle

### Selbstständigen-Modus (Ziel 2)

Implementiert in `src/lib/steuer/lohnsteuer.ts` (`berechneSelbststaendigenNetto`):

- Eingabe: Jahresgewinn lt. Einkommensteuerbescheid
- Berechnung: ESt (§32a), Soli, Kirchensteuer, SV-Beiträge (pauschal)
- Ergebnis: monatliches Netto-Äquivalent als Elterngeld-Bemessungsgrundlage
- Gewerbesteuer nicht berücksichtigt (in UI dokumentiert)

### Elterngeld-Planer (Ziel 3)

Neuer Tab „Planer" – Monatskalender für Elternteil A & B:

- **36-Monats-Kalender** (Lebensmonat des Kindes)
- Monatsgenaue Planung: welcher Elternteil bezieht wann (Basis/Plus)
- Stundenfeld pro Monat für **Partnerschaftsbonus-Prüfung** (25–32 Std/Woche)
- **Validierungsschicht** (`src/lib/planer/validation.ts`):
  - Max. 14 Monate Basiselterngeld gesamt (max. 12 pro Elternteil)
  - Max. 28 Monate ElterngeldPlus
  - Max. 2 Monate gleichzeitiger Basis-Bezug beider Elternteile
  - Basiselterngeld nur bis Lebensmonat 14
  - Partnerschaftsbonus-Erkennung (4 consecutive Monate, beide Plus, 25–32 Std)
- **Gesamtbetrag** wird aus Plan + berechneten Monatswerten live geschätzt
- State via `useReducer` (sauber und erweiterbar)

## Codestruktur

```
src/
├── app/                    Next.js App-Router
├── components/
│   └── ElterngeldRechner.tsx   Haupt-UI (alle drei Features integriert)
└── lib/
    ├── berechnung.ts           Kernberechnung Elterngeld (§2 BEEG)
    ├── steuer/
    │   ├── lohnsteuer.ts       Lohnsteuer- & Selbstständigen-Rechner
    │   └── lohnsteuer.test.ts  19 Unit-Tests (Vitest)
    └── planer/
        ├── types.ts            Datentypen (PlanMonat, ParentId, BezugsTyp …)
        └── validation.ts       Validierungslogik & Statistik-Aggregation
```

## Entwicklung

```bash
npm run dev       # Entwicklungsserver
npm run build     # Produktions-Build
npm test          # Unit-Tests (Vitest)
npm run test:watch  # Tests im Watch-Modus
```

## Annahmen & Hinweise

- Lohnsteuerberechnung gilt für **Deutschland 2024**.
- Alle Ergebnisse sind **unverbindliche Schätzungen**. Maßgeblich ist stets der Bescheid der zuständigen Elterngeldstelle (§2 BEEG).
- Für Selbstständige ist der tatsächliche Nettobetrag aus dem Steuerbescheid entscheidend – diese Berechnung ist eine Näherung.

