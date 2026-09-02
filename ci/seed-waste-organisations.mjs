import { Buffer } from 'node:buffer'

const baseUrl = 'http://waste-organisations:8080'
const authorization = `Basic ${Buffer.from(
  'waste-organisations-seed:waste-organisations-seed-pwd'
).toString('base64')}`
const year = new Date().getFullYear()

const required = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} must be set`)
  return value
}

const organisations = [
  {
    id: required('WASTE_OBLIGATION_ORG_ID'),
    name: 'POP QUEST LTD',
    tradingName: '',
    type: 'LARGE_PRODUCER'
  },
  {
    id: required('WASTE_OBLIGATION_CSO_ORG_ID'),
    name: 'Organisation Name',
    tradingName: 'Compliance Scheme Name',
    type: 'COMPLIANCE_SCHEME'
  }
]

for (const organisation of organisations) {
  const response = await fetch(`${baseUrl}/organisations/${organisation.id}`, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: organisation.name,
      tradingName: organisation.tradingName,
      address: {},
      registration: {
        status: 'REGISTERED',
        type: organisation.type,
        registrationYear: year
      }
    })
  })

  if (!response.ok) {
    throw new Error(
      `Failed to seed ${organisation.id}: ${response.status} ${await response.text()}`
    )
  }
}

console.log(
  `Seeded ${organisations.length} journey-test organisations for ${year}`
)
