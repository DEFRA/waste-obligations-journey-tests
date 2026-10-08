---
name: wiki-lookup
description: Answer a question about the EPR programme (teams, services, environments, PRN/PERN, compliance schemes, decisions, architecture) from the Confluence wiki extract vendored in the sibling epr-qa-control-plane repo, with page citations. Use when the user asks what something is, how something works, or for programme background not covered by .claude/rules.
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob, Agent
argument-hint: <question>
---

# Wiki lookup

`epr-qa-control-plane` vendors an extract of the programme's Confluence. It's a sibling of this repo; set
`QA_CONTROL_PLANE` if it lives elsewhere. Read it there and don't copy it here, because it's large and refreshed in
that repo.

```
W=${QA_CONTROL_PLANE:-../epr-qa-control-plane}/wiki
$W/sitemaps/pruned_EAD.md  pruned_EDIA.md  pruned_MWR_final.md     # page titles and ids per space
$W/summaries/{EAD,EDIA,MWR}/<page_id>.txt                          # one distilled summary per page
```

- **EAD:** Alpha Discovery and the R3 redesign.
- **EDIA:** data, integration and the Calculator platform; obligations, fees and payments.
- **MWR:** Major Waste Reforms, the delivery wiki. It covers PRN/PERN, compliance schemes, user journeys and design
  decisions.

## How to answer

1. **Check the curated knowledge first:** the rules in `.claude/rules/` (PRN/PERN and obligations, Manage
   Obligations, CSoC, environments).
2. **Find candidate pages:** grep the sitemaps for the term and its synonyms, for example
   `grep -i "PRN\|PERN" $W/sitemaps/pruned_MWR_final.md`.
3. **Read only the matching summaries.**
4. **Answer with citations** as `[pid:NNNN]`. Give the link
   `https://eaflood.atlassian.net/wiki/spaces/<SPACE>/pages/<pid>` when asked.
5. **Not enough to answer:** if the summaries don't cover it, say so. Don't guess.
6. **Broad questions:** for a question that needs many pages, delegate to an Explore agent scoped to `$W`.
7. **Missing repo:** if the repo isn't there, say so and give its clone URL,
   `https://github.com/DEFRA/epr-qa-control-plane`.

Summaries can be months old. The live Confluence page and the code win over them.
