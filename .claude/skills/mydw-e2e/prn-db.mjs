// Read access to the PRN database for the MY&DW E2E checks (audit trail, obligation year, CSV contents).
//
//   local  the docker stack, through local/lib/db.js (sqlcmd inside the sqledge container)
//   tst    tst1_prn over mssql, SELECT only, apart from resetToAwaiting() (before each tst account and after each accept/reject case). Same connection as epr-playwright-bdd (features/utils/dbUtils.js):
//          MYDW_TST_DB_SERVER / _USER / _PASSWORD / _NAME from this repo's .env, otherwise DBSERVER / DBUSERNAME /
//          DBPASSWORD from MYDW_TST_DB_ENV_FILE (default ../epr-playwright-bdd/features/ENV/.env.tst).
//
// connect() never throws: when the database can't be reached it returns { available: false, reason } and the
// spec skips the database assertions with that reason.

import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
)
const PRN_COLUMNS = `Id, PrnNumber, ExternalId, OrganisationId, PrnStatusId, ObligationYear, DecemberWaste, IsExport,
  TonnageValue, MaterialName, IssueDate, StatusUpdatedOn`

export const STATUS = { ACCEPTED: 1, REJECTED: 2, CANCELLED: 3, AWAITING: 4 }

const guidList = (ids) =>
  ids.map((id) => `'${String(id).replace(/[^0-9a-f-]/gi, '')}'`).join(',')
const textList = (values) =>
  values.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(',')

function tstConfig() {
  const e = process.env
  if (e.MYDW_TST_DB_SERVER) {
    return {
      server: e.MYDW_TST_DB_SERVER,
      user: e.MYDW_TST_DB_USER,
      password: e.MYDW_TST_DB_PASSWORD,
      database: e.MYDW_TST_DB_NAME || 'tst1_prn'
    }
  }
  const file =
    e.MYDW_TST_DB_ENV_FILE ||
    path.resolve(REPO_ROOT, '..', 'epr-playwright-bdd/features/ENV/.env.tst')
  if (!existsSync(file)) return null
  const vars = require('dotenv').parse(readFileSync(file))
  if (!vars.DBSERVER || !vars.DBPASSWORD) return null
  return {
    server: vars.DBSERVER,
    user: vars.DBUSERNAME,
    password: vars.DBPASSWORD,
    database: e.MYDW_TST_DB_NAME || 'tst1_prn'
  }
}

async function tstQuery() {
  const cfg = tstConfig()
  if (!cfg) {
    return {
      reason:
        'no tst DB credentials (set MYDW_TST_DB_* in .env or keep epr-playwright-bdd next to this repo)'
    }
  }
  const sql = require('mssql')
  try {
    const pool = await new sql.ConnectionPool({
      ...cfg,
      port: 1433,
      options: { encrypt: true, trustServerCertificate: true },
      connectionTimeout: 20_000
    }).connect()
    return {
      query: async (text) => {
        if (!/^\s*SELECT\b/i.test(text)) {
          throw new Error('tst PRN database is read-only here')
        }
        // Same shape as the local sqlcmd JSON: dates as ISO strings.
        return (await pool.request().query(text)).recordset.map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([k, v]) => [
              k,
              v instanceof Date ? v.toISOString() : v
            ])
          )
        )
      },
      // The one write: put an organisation's notes back to awaiting acceptance before a tst run.
      resetToAwaiting: async (orgIds) =>
        (
          await pool
            .request()
            .query(
              `UPDATE Prn SET PrnStatusId = ${STATUS.AWAITING} WHERE OrganisationId IN (${guidList(orgIds)})`
            )
        ).rowsAffected[0],
      close: () => pool.close()
    }
  } catch (e) {
    // The driver message can echo connection details; keep only the code.
    return { reason: `tst DB unreachable (${e.code || e.name})` }
  }
}

function localQuery() {
  const db = require('./local/lib/db.js')
  return { query: async (text) => db.sqlJson(text), close: async () => {} }
}

export async function connect(env) {
  const q = env === 'local' ? localQuery() : await tstQuery()
  if (!q.query) return { available: false, reason: q.reason }
  return {
    available: true,
    reason: null,
    close: q.close,
    resetToAwaiting: q.resetToAwaiting,
    // orgIds: the organisation's external id, plus the compliance scheme id for CS accounts (tst holds CS notes there).
    listPrns(orgIds, numbers) {
      const only = numbers ? ` AND PrnNumber IN (${textList(numbers)})` : ''
      return q.query(
        `SELECT ${PRN_COLUMNS} FROM Prn WHERE OrganisationId IN (${guidList([].concat(orgIds))})${only} ORDER BY Id`
      )
    },
    async prn(orgIds, number) {
      return (await this.listPrns(orgIds, [number]))[0] || null
    },
    // Newest status-history row for a PRN (the audit trail entry the last accept/reject wrote).
    async lastHistory(prnId) {
      const rows = await q.query(
        `SELECT TOP 1 Id, CreatedOn, CreatedByUser, CreatedByOrganisationId, PrnStatusIdFk, ObligationYear, Comment
         FROM PrnStatusHistory WHERE PrnIdFk = ${Number(prnId)} ORDER BY Id DESC`
      )
      return rows[0] || null
    }
  }
}
