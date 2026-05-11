import { browser, $, $$, expect } from '@wdio/globals'

const EMAIL_LABEL = /email/i
const PASSWORD_LABEL = /password/i
const SIGN_IN_BUTTON = /sign in/i

async function fieldByLabel(labelRegex) {
  const labels = await $$('label')
  for (const label of labels) {
    const text = await label.getText()
    if (!labelRegex.test(text)) continue
    const forAttr = await label.getAttribute('for')
    if (forAttr) {
      const field = await $(`#${forAttr}`)
      if (await field.isExisting()) return field
    }
    const nested = await label.$('input')
    if (await nested.isExisting()) return nested
  }
  throw new Error(`No input found for label matching ${labelRegex}`)
}

async function clickButton(regex) {
  const buttons = await $$('button, input[type="submit"], a')
  for (const btn of buttons) {
    const text =
      (await btn.getText()) || (await btn.getAttribute('value')) || ''
    if (regex.test(text)) {
      await btn.click()
      return
    }
  }
  throw new Error(`No button/link found matching ${regex}`)
}

async function signIn() {
  const email = process.env.EPR_USER_EMAIL
  const password = process.env.EPR_USER_PASSWORD

  if (!email || !password) {
    throw new Error(
      'EPR_USER_EMAIL and EPR_USER_PASSWORD must be set in the environment (see .env.example).'
    )
  }

  await browser.url('/report-data')
  await clickButton(/^sign in$/i)

  const emailInput = await fieldByLabel(EMAIL_LABEL)
  await emailInput.setValue(email)
  const passwordInput = await fieldByLabel(PASSWORD_LABEL)
  await passwordInput.setValue(password)

  await clickButton(SIGN_IN_BUTTON)

  const accountHomeHeading = $('h1*=Account home')
  await accountHomeHeading.waitForDisplayed({ timeout: 30000 })
  await expect(accountHomeHeading).toBeDisplayed()
}

export { signIn }
