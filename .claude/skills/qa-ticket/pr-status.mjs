#!/usr/bin/env node
// Pull requests for a Jira ticket across the DEFRA GitHub organisation, with what QA needs to pick an environment:
// state, review, checks, merge time and, for a merged PR, the first version tag that contains it (compare that with
// the version deployed to each environment in CDP Portal).
//
//   node .claude/skills/qa-ticket/pr-status.mjs MO-428 [--json]
//
// Uses the gh CLI (already signed in). Read-only.
// A PR is "linked" when the key is in its title or branch name; PRs that only mention the key in the body or comments
// are listed as "mentions" so they can be checked by hand.

import { execFileSync } from 'node:child_process'

const key = (process.argv[2] || '').toUpperCase()
if (!/^[A-Z][A-Z0-9]+-\d+$/.test(key)) {
  process.stderr.write('usage: pr-status.mjs <JIRA-KEY> [--json]\n')
  process.exit(1)
}

function gh(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }) || 'null')
}

// The first tag (newest-first list, walked back) that still contains the merge commit.
function firstTagWith(repo, sha) {
  let tags
  try {
    tags = gh(['api', `repos/${repo}/tags?per_page=30`, '--jq', '[.[].name]'])
  } catch {
    return null
  }
  let found = null
  for (const tag of tags) {
    let status
    try {
      status = gh([
        'api',
        `repos/${repo}/compare/${sha}...${encodeURIComponent(tag)}`,
        '--jq',
        '{status}'
      ]).status
    } catch {
      break
    }
    if (status === 'ahead' || status === 'identical') found = tag
    else break
  }
  return found
}

const hits = gh([
  'search',
  'prs',
  key,
  '--owner',
  'DEFRA',
  '--limit',
  '30',
  '--json',
  'number,repository,url'
])

const prs = hits.map((h) => {
  const repo = h.repository.nameWithOwner
  const pr = gh([
    'pr',
    'view',
    String(h.number),
    '-R',
    repo,
    '--json',
    'number,title,state,isDraft,url,headRefName,baseRefName,mergedAt,mergeCommit,reviewDecision,statusCheckRollup,updatedAt'
  ])
  const checks = (pr.statusCheckRollup || []).map(
    (c) => c.conclusion || c.state || c.status
  )
  const failing = checks.filter((c) =>
    ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED'].includes(
      c
    )
  ).length
  const pending = checks.filter((c) =>
    ['PENDING', 'IN_PROGRESS', 'QUEUED', 'EXPECTED'].includes(c)
  ).length
  const linked = new RegExp(`\\b${key}\\b`, 'i').test(
    `${pr.title} ${pr.headRefName}`
  )
  return {
    repo,
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.isDraft && pr.state === 'OPEN' ? 'DRAFT' : pr.state,
    linked,
    branch: `${pr.headRefName} -> ${pr.baseRefName}`,
    review: pr.reviewDecision || 'NONE',
    checks: checks.length
      ? failing
        ? `${failing} failing`
        : pending
          ? `${pending} pending`
          : 'passing'
      : 'none',
    mergedAt: pr.mergedAt || null,
    mergeCommit: pr.mergeCommit?.oid || null,
    firstTag:
      pr.state === 'MERGED' && pr.mergeCommit
        ? firstTagWith(repo, pr.mergeCommit.oid)
        : null
  }
})
prs.sort((a, b) => Number(b.linked) - Number(a.linked))

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(prs, null, 2)}\n`)
} else if (!prs.length) {
  process.stdout.write(`No pull requests in DEFRA mention ${key}.\n`)
} else {
  for (const p of prs) {
    process.stdout.write(
      `${p.linked ? 'linked  ' : 'mentions'} ${p.repo}#${p.number} ${p.state} | review ${p.review} | checks ${p.checks}` +
        `${p.mergedAt ? ` | merged ${p.mergedAt.slice(0, 10)}` : ''}${p.firstTag ? ` | first in ${p.firstTag}` : ''}\n` +
        `         ${p.title}\n         ${p.branch}\n         ${p.url}\n`
    )
  }
}
