---
"critique": minor
---

Password protected links are now **end-to-end encrypted**. With `--password` (or `CRITIQUE_PASSWORD`), the CLI gzips and encrypts the desktop HTML, mobile HTML and patch with AES-256-GCM before upload. The key comes from the password with PBKDF2-SHA256 (600,000 rounds). critique.work stores only ciphertext and never receives the password. The browser decrypts after the viewer types it.

```bash
critique --web --password 'a long passphrase only you share'
```

Agents read the patch with curl. The CLI prints the command after upload, and `--json` includes it as `curl`. The cookie holds a key that opens only this diff, never the password:

```bash
curl -b 'critique_key=<key>' 'https://critique.work/v/<id>.patch'
```

Breaking changes:

- The `X-Critique-Password` header and the `cw_pw` cookie are gone. The browser remembers passwords as keys in IndexedDB, and scripts cannot read the password back.
- critique 0.4.0 can no longer upload password links, because it sends the password to the server. Update critique.
- Password links made with 0.4.0 are deleted. The server only had a password hash, so it cannot encrypt them.
- The CLI warns when the password is shorter than 12 characters. Anyone who gets the ciphertext can guess short passwords offline, and a lost password cannot be recovered.
