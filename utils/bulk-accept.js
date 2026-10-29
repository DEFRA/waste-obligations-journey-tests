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

// The rows of the obligations table that add up both glass materials, and
// every material.
export const GLASS_ROW = 'Glass'
export const TOTALS_ROW = 'Totals'

// The frontend orders the tiles like the list's material filter.
const TILE_ORDER = [
  'Aluminium',
  'Glass',
  'GlassRemelt',
  'Paper',
  'Plastic',
  'Steel',
  'Wood'
]

function tileOrder(material) {
  const index = TILE_ORDER.indexOf(material)

  return index === -1 ? TILE_ORDER.length : index
}

export function tonnageText(tonnage) {
  return tonnage === 1 ? '1 tonne' : `${tonnage} tonnes`
}

export function tileDescription(label) {
  return `accepted towards your recycling obligation for ${label.toLowerCase()}`
}

function totalsByObligationMaterial(prns) {
  const totals = new Map()

  for (const prn of prns) {
    const material = obligationMaterial(prn.material)
    totals.set(material, (totals.get(material) ?? 0) + prn.tonnage)
  }

  return totals
}

// The confirmation's tiles for the accepted PRNs ({ material, tonnage }): one
// per obligation material, in the page's order, with its total tonnage and
// the text it shows.
export function expectedAcceptedTiles(prns) {
  return [...totalsByObligationMaterial(prns)]
    .sort(([a], [b]) => tileOrder(a) - tileOrder(b))
    .map(([material, tonnage]) => {
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

// How far accepting `prns` moves each obligations table row, keyed by the
// row's name: the tonnage moves from awaiting to accepted in its material's
// row, the Glass row for either glass material, and Totals.
export function expectedObligationChanges(prns) {
  const changes = {}
  const add = (row, tonnage) => {
    changes[row] = (changes[row] ?? 0) + tonnage
  }

  for (const [material, tonnage] of totalsByObligationMaterial(prns)) {
    add(OBLIGATION_MATERIAL_LABELS[material], tonnage)
    if (material === 'Glass' || material === 'GlassRemelt') {
      add(GLASS_ROW, tonnage)
    }
    add(TOTALS_ROW, tonnage)
  }

  return changes
}

export function acceptedHeading(count, year) {
  return count === 1
    ? `You’ve accepted 1 PRN or PERN towards your ${year} recycling obligations`
    : `You’ve accepted ${count} PRNs and PERNs towards your ${year} recycling obligations`
}

export function parseTonnage(text) {
  return Number(String(text).replaceAll(',', '').trim())
}
