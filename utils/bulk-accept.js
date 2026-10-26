import { getComplianceYear } from './prn-selection.js'

// The API materials the bulk-accept journey selects one PRN of. Glass (shown
// as Glass Other) is then removed again on the check-selection page.
export const BULK_ACCEPT_MATERIALS = Object.freeze([
  'Paper',
  'Fibre',
  'Glass',
  'GlassRemelt'
])

// One PRN awaiting acceptance per material: a standard PRN for the current
// compliance year, which the list always offers for multi-select. Keyed by
// API material; a material with no such PRN is left out.
export function findBulkAcceptPrns(prns, date = new Date()) {
  const complianceYear = getComplianceYear(date)
  const found = {}

  for (const material of BULK_ACCEPT_MATERIALS) {
    const prn = prns.find(
      (candidate) =>
        candidate.material === material &&
        candidate.decemberWaste === false &&
        candidate.obligationYear === complianceYear
    )

    if (prn) {
      found[material] = prn
    }
  }

  return found
}

// The obligation a PRN counts towards: fibre-based composite counts towards
// paper, so the confirmation shows them in one tile.
export function obligationMaterial(material) {
  return material === 'Fibre' ? 'Paper' : material
}

// How the obligations table names each obligation material. The confirmation
// tiles use the same names in lower case.
export const OBLIGATION_MATERIAL_LABELS = Object.freeze({
  Aluminium: 'Aluminium',
  Glass: 'Remaining glass',
  GlassRemelt: 'Glass remelt',
  Paper: 'Paper, board or fibre-based composite material',
  Plastic: 'Plastic',
  Steel: 'Steel',
  Wood: 'Wood'
})

export function tonnageText(tonnage) {
  return tonnage === 1 ? '1 tonne' : `${tonnage} tonnes`
}

export function tileDescription(label) {
  return `accepted towards your recycling obligation for ${label.toLowerCase()}`
}

// The confirmation's tiles for the accepted PRNs ({ material, tonnage }): one
// per obligation material, with its total tonnage and the text it shows.
export function expectedAcceptedTiles(prns) {
  const totals = new Map()

  for (const prn of prns) {
    const material = obligationMaterial(prn.material)
    totals.set(material, (totals.get(material) ?? 0) + prn.tonnage)
  }

  return [...totals].map(([material, tonnage]) => {
    const label = OBLIGATION_MATERIAL_LABELS[material]

    return {
      material,
      label,
      tonnage,
      tonnageText: tonnageText(tonnage),
      description: tileDescription(label)
    }
  })
}

export function acceptedHeading(count, year) {
  return count === 1
    ? `You’ve accepted 1 PRN or PERN towards your ${year} recycling obligations`
    : `You’ve accepted ${count} PRNs and PERNs towards your ${year} recycling obligations`
}

// The accepted tonnage per obligation material from the Waste Obligations
// API's obligations response.
export function acceptedTonnageByMaterial(obligations) {
  return Object.fromEntries(
    obligations.map((obligation) => [
      obligation.material,
      obligation.tonnages?.accepted ?? 0
    ])
  )
}

export function parseTonnage(text) {
  return Number(String(text).replaceAll(',', '').trim())
}
