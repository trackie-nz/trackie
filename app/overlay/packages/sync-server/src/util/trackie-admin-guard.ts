// @ts-strict-ignore
import type { NextFunction, Request, Response } from 'express';

import { isAdmin } from '#account-db';

import { validateSession } from './validate-user';

/*
The ONLY /admin path a non-admin (including an unauthenticated visitor) may
reach. The login page calls GET /admin/owner-created UNAUTHENTICATED (see the
web client's getIsOwnerCreated) to choose between the bootstrap and sign-in
screens, so blocking it would break login for everyone. Every other /admin
route requires an admin session.

Paths are matched against req.path, which Express reports relative to the
'/admin' mount - so '/owner-created', not '/admin/owner-created'.
*/
const UNAUTH_BOOTSTRAP = ['/owner-created', '/owner-created/'];

/**
 * Deny-by-default gateway for the /admin namespace.
 *
 * Mounted ahead of the upstream admin router so the whole namespace - including
 * any endpoint a future upstream release adds - is closed to non-admins unless
 * it is consciously added to UNAUTH_BOOTSTRAP above. This is the structural
 * counterpart to running Actual's multi-user mode as a zero-trust multi-tenant
 * service: new surface is shut by default rather than open until noticed.
 *
 * Admins (the operator) retain full access, which the user-deletion / disable /
 * cleanup duties documented in the security policy require.
 */
export function trackieAdminGuard(req: Request, res: Response, next: NextFunction) {
  if (UNAUTH_BOOTSTRAP.includes(req.path)) {
    next();
    return;
  }

  const session = validateSession(req, res);
  if (!session) {
    // validateSession has already sent a 401 response.
    return;
  }

  if (isAdmin(session.user_id)) {
    next();
    return;
  }

  res.status(403).send({
    status: 'error',
    reason: 'forbidden',
    details: 'permission-not-found',
  });
}
