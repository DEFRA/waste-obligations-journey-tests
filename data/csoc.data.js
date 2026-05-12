const MATERIALS = ['Plastic', 'Paper', 'Glass', 'Aluminium', 'Steel', 'Wood']

export function buildCsocPayload(overrides = {}) {
  return {
    material: 'Plastic',
    tonnage: 100,
    period: String(new Date().getFullYear()),
    ...overrides
  }
}

export { MATERIALS }
