export function getEnvPrefix() {
  return process.env.ENVIRONMENT === 'dev' ? 'DEV' : 'TST'
}

export function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} must be set in the environment (see .env.example).`
    )
  }
  return value
}

export function requirePrefixedEnv(suffix) {
  return requireEnv(`${getEnvPrefix()}_${suffix}`)
}
