// Mirrors how the frontend's check-selection page groups selected PRNs: one
// table per material, captioned with the list filter's material label and
// ordered like that filter. Paper, board and fibre-based composite PRNs share
// one table whatever variant name the backend returns ('Paper', 'Fibre', ...).
export const PAPER_GROUP_HEADING =
  'Paper, board or fibre-based composite material'

const GROUP_HEADINGS = {
  Aluminium: 'Aluminium',
  Glass: 'Glass other',
  GlassRemelt: 'Glass re-melt',
  Paper: PAPER_GROUP_HEADING,
  Plastic: 'Plastic',
  Steel: 'Steel',
  Wood: 'Wood'
}

const GROUP_ORDER = Object.values(GROUP_HEADINGS)

const PAPER_MATERIAL_PATTERN = /^(paper|fibre|fiber)/i

export function checkSelectionGroupHeading(material) {
  if (PAPER_MATERIAL_PATTERN.test(material)) {
    return PAPER_GROUP_HEADING
  }

  return GROUP_HEADINGS[material] ?? material
}

function groupOrder(heading) {
  const index = GROUP_ORDER.indexOf(heading)

  return index === -1 ? GROUP_ORDER.length : index
}

// Builds the tables the check-selection page should show for `rows` read
// from the list ({ number, material, tonnageValue }), in on-page order.
export function expectedCheckSelectionGroups(rows) {
  const groups = new Map()

  for (const row of rows) {
    const heading = checkSelectionGroupHeading(row.material)

    if (!groups.has(heading)) {
      groups.set(heading, { heading, numbers: [], total: 0 })
    }

    const group = groups.get(heading)
    group.numbers.push(row.number)
    group.total += row.tonnageValue
  }

  return [...groups.values()].sort(
    (a, b) =>
      groupOrder(a.heading) - groupOrder(b.heading) ||
      a.heading.localeCompare(b.heading)
  )
}
