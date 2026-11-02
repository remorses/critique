/** @jsxImportSource hono/jsx */
// Routes: GET /privacy, GET /terms.
// Every statement here must match what worker.tsx, diff-password.tsx, diff-crypto.ts and diff-store.ts
// really do. Update these pages when storage, TTLs or providers change.

import { Hono } from "hono"
import type { Child } from "hono/jsx"

const OPERATOR = "Tommaso De Rossi"
const OPERATOR_GITHUB = "https://github.com/remorses"
const REPO_URL = "https://github.com/remorses/critique"
const CONTACT_EMAIL = "tommy@unframer.co"
const LAST_UPDATED = "November 2, 2026"

export function LegalLinks() {
  return (
    <footer class="legal-links">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href={REPO_URL}>GitHub</a>
    </footer>
  )
}

export const LEGAL_LINKS_CSS = `
  .legal-links { display: flex; gap: 16px; justify-content: center; margin-top: 24px; font-size: 13px; }
  .legal-links a { color: inherit; opacity: 0.7; }
  .legal-links a:hover { opacity: 1; }
`

function Page({ title, children }: { title: string; children: Child }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        <link rel="icon" href="/favicon-light.png" media="(prefers-color-scheme: light)" />
        <link rel="icon" href="/favicon-dark.png" media="(prefers-color-scheme: dark)" />
        <style>{PAGE_CSS}</style>
      </head>
      <body>
        <main>
          {children}
          <LegalLinks />
        </main>
      </body>
    </html>
  )
}

function Contact() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
  )
}

function PrivacyPage() {
  return (
    <Page title="Privacy policy · critique.work">
      <h1>Privacy policy</h1>
      <p class="muted">Last updated: {LAST_UPDATED}</p>

      <h2>Who runs critique.work</h2>
      <p>
        critique.work is run by {OPERATOR} (<a href={OPERATOR_GITHUB}>GitHub: remorses</a>), who is
        responsible for the data described here. Contact: <Contact />.
      </p>
      <p>
        This policy covers the hosted service at critique.work. The critique CLI runs on your machine
        and only sends data to critique.work when you use <code>--web</code>. If you set{" "}
        <code>CRITIQUE_WORKER_URL</code> to another server, this policy does not apply to it.
      </p>

      <h2>What is stored</h2>
      <table>
        <thead>
          <tr><th>Data</th><th>Why</th><th>How long</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>The rendered diff (desktop and mobile HTML), the raw patch, and a preview image</td>
            <td>To show the link you shared</td>
            <td>7 days, or no expiry if you have an active license. Unpublishing deletes it sooner.</td>
          </tr>
          <tr>
            <td>An owner secret, a random ID made on your machine</td>
            <td>To let you delete your upload</td>
            <td>Same as the diff</td>
          </tr>
          <tr>
            <td>
              License records: the license key, its status, your Stripe customer and subscription IDs,
              and dates
            </td>
            <td>To make links of paying users permanent</td>
            <td>No automatic expiry</td>
          </tr>
        </tbody>
      </table>
      <p>
        Diffs are stored compressed in Cloudflare R2. Password protected diffs are stored encrypted.
        Owner secrets and license records are stored in Cloudflare Workers KV. Your email address is not stored by critique.work. Stripe keeps
        it, and it is given to Resend once to send you the license key.
      </p>

      <h2>Who can see your diff</h2>
      <ul>
        <li>
          <strong>Anyone with the link</strong> can open the diff, its <code>.patch</code> and its
          preview image. Links are long random-looking IDs and there is no public
          list of them. But if someone posts a link publicly, search engines and others can find it.
        </li>
        <li>
          The ID of a public diff is a hash of its content. If two people upload exactly the same
          diff, they get the same link.
        </li>
        <li>
          A <strong>password</strong> encrypts the diff on your machine before upload (AES-256-GCM).
          critique.work never receives the password and cannot read the diff. Viewers decrypt it in
          their browser. A short password can be guessed by anyone who gets the encrypted data, and a
          lost password cannot be recovered.
        </li>
        <li>
          The CLI also prints a key that opens only that diff, for <code>curl</code>. When you send it,
          critique.work uses it to decrypt that one response and does not store it.
        </li>
        <li>Public diffs, without a password, are not encrypted. The operator can technically read them.</li>
        <li>Public diffs get a preview image that chat apps and social sites show next to the link.</li>
      </ul>
      <p>
        Do not upload secrets, credentials, or personal data that you are not allowed to share.
      </p>

      <h2>Cookies and browser storage</h2>
      <table>
        <thead>
          <tr><th>Name</th><th>What it holds</th><th>Lifetime</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>IndexedDB <code>critique</code></td>
            <td>
              Keys made from the passwords you typed that worked, so you do not type them again. The
              browser does not let any script read the password back. Never sent to critique.work.
            </td>
            <td>Until you clear site data. The last 10 are kept.</td>
          </tr>
        </tbody>
      </table>
      <p>
        critique.work has no analytics, no ads and no third party tracking scripts.
      </p>

      <h2>Logs</h2>
      <p>
        critique.work does not keep its own access logs and does not store IP addresses. Cloudflare
        processes every request (for example your IP address and browser headers) to run the
        service, under its own privacy policy. Error messages can appear in Cloudflare's short-lived
        worker logs.
      </p>

      <h2>Service providers</h2>
      <ul>
        <li>
          <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare</a>: hosting and storage of
          diffs and license records.
        </li>
        <li>
          <a href="https://stripe.com/privacy">Stripe</a>: payments. Stripe collects your payment
          details and email. critique.work gets your email from Stripe to send the license key, and
          stores only the IDs listed above.
        </li>
        <li>
          <a href="https://resend.com/legal/privacy-policy">Resend</a>: sends the email with your
          license key.
        </li>
      </ul>

      <h2>On your machine</h2>
      <p>
        The CLI saves your license key and owner secret in <code>~/.critique/license.json</code>. The
        same owner secret is sent with every upload from that machine. The{" "}
        <code>critique review</code> command sends your diff to the AI coding agent you run locally,
        not to critique.work, so that agent's own terms apply.
      </p>

      <h2>Delete your data</h2>
      <ul>
        <li>
          Run <code>critique unpublish &lt;url&gt;</code> on the machine that uploaded the diff. It
          deletes the HTML, patch, preview image and owner secret. Copies cached on
          Cloudflare servers and in browsers can stay up to 1 day, or 7 days for the preview image in
          browsers.
        </li>
        <li>
          To delete a license record, or a diff you can no longer unpublish, email{" "}
          <Contact /> with the link.
        </li>
        <li>
          You can also email to ask what data about you is stored, or to correct it.
        </li>
      </ul>

      <h2>Changes</h2>
      <p>
        If this policy changes, the date at the top changes too. The history of this page is public in
        the <a href={REPO_URL}>GitHub repository</a>.
      </p>
    </Page>
  )
}

