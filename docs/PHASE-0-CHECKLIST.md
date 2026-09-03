# Phase 0 — pre-build external tasks (no code)

These have multi-week lead times and/or need the business owner. They run in
parallel with the build; several gate launch (§13 Phase 0, §14.1). Owner = you /
the business, not the build agent.

## Do this week
- [ ] **ICO registration** — £52/yr (£47 by DD), ~15 min online (§10.3). Fee
      exemption is not exemption from UK GDPR.
- [ ] **Google Business Profile** — start verification now (weeks of lead time).
      Primary category: House Cleaning Service. Then weekly photos + posts (§5.8, §14.1).
- [ ] **Google Local Services Ads** application (Google Guaranteed) — needs
      business registration, insurance, background checks (§14.2).

## Insurance (gates commercial work + trust badges, §10.4)
- [ ] Public Liability (£5m commonly required)
- [ ] Employers' Liability (legally required with employees, min £5m)
- [ ] Treatment / Care, Custody & Control
- [ ] Key cover

## Decisions that shape pricing & Phase 2 (§16)
- [ ] **Launch area** (borough/postcode set) — feeds `src/config/areas.ts`
- [ ] **Employee vs self-employed crews** — sets the cost floor (§10.5)
- [ ] **Cost-per-crew-hour modelled with an accountant** → validates the price
      list in `src/config/services.ts` (§4.2)
- [ ] Number of crews at launch (simple daily cap vs richer capacity)
- [ ] Turnover vs £90k VAT threshold (day-one VAT or year-two flag)
- [ ] Van-based? (affects EOT viability + travel model)
- [ ] Existing client list to migrate? (CSV import priority)
- [ ] Paid-acquisition budget, months 1–6

## Brand & content
- [ ] **Photography shoot** — real crews, uniforms, before/afters, vehicle (§8).
      The site deliberately ships with no stock imagery.
- [ ] Brand palette sign-off (current: eco greens + warm neutrals)
- [ ] **Keyword research in UK terms** — confirms the area/service page set (§5)
- [ ] Alphanumeric SMS sender ID registered

## Registration details to hand back to the build (fill in `src/config/site.ts`)
- [ ] Registered company name + Companies House number + registered office
- [ ] Public phone, email, service address, geo coordinates
- [ ] Domain name → `NEXT_PUBLIC_SITE_URL`
- [ ] ICO registration reference
- [ ] Confirmed insurance figures for the trust bar

## Exit criteria (from PRD)
GBP verification in progress · insurance quoted · keyword list produced ·
pricing validated against real costs · photography in hand.
