class RegistryCheckError extends Error {}

function requireValue(name) {
  const value = process.env[name];
  if (!value) throw new RegistryCheckError(`${name} is required`);
  return value;
}

function httpsOrigin(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new RegistryCheckError(`${label} is not a valid URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new RegistryCheckError(`${label} must use HTTPS without URL credentials or query parameters`);
  }
  return url;
}

function bearerChallenge(header) {
  if (!header || !/^Bearer\s+/i.test(header)) {
    throw new RegistryCheckError('Registry did not return a Bearer authentication challenge');
  }
  let rest = header.replace(/^Bearer\s+/i, '');
  const values = new Map();
  while (rest.length) {
    const match = /^\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]+))\s*(?:,|$)/.exec(rest);
    if (!match) throw new RegistryCheckError('Registry returned a malformed Bearer challenge');
    const name = match[1].toLowerCase();
    if (values.has(name)) throw new RegistryCheckError('Registry returned duplicate Bearer challenge parameters');
    values.set(name, match[2] === undefined ? match[3] : match[2].replace(/\\(.)/g, '$1'));
    rest = rest.slice(match[0].length);
  }
  return values;
}

async function request(url, headers, label) {
  try {
    return await fetch(url, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError'
      ? 'timed out after 20 seconds'
      : 'failed; check HTTPS routing, certificates, and connectivity';
    throw new RegistryCheckError(`${label} ${reason}`);
  }
}

async function json(response, label) {
  try {
    return await response.json();
  } catch {
    throw new RegistryCheckError(`${label} returned invalid JSON`);
  }
}

function tokenClaims(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
    throw new RegistryCheckError('GitLab did not issue a signed JWT');
  }
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    throw new RegistryCheckError('GitLab issued an invalid JWT payload');
  }
}

async function main() {
  const registryHost = requireValue('CI_REGISTRY');
  const registryImage = requireValue('CI_REGISTRY_IMAGE');
  const username = requireValue('CI_REGISTRY_USER');
  const password = requireValue('CI_REGISTRY_PASSWORD');
  const server = httpsOrigin(requireValue('CI_SERVER_URL'), 'CI_SERVER_URL');
  const registry = httpsOrigin(`https://${registryHost}`, 'CI_REGISTRY');
  if (registry.pathname !== '/') throw new RegistryCheckError('CI_REGISTRY must be a registry host without a path');
  if (!registryImage.startsWith(`${registryHost}/`)) {
    throw new RegistryCheckError('CI_REGISTRY_IMAGE does not belong to CI_REGISTRY');
  }
  const project = registryImage.slice(registryHost.length + 1);
  if (!/^[-a-z0-9._]+(?:\/[-a-z0-9._]+)*$/.test(project)
    || project.split('/').some((part) => part === '.' || part === '..')) {
    throw new RegistryCheckError('CI_REGISTRY_IMAGE contains an invalid repository path');
  }
  if (username.includes(':')) throw new RegistryCheckError('CI_REGISTRY_USER cannot contain a colon');
  const repository = `${project}/platform`;
  const endpoint = new URL('/v2/', registry);
  const anonymous = await request(endpoint, {}, 'Unauthenticated registry request');
  if (anonymous.status !== 401) {
    throw new RegistryCheckError(`Unauthenticated registry returned HTTP ${anonymous.status}; expected 401`);
  }
  const challenge = bearerChallenge(anonymous.headers.get('www-authenticate'));
  const realmValue = challenge.get('realm');
  if (!realmValue) throw new RegistryCheckError('Bearer challenge is missing its authentication realm');
  const realm = httpsOrigin(realmValue, 'Bearer realm');
  const serverPath = server.pathname.replace(/\/$/, '');
  if (realm.origin !== server.origin || realm.pathname !== `${serverPath}/jwt/auth`) {
    throw new RegistryCheckError('Bearer realm does not match the GitLab server JWT endpoint');
  }
  if (challenge.get('service') !== 'container_registry') {
    throw new RegistryCheckError('Bearer challenge does not use the container_registry service');
  }
  await anonymous.body?.cancel();

  realm.searchParams.set('service', 'container_registry');
  realm.searchParams.set('scope', `repository:${repository}:pull,push`);
  realm.searchParams.set('account', username);
  const authentication = await request(realm, {
    authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  }, 'Scoped GitLab registry authentication');
  if (authentication.status !== 200) {
    throw new RegistryCheckError(`Scoped GitLab authentication returned HTTP ${authentication.status}; expected 200`);
  }
  const issued = await json(authentication, 'Scoped GitLab authentication');
  const token = issued?.token ?? issued?.access_token;
  const claims = tokenClaims(token);
  const access = Array.isArray(claims?.access)
    ? claims.access.find((entry) => entry?.type === 'repository' && entry?.name === repository)
    : undefined;
  if (!Array.isArray(access?.actions) || !access.actions.includes('pull') || !access.actions.includes('push')) {
    throw new RegistryCheckError('Scoped JWT does not grant both pull and push for the project platform repository');
  }
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp <= now
    || (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 10))) {
    throw new RegistryCheckError('Scoped JWT is expired or not yet valid');
  }
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes('container_registry')) {
    throw new RegistryCheckError('Scoped JWT does not target the container_registry service');
  }
  const authenticated = await request(endpoint, { authorization: `Bearer ${token}` }, 'Authenticated registry request');
  if (authenticated.status !== 200) {
    throw new RegistryCheckError(`Authenticated registry returned HTTP ${authenticated.status}; expected 200`);
  }
  const response = await json(authenticated, 'Authenticated registry');
  if (!response || Array.isArray(response) || typeof response !== 'object') {
    throw new RegistryCheckError('Authenticated registry returned an invalid v2 response');
  }
  console.log(JSON.stringify({
    registry: registry.origin,
    repository,
    anonymous_status: 401,
    gitlab_auth_status: 200,
    scoped_actions: ['pull', 'push'],
    authenticated_status: 200,
  }));
}

main().catch((error) => {
  const message = error instanceof RegistryCheckError ? error.message : 'Unexpected registry verification failure';
  console.error(`Registry check failed: ${message}`);
  process.exitCode = 1;
});
