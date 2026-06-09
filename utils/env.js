export function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} must be set in the environment (see .env.example).`
    )
  }
  return value
}
