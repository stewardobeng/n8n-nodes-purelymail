# Publishing this node

## Do you need a GitHub account? No.

npm does not require GitHub. The GitLab CI job below uses **OpenID Connect and Sigstore**, so npm
verifies that the package came from this repository on GitLab, not from GitHub. That matters here
because Steward's GitHub account is suspended, and nothing in the publish path depends on it.

## The package is unscoped, which makes this simple

The name is `n8n-nodes-purelymail`, so there is no npm organisation to create, no scope and no
`--access public` requirement. It is already published, maintained by `stewardobeng`.

## Publishing a new version

Versions are immutable on npm and cannot be republished, so every change needs a new version number.

```bash
npm version patch --no-git-tag-version   # or minor / major
npm run build && npm run lint && npm test
npm publish
git add -A && git commit -m "..."  && git push
```

`prepublishOnly` already runs build, lint and tests, so a broken tree cannot be published even if you
forget the middle step. The n8n starter ships `n8n-node prerelease` there instead, which refuses a
plain `npm publish`; that guard was replaced deliberately.

## Publishing through GitLab CI instead

Tagging a commit makes the `publish` job available as a manual action, and it publishes with a
**provenance statement** signed by Sigstore, which anyone can verify:

```bash
git tag v0.1.1 && git push origin v0.1.1
```

Set `NPM_TOKEN` in the project's CI/CD variables, masked and protected, holding an npm token with
publish rights for this package. Never commit a token, and never paste one into a chat.

## What actually ships

Only `dist` is published, minus the TypeScript build cache, which keeps the tarball at about 18 kB
across 17 files. `n8n-workflow` is a peer dependency and is not bundled, and there are no runtime
dependencies at all.

## Checking a published version

```bash
npm view n8n-nodes-purelymail version
npm view n8n-nodes-purelymail dist.tarball
```
