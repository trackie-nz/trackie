// @ts-strict-ignore
import crypto from 'node:crypto';

/** Result of deriving an account identity from OpenID userinfo claims. */
type IdentityResult = { identity: string } | { error: string };


// HMAC digest truncated to 20 hex chars
const IDENTITY_LENGTH = 20;

/**
 * Derive a stable, irreversible account identity from verified OpenID claims.
 *
 * Keys identity on HMAC-SHA256(verified_email, secret) rather than the raw
 * `preferred_username ?? login ?? email ?? ...` chain, so Actual's database
 * never stores a reversible identifier. Rejects unverified or missing email:
 * identity must not be derived from an address the identity provider has not
 * confirmed the user controls.
 *
 * Pure and dependency-free (only node:crypto + the env secret) so it is unit
 * testable in isolation - the privacy property is enforced by a test, not just
 * asserted in the security docs.
 */
export function deriveOpenIdIdentity(userInfo: {
  email?: unknown;
  email_verified?: unknown;
}): IdentityResult {
  const secret = process.env.ACTUAL_IDENTITY_SECRET;
  if (!secret) {
    console.error('ACTUAL_IDENTITY_SECRET is not set');
    return { error: 'openid-grant-failed: identity-secret-not-configured' };
  }

  const email = typeof userInfo.email === 'string' ? userInfo.email.trim() : '';
  const verified =
    userInfo.email_verified === true || userInfo.email_verified === 'true';
  if (!email || !verified) {
    return { error: 'openid-grant-failed: no verified email claim was found' };
  }

  return {
    identity: crypto
      .createHmac('sha256', secret)
      .update(email.toLowerCase())
      .digest('hex')
      .slice(0, IDENTITY_LENGTH),
  };
}
