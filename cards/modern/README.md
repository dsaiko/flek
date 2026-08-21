# Moderní vzor karet — vlastní SVG sada

32 mariášových karet (německé barvy) + rub, čistý moderní flat design. Jednohlavé,
240×410 (tradiční mariášový poměr 62×106 mm), rohové indexy `7 8 9 10 S V K A`
(bez mini symbolů).

- **Generováno skriptem** [`scripts/gen-cards.ts`](../../scripts/gen-cards.ts) — ruční úpravy
  těchto SVG se ztratí, uprav generátor a spusť `npx tsx scripts/gen-cards.ts`
- **Anglická varianta** s indexy `J Q K A` (spodek→J, svršek→Q): `npx tsx scripts/gen-cards.ts en`
  → [`cards/modern-en/`](../modern-en/)
- **Licence: MIT** © 2026 Dušan Saiko
- Náhled celé sady: [`preview.html`](preview.html)

## Pojmenování souborů

Shodné s historickou sadou (`cards/history/`): `<RANK><SUIT>.svg`

- RANK: `7 8 9` · `T` desítka · `U` spodek · `O` svršek · `K` král · `D` eso
- SUIT: `A` žaludy · `B` kule · `H` červené · `L` zelené
- `back.svg` — rub karty (zelené šrafování)

## Design

- Pipové karty (7–10): klasická rozložení symbolů, dolní polovina otočená o 180°
- Figury (flat siluety v tónovaném panelu, bez popisků):
  - **spodek** — prostá silueta, velký symbol suity **pod** postavou
  - **svršek** — klobouk, velký symbol suity **nad** postavou (tradiční kód Unter/Ober)
  - **král** — koruna, větší hlava, symbol suity na hrudi
- Eso: velký symbol suity v jemném medailonu
- Barvy: červené `#c62828`, zelené `#2e7d32`, kule `#c8890a`/`#edaa17`, žaludy `#7a4f2b`/`#6a8f3c`

## Poznámka k licenci v aplikaci

V aplikaci je nutné zobrazit informace o licenci a původu obou sad karet
(viz `docs/marias-design.md`, §5.5).