function TermsPage() {
  return (
    <Page title="Terms of service · critique.work">
      <h1>Terms of service</h1>
      <p class="muted">Last updated: {LAST_UPDATED}</p>

      <h2>The service</h2>
      <p>
        critique.work hosts diffs uploaded with the critique CLI and shows them at shareable links.
        It is run by {OPERATOR} (<a href={OPERATOR_GITHUB}>GitHub: remorses</a>). Contact:{" "}
        <Contact />. By uploading to or using critique.work you agree to these terms. The{" "}
        <a href="/privacy">privacy policy</a> explains what is stored.
      </p>

      <h2>Your content</h2>
      <ul>
        <li>You keep all rights to the code and text you upload.</li>
        <li>
          You give the operator permission to store your upload, make a preview image of it, and show
          it to anyone who opens its link, only to run the service.
        </li>
        <li>
          You must have the right to share what you upload. Do not upload secrets, credentials, or
          personal data that you are not allowed to share. Anyone with the link can see it.
        </li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Do not use critique.work to:</p>
      <ul>
        <li>host illegal content, malware, phishing pages, or content that violates others' rights</li>
        <li>harass people or spam</li>
        <li>overload, attack, or try to get around the limits of the service</li>
      </ul>
      <p>
        The operator can remove content or block access that breaks these rules. Report abuse to{" "}
        <Contact />.
      </p>

      <h2>Free links and paid licenses</h2>
      <ul>
        <li>Free uploads expire after 7 days.</li>
        <li>
          A yearly subscription, paid through Stripe, gives a license key. Uploads made with an active
          license do not expire. The price is shown at checkout.
        </li>
        <li>
          The subscription renews every year until you cancel. To cancel, email <Contact />. After
          it ends, new uploads expire after 7 days again. Uploads made while it was active stay until
          you unpublish them or the service stops.
        </li>
      </ul>

      <h2>Open source</h2>
      <p>
        The critique CLI and this server are open source under the MIT license. These terms only
        cover the hosted service at critique.work.
      </p>

      <h2>No warranty</h2>
      <p>
        critique.work is provided "as is", without warranty of any kind. It can be down, lose data,
        or change. The operator can change or stop the service at any time. Keep your own copy of
        anything you need. Your diffs are always in your git repository.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, the operator is not liable for indirect or consequential
        damages, or for lost data or profits. Total liability is limited to the amount you paid for
        critique.work in the 12 months before the claim.
      </p>

      <h2>Changes</h2>
      <p>
        If these terms change, the date at the top changes too. The history of this page is public in
        the <a href={REPO_URL}>GitHub repository</a>.
      </p>
    </Page>
  )
}

const PAGE_CSS = `
  :root { color-scheme: light dark; --bg: #ffffff; --fg: #1f2328; --muted: #656d76; --border: #d0d7de; --code-bg: #f6f8fa; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0d1117; --fg: #e6edf3; --muted: #8d96a0; --border: #30363d; --code-bg: #161b22; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; line-height: 1.6; }
  main { max-width: 760px; margin: 0 auto; padding: 48px 20px; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  h2 { font-size: 18px; margin: 32px 0 8px; }
  a { color: inherit; }
  .muted { color: var(--muted); margin-top: 0; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em; background: var(--code-bg); border-radius: 6px; }
  code { padding: 2px 5px; }
  pre { padding: 12px 14px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; vertical-align: top; padding: 8px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 600; }
  li { margin-bottom: 6px; }
  ${LEGAL_LINKS_CSS}
  .legal-links { border-top: 1px solid var(--border); padding-top: 16px; margin-top: 48px; }
`

const route = new Hono()

route.get("/privacy", (c) => c.html(<PrivacyPage />))
route.get("/terms", (c) => c.html(<TermsPage />))

export { route as legalRoute }
