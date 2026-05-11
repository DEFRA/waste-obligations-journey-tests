const MATERIALS = ['Plastic', 'Paper', 'Glass', 'Aluminium', 'Steel', 'Wood']

function buildCsocPayload(overrides = {}) {
  return {
    material: 'Plastic',
    tonnage: 100,
    period: String(new Date().getFullYear()),
    ...overrides
  }
}

export { MATERIALS, buildCsocPayload }
