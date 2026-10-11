# Publishing from a Windows machine

The package is built here but published from Windows, using the tarball. No SSH to this host and no
token stored anywhere except npm's own config on your machine.

## Step 1: confirm the file

Published versions are immutable, so get the filename exactly right. A missing `n` in the name has
already caused one confusing `ENOENT`.

```powershell
Get-ChildItem "$HOME\Downloads\*purelymail*.tgz" -Recurse -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 3 FullName, Length, LastWriteTime

Get-FileHash "C:\full\path\n8n-nodes-purelymail-0.1.0.tgz" -Algorithm SHA256
```

Expected SHA-256 for version 0.1.0:

```
6d48581c3a20744735a3d410efe156c8ef0e89612a6db7e49788606de4880f59
```

That is the artifact verified here, and it is byte-identical to what is published on npm. If the hash
differs, stop and re-download rather than publishing something unverified.

## Step 2: sign in

```powershell
npm whoami
```

If that fails, or if you get a **404** on a publish, the login is missing or stale. For a scoped
package a 404 usually means "not authenticated" rather than "does not exist".

```powershell
npm login
npm whoami
```

If a stale token is stuck in the config:

```powershell
npm config get //registry.npmjs.org/:_authToken
npm logout
```

## Step 3: publish

```powershell
npm publish "C:\full\path\n8n-nodes-purelymail-0.1.0.tgz"
```

Use quotes around the path, paste the path rather than typing the filename, and do not add a trailing
backslash. Confirm when it prints `+ n8n-nodes-purelymail@0.1.0`.

## Step 4: verify from the registry, not from the console

```powershell
npm view n8n-nodes-purelymail version
npm view n8n-nodes-purelymail dist.tarball
```

## Step 5: update the n8n instance

In n8n, open **Settings > Community Nodes**, choose the package and update it, then restart n8n. The
node itself is cached by the browser, so if an icon or a field looks stale, hard refresh with
**Ctrl + Shift + R**.

## If n8n cannot install it

`Error loading package: npm package not found` usually means the n8n host could not reach the
registry at that moment, not that the upload failed. Check from the host:

```bash
curl -sI https://registry.npmjs.org/n8n-nodes-purelymail | head -1
```

A simpler path that avoids the registry entirely is to copy the tarball to the host and follow
`docs/INSTALL-OPTIONS.md`, option 2.
