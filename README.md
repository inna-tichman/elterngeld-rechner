# Elterngeld Rechner

Kostenloser Elterngeld-Rechner als Next.js Web-App, werbefinanziert über Google AdSense.

## Setup

```bash
npm install
npm run dev
```

Öffne [http://localhost:3000](http://localhost:3000).

## Deployment (Vercel)

```bash
npm install -g vercel
vercel
```

## Projektstruktur

```
src/
├── app/
│   ├── layout.tsx        # Root Layout, Metadata, Fonts
│   ├── page.tsx          # Hauptseite
│   └── globals.css       # Tailwind + CSS-Tokens
├── components/
│   └── ElterngeldRechner.tsx  # Haupt-Komponente (Client)
└── lib/
    └── berechnung.ts     # Elterngeld-Formel nach §2 BEEG
```

## Berechnung

Die Formel folgt §2 BEEG:

- **Ersatzrate**: 67 % (65–100 % je nach Einkommen)
- **Mindestbetrag**: 300 € / Monat
- **Höchstbetrag**: 1.800 € / Monat (Basis), 900 € (Plus)
- **Berechnungsgrenze**: 2.770 € Netto/Monat
- **ElterngeldPlus**: 50 % des Basisbetrags, doppelte Laufzeit
- **Geschwisterbonus**: +10 % (mind. 75 €)
- **Mehrlingszuschlag**: +300 € (Basis) / +150 € (Plus) pro Kind
- **Partnerschaftsbonus**: +4 Monate (Basis) / +8 Monate (Plus)

## AdSense einbinden

In `src/app/layout.tsx` das AdSense-Script hinzufügen:

```tsx
<Script
  async
  src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX"
  crossOrigin="anonymous"
  strategy="afterInteractive"
/>
```

Und in der Komponente an geeigneter Stelle (z.B. nach Ergebnis):

```tsx
<ins className="adsbygoogle"
  style={{ display: "block" }}
  data-ad-client="ca-pub-XXXXXXXX"
  data-ad-slot="XXXXXXXXXX"
  data-ad-format="auto"
  data-full-width-responsive="true" />
```

## Nächste Schritte

- [ ] Detaillierteren Steuerklassen-Rechner (exakte Lohnsteuerberechnung)
- [ ] Selbstständigen-Modus (Einkommensteuerbescheid statt Gehaltsnachweis)
- [ ] Elterngeld-Planer (Monatskalender für beide Elternteile)
- [ ] Blog-Artikel für SEO
- [ ] Schema.org FAQ-Markup

## Disclaimer

Unverbindliche Schätzung nach §2 BEEG. Maßgeblich ist der Bescheid der zuständigen Elterngeldstelle.
