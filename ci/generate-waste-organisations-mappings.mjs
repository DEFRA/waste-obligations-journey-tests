import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const guid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const clients = [
  ['waste-obligations', 'waste-obligations-pwd'],
  ['waste-obligations-frontend', 'waste-obligations-frontend-pwd']
]

const authenticated = clients.map(([id, secret]) =>
  Buffer.from(`${id}:${secret}`).toString('base64')
)

function request(path, authorised = true) {
  return {
    Path: { Matchers: [{ Name: 'ExactMatcher', Pattern: path }] },
    Methods: ['GET'],
    ...(authorised && {
      Headers: [
        {
          Name: 'Authorization',
          Matchers: [
            {
              Name: 'RegexMatcher',
              Pattern: `^Basic (${authenticated.join('|')})$`
            }
          ]
        }
      ]
    })
  }
}

function mapping(request, body, statusCode = 200, priority = 0) {
  return {
    Priority: priority,
    Request: request,
    Response: {
      StatusCode: statusCode,
      BodyAsJson: body,
      Headers: { 'Content-Type': 'application/json' }
    }
  }
}

export function createMappings(env, year = new Date().getFullYear()) {
  const ids = ['WASTE_OBLIGATION_ORG_ID', 'WASTE_OBLIGATION_CSO_ORG_ID'].map(
    (name) => {
      if (!guid.test(env[name] ?? '')) {
        throw new Error(`${name} must be a GUID`)
      }
      return env[name].toLowerCase()
    }
  )
  if (ids[0] === ids[1]) {
    throw new Error('DP and CSO organisation IDs must be different')
  }

  const registeredAt = `${year}-01-01T00:00:00+00:00`
  const organisations = [
    {
      id: ids[0],
      name: 'POP QUEST LTD',
      tradingName: '',
      type: 'LARGE_PRODUCER'
    },
    {
      id: ids[1],
      name: 'Organisation Name',
      tradingName: 'Compliance Scheme Name',
      type: 'COMPLIANCE_SCHEME'
    }
  ].map(({ type, ...organisation }) => ({
    ...organisation,
    businessCountry: null,
    companiesHouseNumber: null,
    address: {
      addressLine1: null,
      addressLine2: null,
      town: null,
      county: null,
      postcode: null,
      country: null
    },
    registrations: [
      {
        status: 'REGISTERED',
        type,
        registrationYear: year,
        created: registeredAt,
        updated: registeredAt
      }
    ]
  }))

  const mappings = Object.fromEntries(
    organisations.map((organisation, index) => [
      `waste-organisations-${index === 0 ? 'dp' : 'cso'}.json`,
      mapping(request(`/organisations/${organisation.id}`), organisation)
    ])
  )
  mappings['waste-organisations-list.json'] = mapping(
    request('/organisations'),
    { organisations }
  )
  mappings['waste-organisations-health.json'] = mapping(
    request('/health/authorized'),
    { status: 'Healthy' }
  )

  // Specific records take precedence. Unknown IDs must not return a fixture.
  const anyOrganisation = {
    Path: {
      Matchers: [{ Name: 'RegexMatcher', Pattern: '^/organisations(?:/.*)?$' }]
    },
    Methods: ['GET']
  }
  mappings['waste-organisations-not-found.json'] = mapping(
    { ...request('/organisations'), Path: anyOrganisation.Path },
    { title: 'Not Found', status: 404 },
    404,
    10
  )
  mappings['waste-organisations-unauthorised.json'] = mapping(
    anyOrganisation,
    { title: 'Unauthorized', status: 401 },
    401,
    20
  )
  mappings['waste-organisations-health-unauthorised.json'] = mapping(
    request('/health/authorized', false),
    { title: 'Unauthorized', status: 401 },
    401,
    20
  )
  return mappings
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const output = process.env.JOURNEY_TEST_WIREMOCK_MAPPINGS_DIR || '/output'
  const mappings = createMappings(process.env)
  await mkdir(output, { recursive: true })
  await Promise.all(
    Object.entries(mappings).map(([name, value]) =>
      writeFile(join(output, name), JSON.stringify(value, null, 2))
    )
  )
}
