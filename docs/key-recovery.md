# Runtime secrets and key recovery

## Existing controls

Keep both root `.env` files outside Git with mode0600 and operator-owned parent directories. Browser `VITE_*` settings are public; never put an API token, encryption key, OTP or database password there. Sentry ingestion DSNs are public project identifiers, not management credentials. No Sentry management token is required by the application.

## Recovery inventory

The encrypted backup contains the original runtime `.env` files: database credentials, application SESSION_SECRET, PATIENT_DATA_ENCRYPTION_KEY/version, SCORING_CREDENTIAL_ENCRYPTION_KEY/version, scoring ACTIVATION_TOKEN_ENCRYPTION_KEY, FACE_SCAN_ENCRYPTION_KEY, vendor API credentials and configured push keys. Blank optional keys remain blank; never generate replacement runtime encryption keys during a routine deployment. Development patient encryption may derive from SESSION_SECRET, making that exact secret essential for recovering existing records.

The outer archive has an independent recovery passphrase stored in a private file outside every backup input. Keep a separately protected recovery copy controlled by the operations owner. Do not store that passphrase inside the encrypted archive or in Git. Server-local archives and keys alone do not survive loss of the server.

## Replacing credentials

For provider/API credentials, obtain a replacement from the vendor, update the appropriate private env, restart only the owning service, verify connectivity without patient content, then revoke the old credential. For database credentials, coordinate the database login and each dependent service. Do not log either value. BOOTSTRAP_TOKEN and ADMIN_BOOTSTRAP_TOKEN should be removed after initial setup; their absence must not block normal service startup.

Encryption keys need special care. Existing records and retained backups depend on their original keys. Changing an encryption env variable alone is **not** supported key rotation and can make records unreadable. Until versioned key lookup and a verified re-encryption migration are implemented, preserve the existing encryption keys. A planned rotation requires an isolated restore/decryption test, compatibility with all retained data and a separately reviewed migration. This task documents recovery and access controls; it does not silently re-encrypt clinical records.

## Recovery verification

Use the isolated restore drill to verify database/file hashes and decryption of a saved PDF with the archived key. Keep the operations owner and protected recovery-copy location in the private deployment configuration, not in public application screens. Record successful drills and credential changes without secret values or clinical data.
