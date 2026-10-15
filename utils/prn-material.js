// The frontend's PRNs list material filter options, by API material name.
export const MATERIAL_FILTER_LABELS = Object.freeze({
  Aluminium: 'Aluminium',
  Glass: 'Glass other',
  GlassRemelt: 'Glass re-melt',
  Paper: 'Paper, board or fibre-based composite material',
  Plastic: 'Plastic',
  Steel: 'Steel',
  Wood: 'Wood'
})

// How the PRNs list names a material in its rows (the frontend's
// prns.list.material), by API material name. These read in the same order as
// the API names, which the list's material sort uses.
const ROW_MATERIAL_TEXT = Object.freeze({
  Aluminium: 'Aluminium',
  Fibre: 'Fibre-based composite material',
  Glass: 'Glass Other',
  GlassRemelt: 'Glass Re-melt',
  Paper: 'Paper or board',
  Plastic: 'Plastic',
  Steel: 'Steel',
  Wood: 'Wood'
})

// A material the list has no name for is shown as the API names it.
export function listMaterialText(material) {
  return ROW_MATERIAL_TEXT[material] ?? material
}
