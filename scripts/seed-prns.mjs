// Seeds or removes the awaiting-acceptance PRNs listed in data/prns.data.js in the local
// EprPrnBackend database, through the sqledge container. Local stack only: CI reads PRNs from WireMock.
//
// Usage: node scripts/seed-prns.mjs <seed|remove> <dp|cso> <organisationId>

import { execFileSync } from 'node:child_process'
import { PRNS as fixtures } from '../data/prns.data.js'

const CONTAINER = 'epr-local-environment-sqledge-1'
const SQLCMD =
  '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -d EprPrnBackend -b -i /dev/stdin'
const SEED_COMMENT = 'journey-tests-seed'
const SEED_CREATED_BY = 'journey-tests-seed'
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'

const [action, account, orgId] = process.argv.slice(2)

if (
  !['seed', 'remove'].includes(action) ||
  !fixtures[account] ||
  !/^[0-9a-f-]{36}$/i.test(orgId ?? '')
) {
  process.stderr.write(
    'Usage: node scripts/seed.mjs <seed|remove> <dp|cso> <organisationId>\n'
  )
  process.exit(1)
}

const prns = fixtures[account]
const numbers = prns.map((prn) => prn.prnNumber)
const numberList = numbers.map(sqlString).join(', ')
const ownedBy = (alias) =>
  `${alias}.OrganisationId = '${orgId}' AND ${alias}.PrnNumber IN (${numberList})`

// Deletes this organisation's copies of the fixture PRNs, with their history rows, so each run starts clean.
const deleteSql = `DELETE h FROM PrnStatusHistory h JOIN Prn p ON p.Id = h.PrnIdFk WHERE ${ownedBy('p')};
DELETE FROM Prn WHERE OrganisationId = '${orgId}' AND PrnNumber IN (${numberList});`

const insertSql = prns
  .map(
    (prn) => `
INSERT INTO Prn (ExternalId, PrnNumber, OrganisationId, OrganisationName, ProducerAgency, ReprocessorExporterAgency,
  PrnStatusId, TonnageValue, MaterialName, IssuerNotes, IssuerReference, PrnSignatory, PrnSignatoryPosition, Signature,
  IssueDate, ProcessToBeUsed, DecemberWaste, StatusUpdatedOn, IssuedByOrg, AccreditationNumber, ReprocessingSite,
  AccreditationYear, ObligationYear, PackagingProducer, CreatedBy, CreatedOn, LastUpdatedBy, LastUpdatedDate, IsExport, SourceSystemId)
SELECT ${orDefault(prn.externalId, 'NEWID()')}, ${sqlString(prn.prnNumber)}, OrganisationId, OrganisationName, ProducerAgency, ${orDefault(prn.reprocessorExporterAgency, 'ReprocessorExporterAgency')},
  4, ${Number(prn.tonnage)}, ${sqlString(prn.materialName)}, ${orDefault(prn.issuerNotes, sqlString(`Seeded by ${SEED_COMMENT}`))}, IssuerReference,
  PrnSignatory, PrnSignatoryPosition, Signature, ${sqlString(prn.issueDate)}, ${orDefault(prn.processToBeUsed, 'ProcessToBeUsed')}, ${orDefault(prn.decemberWaste, isDecemberWaste(prn.issueDate) ? '1' : '0')},
  NULL, ${orDefault(prn.issuedByOrg, 'IssuedByOrg')}, ${orDefault(prn.accreditationNumber, 'AccreditationNumber')}, ReprocessingSite, ${sqlString(prn.accreditationYear)}, ${sqlString(prn.obligationYear)},
  PackagingProducer, ${sqlString(SEED_CREATED_BY)}, SYSUTCDATETIME(), LastUpdatedBy, SYSUTCDATETIME(), ${orDefault(prn.isExport, '0')}, SourceSystemId
FROM Prn WHERE Id = @template;
INSERT INTO PrnStatusHistory (CreatedOn, CreatedByUser, CreatedByOrganisationId, PrnStatusIdFk, PrnIdFk, Comment, ObligationYear)
SELECT SYSUTCDATETIME(), '${SYSTEM_USER_ID}', OrganisationId, 4, Id, ${sqlString(SEED_COMMENT)}, ObligationYear
FROM Prn WHERE PrnNumber = ${sqlString(prn.prnNumber)} AND OrganisationId = '${orgId}';`
  )
  .join('\n')

const sql =
  action === 'seed'
    ? `SET NOCOUNT ON;
BEGIN TRAN;
${deleteSql}
DECLARE @template int = (SELECT TOP 1 Id FROM Prn WHERE OrganisationId = '${orgId}' AND PrnNumber NOT IN (${numberList}) ORDER BY Id);
IF @template IS NULL THROW 50000, 'No existing PRN for this organisation to copy the seed columns from', 1;
${insertSql}
COMMIT;`
    : `SET NOCOUNT ON;
BEGIN TRAN;
${deleteSql}
COMMIT;`

try {
  execFileSync('docker', ['exec', '-i', CONTAINER, 'sh', '-c', SQLCMD], {
    input: sql,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024
  })
} catch (err) {
  const detail = (err.stderr || err.stdout || err.message || '')
    .toString()
    .trim()
  process.stderr.write(`local-awaiting-prns ${action} failed: ${detail}\n`)
  process.exit(1)
}

const verb = action === 'seed' ? 'Seeded' : 'Removed'
process.stdout.write(
  `${verb} ${numbers.length} PRN(s) for ${account}: ${numbers.join(', ')}\n`
)

// December and January issues are December Waste, as the backend derives it.
function isDecemberWaste(issueDate) {
  const month = new Date(issueDate).getUTCMonth() + 1
  return month === 12 || month === 1
}

function sqlString(value) {
  return `N'${String(value).replaceAll("'", "''")}'`
}

// The fixture's value when it sets one, otherwise the SQL expression for the column copied from the template row.
function orDefault(value, fallbackSql) {
  if (value === undefined) return fallbackSql
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return String(value)
  return sqlString(value)
}
