// The recycling targets in Schedule 5 of the Producer Responsibility Obligations
// (Packaging and Packaging Waste) Regulations 2024, as whole percentages by
// obligation year, keyed by the material name the obligations API uses. The
// material calculation pages show the target for the page's year, so these are
// what the journeys expect to see, whatever target the API's data holds.
//
// Paper, board and fibre-based composite share one target. Glass re-melt is the
// share of the glass obligation that must be met by re-melt.
export const MATERIAL_TARGETS = {
  Aluminium: { 2026: 62, 2027: 63, 2028: 64, 2029: 65, 2030: 67 },
  Glass: { 2026: 76, 2027: 78, 2028: 80, 2029: 82, 2030: 85 },
  GlassRemelt: { 2026: 76, 2027: 77, 2028: 78, 2029: 79, 2030: 80 },
  Paper: { 2026: 77, 2027: 79, 2028: 81, 2029: 83, 2030: 85 },
  Plastic: { 2026: 57, 2027: 59, 2028: 61, 2029: 63, 2030: 65 },
  Steel: { 2026: 81, 2027: 82, 2028: 83, 2029: 84, 2030: 85 },
  Wood: { 2026: 46, 2027: 47, 2028: 48, 2029: 49, 2030: 50 }
}

/**
 * The target, as a whole percentage, for a material in an obligation year.
 *
 * @param {string} material the obligations API's material name
 * @param {number} year
 * @returns {number}
 */
export function materialTarget(material, year) {
  const target = MATERIAL_TARGETS[material]?.[year]

  if (target === undefined) {
    throw new Error(`No recycling target for ${material} in ${year}`)
  }

  return target
}
