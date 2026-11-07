# n8n-nodes-purelymail

An n8n node for [Purelymail](https://purelymail.com). Manage mailboxes, domains, routing rules, app
passwords and account credit from a workflow.

## What this node is, and what it is not

This is an **administration and provisioning** node. Read this before expecting more from it:

- **It cannot send email.** Purelymail's API has no send endpoint. Sending is SMTP.
- **It cannot read mailboxes or messages.** There is no endpoint for that either; reading is IMAP.
- It **can** create and manage the mailboxes, domains and routing rules, and it **can create the app
  passwords** your mail clients use.

So to send mail from n8n, use this node to provision the mailbox and create an app password, then use
n8n's own **Email (SMTP)** node to send, and the **IMAP Email Trigger** node to react to incoming mail.
That combination is what makes Purelymail usable end to end in a workflow.

I verified the absence of send and read endpoints against the live API: thirteen plausible names
(`sendMail`, `sendEmail`, `listMessages`, `getMessages`, `listMailboxes` and similar) all returned 404,
while real endpoints answer 200 with a JSON body.

## Install

Self-hosted n8n only, because it is a community node.

1. In n8n, open **Settings > Community Nodes**.
2. Select **Install** and enter `n8n-nodes-purelymail`.
3. Restart n8n if prompted.

More ways to install, including Docker and entirely offline from a tarball, are in
[docs/INSTALL-OPTIONS.md](docs/INSTALL-OPTIONS.md). How releases work is in
[docs/PUBLISHING.md](docs/PUBLISHING.md), and publishing from a Windows machine is in
[docs/PUBLISH-FROM-WINDOWS.md](docs/PUBLISH-FROM-WINDOWS.md).

## Credential

Create a **Purelymail API** credential and paste your API token. Get it from the Purelymail account
management page with **Refresh API Key**. It is sent as the `Purelymail-Api-Token` header.

**Important, and unusual:** Purelymail answers with HTTP 200 even when a call fails, putting the error
in the body as `{"type":"error","code":...,"message":...}`. The node checks that body and raises the
real error, but n8n's built-in connection test only sees the status code, so a green test does not
prove your key is right. Run any operation, such as Billing, Check Credit, to confirm it.

Never paste a token into a chat or a repository.

## Operations

Successful delete operations return `{ "deleted": true }`. This replaces the previous
service-specific response fields; workflows using those fields should be updated.

**User**, meaning mailboxes

- **Create**: name, domain, password, and optionally recovery methods, password reset, search indexing
  and a welcome email
- **Get**, **List**, **Modify** (rename, new password, and tri-state settings for password reset, search
  indexing and two factor authentication), **Delete**
- **Create App Password**: returns the generated password, which is what a mail client uses when two
  factor authentication is on. **Delete App Password** removes one

**Domain**

- **Add**, **List**, **Delete**, **Update Settings** (account reset, symbolic subaddressing, DNS
  recheck), **Get Ownership Code** for the DNS record that proves the domain is yours

**Routing**

- **Create** a forwarding or catch-all rule, **List**, **Delete**
- The match type is a dropdown, not raw flags: **Exact Address**, **Any Address Starting With**, or
  **Catch-All**. Purelymail's API takes booleans for these; the node translates

**Password Reset**

- **Upsert**, **List** and **Delete** the email or phone recovery methods a user can reset with

**Billing**

- **Check Credit**, useful on a schedule so a low balance never surprises you

## Attribution

This is an unofficial community node. Purelymail is a trademark of its owner, and the node icon is
Purelymail's own favicon as published on purelymail.com. This package is not affiliated with or
endorsed by Purelymail.

Their API is documented in their own OpenAPI specification at
`https://news.purelymail.com/api/index.html`, which is where the endpoints, request fields and result
shapes in this node come from.

## License

MIT. See LICENSE.
