# PairSync – Product Requirements Document (PRD)

**Version:** 3.0 (QR + ECDH Handshake)  
**Last Updated:** August 14, 2026  
**Status:** ✅ **APPROVED – MVP LOCKED**

---

## **1. Executive Summary &amp; Overview**

**PairSync** is an open-source, cross-platform, peer-to-peer (P2P) file and clipboard sharing solution. It enables users to **securely transfer files, text, and media between devices on the same local network** (Wi-Fi or Ethernet) **without relying on internet connectivity or external cloud servers**.

### **Core Value Proposition**

| **Feature**             | **Description**                                                                           | **Differentiator**                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Zero Config**         | No accounts, no cloud setups, and no Bluetooth pairing.                                   | Works out-of-the-box on any local network.                              |
| **Speed**               | Operates at **≥80% of physical local network bandwidth capacity**.                        | No cloud relay latency; direct device-to-device transfer.               |
| **Security**            | **End-to-end local encryption** (TLS 1.3) with **Trust On First Use (TOFU)**.             | Prevents MITM/eavesdropping; no data leaves the local network.          |
| **True Cross-Platform** | Uniform experience across **Mobile (iOS/Android)** and **Desktop (macOS/Windows/Linux)**. | Single codebase (TypeScript) with platform-specific networking bridges. |

---

## **2. User Personas &amp; Core User Stories**

### **User Personas**

| **Persona**          | **Pain Point**                                                                                              | **Success Metric**                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **The Creator**      | Needs to move **large 4K video files (10–100GB)** from iPhone to Windows desktop **without iCloud/cables**. | Transfer completes in **≤10% of cloud upload time**.     |
| **The Professional** | Needs to **copy-paste code snippets or verification tokens** from laptop to test device (Android).          | Clipboard sync in **&lt;2s** with **zero manual steps**. |

### **Core User Stories**

1. **As a user**, I want the app to **automatically discover** other devices running PairSync on my Wi-Fi network so that I **don’t have to manually type IP addresses**.
2. **As a user**, I want to **select multiple files or folders** and send them to a **specific discovered device securely**.
3. **As a receiver**, I want to see a **clear prompt** showing **who is sending what file** (with device name, platform, and file details) **before accepting the transfer**.
4. **As a user**, I want **transfers to continue in the background** even if I switch apps or the device locks.
5. **As a user**, I want **interrupted transfers to resume automatically** when the network reconnects.

---

## **3. Functional Requirements &amp; Feature Scope**

### **3.1 Device Discovery (MVP)**

**Discovery Protocols (3-Tier System)**  
PairSync uses a **prioritized multi-protocol approach** to maximize compatibility:

| **Tier** | **Protocol**         | **Address**                           | **Port** | **Scope**                    | **Fallback**     |
| -------- | -------------------- | ------------------------------------- | -------- | ---------------------------- | ---------------- |
| 1        | UDP Multicast        | `224.0.0.1` (IPv4) / `FF02::1` (IPv6) | 53350    | Same subnet                  | mDNS → Manual IP |
| 2        | mDNS (Bonjour/Avahi) | `_pairsync._tcp.local`                | 53350    | Cross-subnet (with repeater) | Manual IP        |
| 3        | Manual IP Entry      | User-specified                        | 53350    | Any reachable device         | N/A              |

**Requirements:**

- [ ] App **auto-scans** the local network upon launch.
- [ ] Devices display a **human-readable alias** (e.g., "Swift Cheetah", "Golden Eagle") + **platform icon**.
- [ ] Users can **manually trigger a refresh** of the network scan.
- [ ] **Heartbeat Protocol**:
  - Broadcasts device info (alias, platform, IP, port, cert fingerprint) **every 5s**.
  - **Timeout**: 5 missed heartbeats (25s) → device removed from list.
- [ ] **Network Requirements**:
  - Supports **IPv4 + IPv6 dual stack** (prefers IPv6 if available).
  - Requires **UDP 53350** (multicast) + **TCP 53351–53360** (file transfer) to be open.

#### **IP Selection Rules (Multiple Interfaces)**

When a device has multiple network interfaces (e.g., Wi-Fi + Ethernet, IPv4 + IPv6), PairSync advertises **all available IPs** but prioritizes connections as follows:

| **Priority** | **Interface Type** | **IP Version** | **Example**     |
| ------------ | ------------------ | -------------- | --------------- |
| 1            | Wi-Fi              | IPv4           | `192.168.1.100` |
| 2            | Wi-Fi              | IPv6           | `fe80::1`       |
| 3            | Ethernet           | IPv4           | `10.0.0.5`      |
| 4            | Ethernet           | IPv6           | `2001:db8::1`   |

**Connection Logic:**

1. Receiver tries the **highest-priority interface first** (based on table above).
2. If connection fails, falls back to next interface with **exponential backoff** (1s, 2s, 4s).
3. If all interfaces fail, marks device as **unreachable** and removes after timeout.

**Excluded Interfaces:**  
To avoid advertising unreachable or non-local addresses, PairSync **excludes** the following from heartbeats:

- **VPN interfaces** (e.g., `tun0`, `ppp0`).
- **Loopback** (`127.0.0.1`, `::1`).
- **Link-local IPv6** (except `fe80::/10` for standard local discovery).
- **Non-RFC1918 private IPs** (e.g., public IPs mistakenly assigned on local networks).

**Manual IP Discovery UX (Enterprise Networks):**  
For networks where auto-discovery fails (e.g., AP isolation, captive portals):

- Each device shows its **local IP:Port** in the device details screen (e.g., _"192.168.1.100:53350 – Tap to copy"_).
- **QR Code**: Generate a QR code containing `pairsync://<IP>:<PORT>` for easy scanning on other devices.
- **Fallback Instructions**: If manual entry fails, show: _"Ensure both devices are on the same network. Try restarting the app."_

**Heartbeat Payload (JSON):**

```json
{
  "device_id": "a1b2c3d4-5678-90ef-ghij-klmnopqrstuv",
  "alias": "Swift Cheetah",
  "platform": "iOS",
  "interfaces": [
    {
      "type": "Wi-Fi",
      "ipv4": ["192.168.1.100"],
      "ipv6": ["fe80::1"],
      "preferred": true
    },
    {
      "type": "Ethernet",
      "ipv4": ["10.0.0.5"],
      "ipv6": [],
      "preferred": false
    }
  ],
  "port": 53350,
  "cert_fingerprint": "A1:B2:C3:D4:E5:F6..."
}
```

---

### **3.2 File Transfer (MVP)**

**Supported Payloads:**

- Single files (any type)
- Multiple files/folders (as a single transfer batch)
- Clipboard content (see **Clipboard Content Types** below)

#### **Protocol Versioning**

PairSync uses a **`MAJOR.MINOR`** versioning scheme (e.g., `1.0`):

- **MAJOR**: Breaking changes (incompatible with previous versions).
- **MINOR**: Backward-compatible changes.

All requests/responses include the header:

```http
X-PairSync-Version: 1.0
```

**Compatibility Matrix:**

| **Sender** | **Receiver** | **Result**            | **Behavior**                                      |
| ---------- | ------------ | --------------------- | ------------------------------------------------- |
| 1.0        | 1.0          | ✅ Full compatibility | Normal operation.                                 |
| 1.0        | 1.1          | ✅ Compatible         | Proceed with transfer; disable 1.1-only features. |
| 1.1        | 1.0          | ✅ Compatible         | Proceed with transfer; disable 1.1-only features. |
| 1.0        | 2.0          | ❌ Incompatible       | Block transfer; prompt to update.                 |

**Handshake Behavior:**

- If **minor version mismatch**: Proceed with transfer + warn user:  
  _"Device versions differ (1.0 vs 1.1). Transfer may have limited features."_
- If **major version mismatch**: Block transfer + error:  
  _"Incompatible PairSync version. Update both devices to continue."_

#### **Wire Format: `/api/pairsync/v1/prepare` Endpoint**

**Request (Sender → Receiver):**

```http
POST /api/pairsync/v1/prepare HTTP/1.1
Content-Type: application/json
X-PairSync-Version: 1.0
X-Nonce: <32-byte random hex>
X-Device-ID: <UUIDv4>
X-Cert-Fingerprint: <SHA-256 of sender's cert>

{
  "transfer_id": "<UUIDv4>",
  "file_id": "<UUIDv4>",
  "file_name": "video.mp4",
  "file_size": 104857600,
  "chunk_size": 4194304,
  "total_chunks": 25,
  "hash_algorithm": "SHA-256",
  "file_hash": "<SHA-256 of entire file>",
  "chunk_hashes": ["<SHA-256 of chunk 0>", "<SHA-256 of chunk 1>", ...],
  "mime_type": "video/mp4",
  "timestamp": 1718467200000
}
```

**Response (Receiver → Sender):**

- **Success (200 OK):**

  ```http
  HTTP/1.1 200 OK
  Content-Type: application/json
  X-PairSync-Version: 1.0

  {
    "status": "approved",
    "transfer_port": 53351,
    "device_alias": "Golden Eagle",
    "device_platform": "macOS"
  }
  ```

- **Rejection (403 Forbidden):**

  ```http
  HTTP/1.1 403 Forbidden
  Content-Type: application/json

  {
    "status": "rejected",
    "reason": "user_declined" | "storage_full" | "unsupported_file_type" | "version_mismatch" | "rate_limited"
  }
  ```

#### **Chunked Transfer Protocol**

- **Endpoint:** `POST /api/pairsync/v1/chunk/<transfer_id>`
- **Request Headers:**
  ```http
  X-Transfer-ID: <transfer_id>
  X-Chunk-Index: <0..N-1>
  X-Chunk-Hash: <SHA-256 of this chunk>
  X-Total-Chunks: <N>
  Content-Length: <chunk_size>
  Content-Type: application/octet-stream
  ```
- **Bitmap Encoding:** JSON array of **received chunk indices** (e.g., `[0, 1, 2, 4]`).
- **Resume:** Receiver sends `GET /api/pairsync/v1/resume/<transfer_id>` with header:
  ```http
  X-Missing-Chunks: [3,5,6]
  ```

**Transfer Protocol:**

- **Chunked Streaming**:
  - **Chunk Size**: 4MB (configurable; smaller on low-memory devices).
  - **Memory Limits**:
    - Mobile: **Max 50MB in-memory buffer** (2 chunks).
    - Desktop: **Max 200MB buffer** (10 chunks).
  - Chunks written **directly to disk** (never loads full file in memory).
- **Resume Support**:
  - Each transfer includes a **manifest** with:
    - File metadata (name, size, hashes).
    - **Bitmap of received chunks** (e.g., `[0, 1, 2, 4]`).
    - On reconnect, receiver requests **missing chunks only**.
- **Progress Tracking**:
  - **Visual progress bars** showing:
    - Transfer speed (MB/s).
    - Percentage completed.
    - Time remaining (ETA).
- **Cancellation**: Can be canceled from **sender or receiver side** at any time.

**File Handling:**

- **Duplicate Filenames**: Auto-rename with suffix (e.g., `file (1).txt`).
- **Overwrite Policy**: Prompt user for confirmation (configurable in settings).
- **Max File Size**: **No hard limit** (tested up to 100GB).

**Concurrent Transfers:**

- **Max 4 concurrent transfers** (configurable in settings).
- Additional transfers are **queued** and start automatically.

#### **Clipboard Content Types**

| **Type**             | **MIME Type**                  | **Max Size** | **Fallback**             | **Platform Notes**              |
| -------------------- | ------------------------------ | ------------ | ------------------------ | ------------------------------- |
| Plain Text           | `text/plain`                   | 25MB         | Always supported         | UTF-8 encoding.                 |
| Rich Text (RTF)      | `text/rtf`                     | 25MB         | → Plain text             | macOS/Windows only.             |
| HTML                 | `text/html`                    | 25MB         | Strip tags → plain text  | Common in web apps.             |
| PNG Image            | `image/png`                    | 25MB         | Native support           | Lossless.                       |
| JPEG Image           | `image/jpeg`                   | 25MB         | Native support           | Lossy.                          |
| SVG                  | `image/svg+xml`                | 5MB          | Convert to PNG (1080p)   | Vector graphics.                |
| PDF                  | `application/pdf`              | 25MB         | ❌ Not supported (error) | Large files; use file transfer. |
| Video/Audio          | `video/*`, `audio/*`           | 25MB         | ❌ Not supported (error) | Use file transfer instead.      |
| File References      | `application/x-file-reference` | 25MB         | Native support           | URI list.                       |
| iOS Pasteboard Types | `com.apple.*`                  | 25MB         | Extract text/image       | Platform-specific formats.      |

**Behavior:**

- If a type is **unsupported**, skip it and sync only supported types.
- If **all types are unsupported**, show error: _"Clipboard content not supported."_
- If **size &gt; 25MB**, truncate with warning: _"Clipboard content too large (max 25MB)."_

#### **Partial Failure Modes**

PairSync handles mid-transfer failures gracefully:

| **Failure Scenario**                        | **Behavior**                                         | **User Communication**                                                                    | **Recovery**                                        |
| ------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Disk full mid-chunk**                     | Pause transfer immediately.                          | Error: _"Disk full. Free up {X}MB to resume."_ + **Retry button**.                        | Auto-retries every 30s when space is available.     |
| **Storage permission revoked mid-transfer** | Pause transfer.                                      | Error: _"Storage permission denied. Grant access to resume."_ + **Open Settings button**. | Resumes after permission is granted.                |
| **App force-quit during hash verification** | On restart, verify last chunk’s hash.                | Notification: _"Transfer incomplete. Resume?"_                                            | Resumes from last **verified** chunk (not partial). |
| **Network drop mid-chunk**                  | Pause + retry with exponential backoff (1s, 2s, 4s). | Notification: _"Network lost. Reconnecting..."_                                           | Auto-resumes on reconnect.                          |
| **Receiver app killed mid-transfer**        | Sender retries for **5 minutes**, then fails.        | Sender: _"Receiver offline. Retry?"_                                                      | User must manually retry.                           |

**Data Integrity:**

- Each chunk is **hash-verified** before writing to disk.
- If a chunk fails verification, it is **re-requested** (up to 3 retries).
- If verification fails after 3 retries, transfer **fails** with error: _"Data corruption detected. Retry transfer."_

#### **Large Folder Trees**

For folders with many files (e.g., 10,000+ files):

| **Challenge**         | **Solution**                                                          | **User Experience**                                             |
| --------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Memory usage**      | Generate manifests in **batches of 100 files**.                       | Progress: _"Scanning folder... (100/10000 files)"_              |
| **Time to scan**      | Run scanning in a **background thread**.                              | Non-blocking; user can cancel.                                  |
| **UI responsiveness** | Throttle file system access to **50ms per batch**.                    | App remains responsive.                                         |
| **User warnings**     | Prompt if folder has **&gt;10,000 files** or **&gt;10GB total size**. | _"This folder is large. Continue? (Estimated time: X minutes)"_ |

**Manifest Format:**

```json
{
  "transfer_id": "a1b2c3...",
  "folder_name": "Vacation Photos",
  "total_files": 10000,
  "total_size": 1572864000,
  "batch_size": 100,
  "batches": [
    {
      "batch_index": 0,
      "files": [
        {
          "path": "Vacation Photos/2024/beach.jpg",
          "size": 4194304,
          "hash": "A1:B2:C3...",
          "mime_type": "image/jpeg"
        },
        ...
      ]
    },
    ...
  ]
}
```

#### **Concurrent Transfer + Resume Interaction**

- **Independent Resume**: Each transfer’s resume is **independent** of others.
- **Resource Limits**: Max **2 concurrent resumes** (to avoid I/O contention).
- **Priority**: Resume operations have **higher priority** than new transfers.
- **Queue Behavior**: If resume limit is hit, new resume requests are **queued** and start when a slot opens.
- **Progress**: Each transfer shows its own **progress bar** (not aggregated).

---

### **3.3 Security &amp; Permissions (MVP)**

#### **TLS Trust Model (TOFU + Local Storage)**

- Each device generates a **self-signed TLS cert + private key** on first launch (valid for 30 days).
- **First-Time Connection**:
  1. Receiver sees a **trust prompt** with:
  - Sender’s **alias** (e.g., "Swift Cheetah").
  - Sender’s **platform icon** (iOS/Android/macOS/Windows/Linux).
  - Sender’s **SHA-256 cert fingerprint** (e.g., `A1:B2:C3:D4...`).
  2. User taps **"Trust"** to accept (1-tap).
  3. Fingerprint is stored in:
  - **Mobile**: OS keychain (iOS Keychain, Android Keystore).
  - **Desktop**: Encrypted config file (`~/.pairsync/trusted_devices.json`).
- **Subsequent Connections**:
  - If fingerprint matches, **auto-trust** (no prompt).
  - If fingerprint **mismatches**, prompt user to **re-trust** (cert may have regenerated).

#### **Certificate Lifetime &amp; Trust Clarification**

- Certificates are **valid for 30 days** and auto-regenerate when ≤7 days from expiry.
- **Re-Trust Prompt** (enhanced for clarity):
  > \*"Device 'Swift Cheetah' has a new security certificate (expired after 30 days). This is normal. Re-trust to continue using Quick Save?"  
  > **Options**: \[Re-Trust\] \[Cancel\]
- **Why This Happens**: Explained in **Settings &gt; Security &gt; About Certificates**:
  > _"PairSync uses short-lived certificates for security. Devices auto-generate new certificates every 30 days, which may require re-trusting."_

#### **Certificate Regeneration (30-Day Expiry)**

- **Auto-Regeneration**: On app launch, if the cert is **≤7 days from expiry**, a new cert is generated.
- **New Fingerprint**: Each new cert has a **new SHA-256 fingerprint**.
- **Trust Behavior on Regeneration**:
  - If the device was **previously trusted** and the fingerprint **changes**:
    - Show prompt: _"Device 'Swift Cheetah' has a new security certificate. Re-trust?"_
    - Until re-trusted, the device is treated as **untrusted** (requires manual approval per transfer).
  - If the device was **not trusted**, standard trust flow applies.
- **Key Storage**:
  - **Mobile**: Private keys stored in OS keychain (iOS Keychain, Android Keystore).
  - **Desktop**: Private keys stored in encrypted file (`~/.pairsync/keys/private.key`).

#### **Alternative: QR Code + ECDH Handshake (Recommended for v2.0)**

To address **TOFU UX friction** (cert warnings, re-trust prompts), PairSync **v2.0** introduces a **QR code-based ECDH handshake** as the **primary trust method**, with TLS + TOFU as a **fallback** for backward compatibility.

**Workflow:**

1. **Device A (Sender/Configurator):**

- Generates **X25519 key pair** (ephemeral for this session).
- Creates **QR code** containing:
  ```json
  {
    "version": "2.0",
    "device_id": "<UUIDv4>",
    "alias": "<human-readable string>",
    "platform": "<platform>",
    "public_key": "<X25519 public key, base64>",
    "fingerprint": "<SHA-256 of public key, hex>",
    "expiry": <Unix timestamp, +5 minutes>
  }
  ```
- Displays QR code with **device alias** and **expiry countdown** (e.g., _"Scan to connect – Expires in 4:59"_).

2. **Device B (Receiver/Enrollee):**

- Scans QR code using **device camera** (mobile) or **manual entry** (desktop).
- Generates its own **X25519 key pair**.
- Computes **shared secret** = X25519(Device A pubkey, Device B privkey).
- Derives **session keys** using HKDF:
  ```
  session_key = HKDF(shared_secret, salt="PairSync-v2", info="transfer")
  encryption_key = HKDF(session_key, salt="enc", info="AES-256-GCM")
  ```

3. **Secure Channel Establishment:**

- Both devices use **AES-256-GCM** with the derived keys.
- **No TLS** (reduces overhead and cert warnings).
- **First transfer** uses this channel to exchange:
  - Device metadata (alias, platform, capabilities).
  - **Long-term trust token** (for future connections without QR code).

4. **Trust Storage:**

- Store **Device A's public key fingerprint** in trusted devices list.
- For future connections, use **ECDH with long-term keys** (no QR code needed).

**Fallback to TLS + TOFU:**

- If **QR code scanning fails** (e.g., no camera, desktop-to-desktop):
  - Fall back to **current TLS + TOFU workflow** (Section 3.3).
  - Show message: _"QR code not available. Using standard connection method."_

**Security Properties:**

| **Property**    | **QR + ECDH**                     | **TLS + TOFU**            |
| --------------- | --------------------------------- | ------------------------- |
| Forward Secrecy | ✅ Yes (ephemeral keys)           | ❌ No (static certs)      |
| MITM Protection | ✅ Yes (fingerprint verification) | ✅ Yes (TOFU)             |
| User Friction   | ✅ Low (1-time scan)              | ⚠️ Medium (cert warnings) |
| Offline Support | ✅ Yes                            | ✅ Yes                    |
| Cross-Platform  | ✅ Yes                            | ✅ Yes                    |

**Implementation Notes:**

- **Libraries:**
  - **Mobile:** `react-native-crypto` (X25519), `react-native-qrcode-svg` (QR generation), `react-native-vision-camera` (QR scanning).
  - **Desktop:** `x25519-dalek` (Rust), `qrcode` (QR generation), `zbar` (QR scanning via Tauri plugin).
- **QR Code Format:** Use **UTF-8 JSON** with URL-safe base64 encoding for binary fields.
- **Expiry:** QR codes **expire after 5 minutes** to prevent replay attacks.
- **Long-Term Trust:** After initial QR pairing, devices **auto-connect** using stored public keys (no QR needed for subsequent transfers).
- **Quick Save Toggle**:
  - If enabled, **trusted devices** can send files **without manual approval**.
  - **Untrusted devices** always require approval.

#### **Quick Save Rate-Limiting**

To prevent abuse (e.g., a trusted device spamming files), PairSync enforces **per-device rate limits**:

| **Metric**           | **Limit** | **Window** | **Action on Exceed**                                | **User Override**                       |
| -------------------- | --------- | ---------- | --------------------------------------------------- | --------------------------------------- |
| Transfers per device | 10        | 1 minute   | Reject with: _"Too many transfers (max 10/minute)"_ | Configurable in Settings &gt; Security  |
| Data per device      | 1GB       | 1 hour     | Reject with: _"Too much data (max 1GB/hour)"_       | Configurable in Settings &gt; Security  |
| Concurrent transfers | 4         | N/A        | Queue additional transfers                          | Configurable in Settings &gt; Transfers |

**UI Indicators:**

- When a device hits a limit, show a **temporary ban icon (⏳)** in the device list.
- Ban duration: **1 minute** after limit is hit.
- **Logging**: All rate-limited requests are logged locally for debugging.

#### **Security Features**

| **Feature**              | **Implementation**                                                          | **Threat Mitigated**    |
| ------------------------ | --------------------------------------------------------------------------- | ----------------------- |
| TLS 1.3 Encryption       | Ephemeral self-signed certs + TOFU.                                         | Eavesdropping           |
| Fingerprint Verification | SHA-256 hash of sender’s cert.                                              | MITM (first connection) |
| Nonce in Handshake       | Unique random value per transfer.                                           | Replay attacks          |
| Trust Revocation         | Users can revoke trust via **Settings &gt; Security &gt; Trusted Devices**. | Compromised devices     |

#### **Permissions**

| **Platform** | **Permission**                       | **Purpose**                        | **User Prompt**    |
| ------------ | ------------------------------------ | ---------------------------------- | ------------------ |
| iOS          | Local Network                        | UDP multicast discovery.           | On first launch.   |
| iOS          | Background Modes (Background Fetch)  | Background transfers.              | On first transfer. |
| Android      | INTERNET                             | Network access.                    | On install.        |
| Android      | FOREGROUND_SERVICE                   | Background transfers.              | On first transfer. |
| Android      | REQUEST_IGNORE_BATTERY_OPTIMIZATIONS | Prevent OS from killing transfers. | On first launch.   |
| Desktop      | Firewall Exception                   | Allow UDP/TCP ports.               | On first launch.   |

**Destination Folder:**

- Defaults to **system "Downloads"** folder.
- Configurable in **Settings &gt; Storage**.

---

### **3.4 Trust &amp; Security Management (MVP)**

**Trusted Devices List:**

- Users can **view/revoke** trusted devices in **Settings &gt; Security &gt; Trusted Devices**.
- Each entry shows:
  - Device alias.
  - Platform icon.
  - Cert fingerprint.
  - Last seen timestamp.
- **Revocation**: Removes device from trusted list; next connection requires re-trust.

**Security Indicators:**

- **TLS Status**: Padlock icon in transfer UI:
  - ✅ **Green**: Device is trusted (fingerprint matches).
  - ⚠️ **Yellow**: New device (requires trust).
  - ❌ **Red**: Fingerprint mismatch (potential MITM).
- **Fingerprint Verification**: Option to **compare fingerprints manually** (for high-security use cases).

**Threat Model:**

| **Threat**              | **Mitigated?** | **Notes**                                      |
| ----------------------- | -------------- | ---------------------------------------------- |
| Eavesdropping           | ✅ Yes         | TLS 1.3 encryption.                            |
| MITM (First Connection) | ✅ Yes         | TOFU + fingerprint verification.               |
| MITM (Subsequent)       | ❌ No          | TOFU assumes first connection was secure.      |
| Replay Attacks          | ✅ Yes         | Nonce in handshake.                            |
| Physical Device Access  | ❌ No          | Assumes device is trusted.                     |
| Malware on Same Device  | ❌ No          | Out of scope (local malware can access files). |

---

### **3.5 Network &amp; Platform Requirements**

#### **Supported Networks**

| **Network Type** | **Supported?** | **Notes**                                                  |
| ---------------- | -------------- | ---------------------------------------------------------- |
| Wi-Fi (2.4GHz)   | ✅ Yes         | Standard home/office Wi-Fi.                                |
| Wi-Fi (5GHz)     | ✅ Yes         | Higher speeds, shorter range.                              |
| Wi-Fi (6GHz)     | ✅ Yes         | Latest Wi-Fi 6E/7.                                         |
| Ethernet         | ✅ Yes         | Wired connections.                                         |
| Hotspot          | ✅ Yes         | Mobile-to-mobile (e.g., iPhone → Android).                 |
| VPN              | ❌ No          | P2P requires local network; VPN routes traffic externally. |
| Cellular Data    | ❌ No          | Not a local network.                                       |

#### **Platform-Specific Notes**

| **Platform** | **OS Version**    | **Requirements**                                                    | **Limitations**                                                                                                                                                                                               |
| ------------ | ----------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS          | 15+               | `LocalNetwork` + `Background Modes` permissions.                    | Background transfers **limited to \~30 minutes** (iOS restriction). **Graceful degradation**: After 30 minutes, show notification: _"Transfer paused – iOS background limits reached. Reopen app to resume."_ |
| Android      | 8.0+ (Oreo)       | `INTERNET` + `FOREGROUND_SERVICE` + battery optimization exclusion. | Foreground service **required for background transfers**.                                                                                                                                                     |
| macOS        | 10.15+ (Catalina) | Firewall exception auto-requested.                                  | Requires **admin password** for firewall changes.                                                                                                                                                             |
| Windows      | 10+               | Firewall exception auto-requested.                                  | May require **UAC prompt**.                                                                                                                                                                                   |
| Linux        | Any (glibc 2.28+) | Manual firewall configuration (if `ufw`/`firewalld` enabled).       | No auto-firewall exception (user must allow ports manually).                                                                                                                                                  |

---

### **3.6 Accessibility, Localization &amp; Offline-First UX**

#### **Accessibility**

PairSync adheres to **WCAG 2.1 AA** standards:

| **Requirement**       | **Implementation**                                                            | **Platform Notes**                                                                    |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Screen Reader Support | All UI elements have `aria-label` (web) or `accessible: true` (React Native). | iOS: VoiceOver; Android: TalkBack.                                                    |
| Keyboard Navigation   | Full Tab/Shift+Tab support.                                                   | Desktop only.                                                                         |
| Color Contrast        | Minimum **4.5:1** ratio for normal text.                                      | Tested with [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/). |
| Font Scaling          | Support up to **200%** system font size.                                      | Mobile: Dynamic Type; Desktop: System settings.                                       |
| Reduced Motion        | Respect `prefers-reduced-motion`.                                             | Disables animations if user prefers.                                                  |
| Focus Indicators      | Visible focus outlines for all interactive elements.                          | Customizable in settings.                                                             |

#### **Localization**

- **Supported Languages**: English (default) + **user's system locale** (e.g., Spanish, French, Arabic).
- **String Externalization**: All UI text stored in `locales/{lang}.json` files (e.g., `locales/en.json`, `locales/es.json`).
- **RTL Support**: Full right-to-left language support (Arabic, Hebrew, etc.).
- **Date/Time Formats**: Use **system locale** (e.g., `MM/DD/YYYY` vs. `DD/MM/YYYY`).
- **Number Formats**: Use **system locale** (e.g., `1,000.0` vs `1.000,0`).

#### **Offline-First Error Messaging**

Clear, actionable errors for all offline/network scenarios:

| **Scenario**             | **Error Message**                                                            | **Action Button**     | **Icon** |
| ------------------------ | ---------------------------------------------------------------------------- | --------------------- | -------- |
| No network connection    | _"No network connection. Transfers paused."_                                 | Retry                 | ⚠️       |
| Wi-Fi disabled           | _"Wi-Fi is off. Turn on Wi-Fi to use PairSync."_                             | Open Settings         | 📶       |
| Subnet mismatch          | _"Device not on the same network."_                                          | Refresh               | 🔄       |
| Firewall blocking        | _"Firewall may be blocking ports 53350-53360."_                              | Help                  | 🛡️       |
| Storage full             | _"Not enough space. Free up {X}MB."_                                         | Open Storage Settings | 💾       |
| Transfer timeout         | _"Transfer timed out. Retry?"_                                               | Retry / Cancel        | ⏱️       |
| Version mismatch (minor) | _"Device versions differ (1.0 vs 1.1). Transfer may have limited features."_ | Continue              | ℹ️       |
| Version mismatch (major) | _"Incompatible PairSync version. Update both devices."_                      | Check for Updates     | ❌       |

**Error Design Principles:**

- **Clear**: Use **plain language** (no technical jargon).
- **Actionable**: Always include **next steps** (e.g., "Turn on Wi-Fi").
- **Non-Blocking**: Show as **toasts/notifications** (not modal dialogs) where possible.
- **Persistent**: Errors requiring action (e.g., storage full) show as **banners** until resolved.
- **Accessible**: Error messages are **screen-reader friendly** and **high-contrast**.

---

### **3.7 Database &amp; Data Migration**

PairSync uses **SQLite** for local storage (trusted devices, transfer manifests). To ensure forward/backward compatibility:

#### **Schema Versioning**

- Each database includes a **`user_version`** field (SQLite PRAGMA) to track schema version.
- Current version: **`1`** (initial schema).
- Schema versions are **incremented** for any structural changes (e.g., new tables, columns).

#### **Migration Strategy**

| **Scenario**          | **Behavior**                                                                                                                              | **User Impact**                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Older version**     | On startup, run **automatic migrations** to update schema.                                                                                | None (transparent).                            |
| **Migration failure** | Reset to **default schema** + show warning: _"Database updated. Some settings may be reset."_                                             | Low (settings lost, but transfers unaffected). |
| **Downgrade**         | If app version is **older than database version**, show error: _"This app version is too old for the existing database. Update the app."_ | User must update.                              |

#### **Migration Example**

If v1.0 uses:

```sql
CREATE TABLE trusted_devices (id TEXT PRIMARY KEY, alias TEXT, fingerprint TEXT);
```

And v1.1 adds a `last_seen` column:

```sql
-- Migration 1 → 2
ALTER TABLE trusted_devices ADD COLUMN last_seen INTEGER;
```

The migration runs automatically on first launch of v1.1.

#### **Backup &amp; Recovery**

- **Automatic Backups**: Before each migration, create a **backup** of the database (`~/.pairsync/backups/db_v1.sqlite`).
- **Max Backups**: Keep last **3 backups** (rotated on new migrations).
- **Recovery**: If migration fails, restore from latest backup + show warning.

---

### **3.8 QR Pairing UX &amp; ECDH Handshake (v2.0)**

This section details the **user experience** and **technical implementation** of the QR code + ECDH handshake workflow.

#### **User Flows**

**Flow 1: Mobile → Mobile (Primary Use Case)**

1. **Device A (Sender):**

- User taps **"Receive Files"** or **"Send Files"**.
- App generates QR code and displays it full-screen.
- Screen shows: **Device alias**, **QR code**, **expiry timer** (5:00 → 0:00).
- **Share button**: Allows saving QR code as image for manual transfer.

2. **Device B (Receiver):**

- User taps **"Scan QR Code"** (or app auto-detects camera intent).
- Camera opens with **scanner overlay** and instructions:
  > _"Point camera at the QR code on the other device."_
- On successful scan:
  - Shows **device alias** from QR code.
  - Prompts: _"Connect to 'Swift Cheetah'?"_ \[Connect\] \[Cancel\].
  - If \[Connect\], performs ECDH handshake and establishes secure channel.

3. **Post-Connection:**

- Both devices show **"Connected!"** with a checkmark animation.
- **Long-term trust** is established (no QR needed for future transfers).
- User can now send/receive files normally.

**Flow 2: Desktop → Mobile (or vice versa)**

1. **Desktop (Sender):**

- No camera available.
- Displays QR code + **"Copy QR Code Text"** button.
- Copied text contains the same JSON payload as the QR code.

2. **Mobile (Receiver):**

- User taps **"Enter Code Manually"**.
- Paste the copied text into a text field.
- App parses JSON and proceeds with ECDH handshake.

**Flow 3: Desktop → Desktop**

1. **Device A:**

- Displays QR code + **"Copy QR Code Text"** button.

2. **Device B:**

- User pastes the copied text into a **"Pair with Device"** dialog.
- App proceeds with ECDH handshake.

#### **QR Code Payload Specification**

**Format:** UTF-8 JSON string, URL-safe base64 for binary fields.

**Schema:**

```json
{
  "version": "2.0",
  "device_id": "<UUIDv4, string>",
  "alias": "<string, max 64 chars>",
  "platform": "iOS" | "Android" | "macOS" | "Windows" | "Linux",
  "public_key": "<X25519 public key, base64url>",
  "fingerprint": "<SHA-256 of public key, hex, colon-separated>",
  "expiry": <Unix timestamp, +5 minutes from generation>
}
```

**Example:**

```json
{
  "version": "2.0",
  "device_id": "a1b2c3d4-5678-90ef-ghij-klmnopqrstuv",
  "alias": "Swift Cheetah",
  "platform": "iOS",
  "public_key": "BMjXD5Q3bJz1...",
  "fingerprint": "A1:B2:C3:D4:E5:F6:78:90...",
  "expiry": 1718467500000
}
```

**Encoding:**

- For QR code: **UTF-8 JSON string** (max \~500 chars).
- For manual entry: **Same JSON** (user copies/pastes).
- **Compression:** None (JSON is compact enough).

#### **ECDH Key Exchange**

**Algorithm:** X25519 (Curve25519).

**Key Derivation:**

1. **Shared Secret:**

```
 shared_secret = X25519(scalar_mult(private_key, peer_public_key))
```

2. **Session Keys:**

```
 // Use HKDF (RFC 5869) with SHA-256
 ikm = shared_secret
 salt = "PairSync-v2"
 info = "transfer-session"

 // Extract
 prk = HMAC-SHA256(salt, ikm)

 // Expand
 okm = HMAC-SHA256(prk, info || 0x01)
 encryption_key = okm[0..31]  // 256-bit AES key
 iv = okm[32..47]             // 128-bit IV for AES-GCM
```

3. **Encryption:**

- **Algorithm:** AES-256-GCM.
- **Nonce:** 12-byte (96-bit) for each message (incremental).
- **Authentication:** GCM tag (16 bytes).

#### **Long-Term Trust**

After initial QR pairing:

1. Both devices store:

- **Peer's long-term X25519 public key** (for future connections).
- **Device metadata** (alias, platform, last seen timestamp).
- **Trust status** (trusted/untrusted).

2. For **subsequent connections**:

- Use **ECDH with long-term keys** (no QR code needed).
- Perform **mutual authentication** via key exchange.
- Derive new **ephemeral session keys** for each transfer.

3. **Revocation:**

- Users can **revoke trust** via **Settings &gt; Security &gt; Trusted Devices**.
- Revoked devices **require QR code re-pairing**.

#### **Fallback to TLS + TOFU**

If QR code pairing is **not available** (e.g., no camera, user declines camera permission):

1. Show message:
   > _"QR code not available. Using standard connection method."_
2. Fall back to **TLS + TOFU** workflow (Section 3.3).
3. **No degradation** in security or functionality.

#### **Error Handling**

| **Scenario**             | **Error Message**                                   | **Recovery**                    |
| ------------------------ | --------------------------------------------------- | ------------------------------- |
| QR code expired          | _"QR code expired. Generate a new one."_            | Device A regenerates QR code.   |
| Invalid QR code          | _"Invalid QR code. Try again."_                     | User rescans or re-enters code. |
| Camera permission denied | _"Camera access required to scan QR code."_         | User grants camera permission.  |
| Manual entry failed      | _"Invalid code. Check for typos."_                  | User re-enters code carefully.  |
| ECDH handshake failed    | _"Connection failed. Retry or use manual pairing."_ | Fall back to TLS + TOFU.        |

#### **Accessibility**

- **QR Code Alternatives:**
  - **Copy as Text**: For devices without cameras.
  - **NFC Tap** (Future): For devices with NFC support.
- **Screen Reader Support:**
  - QR code screen: _"QR code for pairing. Expires in X minutes. Share button available."_
  - Scanner screen: _"Camera active. Point at QR code on other device."_
- **High Contrast Mode:**
  - QR code uses **black modules on white background** (WCAG 2.1 AA compliant).
  - Text instructions have **4.5:1 contrast ratio**.

---

## **4. Technical Architecture &amp; Tech Stack**

### **High-Level Architecture**

```
                  ┌─────────────────────────────────────────┐
                  │          PairSync Core (TypeScript)      │
                  │   (State, Discovery, Protocol, Transfer) │
                  └────────────────────────┬────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
   ┌─────────────────────────┐                   ┌─────────────────────────┐
   │      Mobile Target      │                   │     Desktop Target      │
   │   React Native + Expo   │                   │     Tauri + React       │
   └─────────────────────────┘                   └─────────────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
   ┌─────────────────────────┐                   ┌─────────────────────────┐
   │   Native UDP/mDNS       │                   │   Rust UDP/mDNS Bridge  │
   │   (react-native-udp,     │                   │   (Tauri plugins)        │
   │    react-native-mdns)    │                   └─────────────────────────┘
   └─────────────────────────┘
```

### **Tech Stack**

| **Layer**                  | **Technology**                                                            | **Purpose**                                                                          |
| -------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Shared Logic**           | TypeScript (Strict Mode), Monorepo (TurboRepo)                            | Core state machines, discovery, transfer protocols.                                  |
| **Mobile Frontend**        | React Native (Expo) + NativeWind (Tailwind for RN)                        | Native iOS/Android UI.                                                               |
| **Desktop Frontend**       | Tauri (Rust) + React + Vite + TypeScript + Tailwind CSS                   | Lightweight desktop UI (&lt;25MB binary).                                            |
| **Networking (Mobile)**    | `react-native-udp`, `react-native-mdns`, `expo-file-system`               | UDP multicast, mDNS, chunked file I/O.                                               |
| **Networking (Desktop)**   | Tauri Rust plugins (`dgram`, `mdns`, `tls`)                               | UDP multicast, mDNS, TLS, file streams.                                              |
| **State Management**       | XState (for complex workflows) + Zustand (for simple state)               | Device states: `IDLE` → `SCANNING` → `CONNECTING` → `SENDING`/`RECEIVING` → `ERROR`. |
| **Styling**                | Tailwind CSS (shared config via `tailwind.config.js`)                     | Consistent UI across mobile/desktop.                                                 |
| **Storage**                | SQLite (via `expo-sqlite` / `rusqlite`)                                   | Transfer manifests, trusted devices.                                                 |
| **Cryptography (Mobile)**  | `expo-crypto` (X25519, SHA-256, HKDF, AES-256-GCM)                        | ECDH key exchange, hashing, encryption.                                              |
| **Cryptography (Desktop)** | `x25519-dalek` (Rust), `ring` (Rust), `tauri-plugin-crypto`               | ECDH key exchange, hashing, encryption.                                              |
| **QR Code (Mobile)**       | `react-native-qrcode-svg` (generate), `react-native-vision-camera` (scan) | QR code generation and scanning.                                                     |
| **QR Code (Desktop)**      | `qrcode` (Node), `zbar` (Rust via Tauri plugin)                           | QR code generation and scanning.                                                     |

---

## **5. Technical Breakdown &amp; Implementation Plan**

### **Phase 1: Workspace &amp; State Setup (Week 1)**

| **Task** | **Description**                                                                 | **Owner** | **Success Criteria**                    |
| -------- | ------------------------------------------------------------------------------- | --------- | --------------------------------------- |
| 1.1      | Set up monorepo with TurboRepo: `packages/core`, `apps/mobile`, `apps/desktop`. | DevOps    | `turbo run dev` works for all targets.  |
| 1.2      | Build core state machine (XState) for device states (`IDLE`, `SCANNING`, etc.). | Core Team | State transitions tested.               |
| 1.3      | Implement shared Tailwind config + responsive UI cards for device grids.        | UI Team   | Mobile/desktop UIs render consistently. |

### **Phase 2: UDP Multicast + mDNS Discovery (Weeks 2–3)**

| **Task** | **Description**                                                             | **Owner**    | **Success Criteria**                                        |
| -------- | --------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------- |
| 2.1      | Implement native UDP socket bridging for React Native (`react-native-udp`). | Mobile Team  | Devices discover each other on same subnet.                 |
| 2.2      | Implement Rust UDP/mDNS bridge for Tauri (using `mdns` + `dgram` crates).   | Desktop Team | Devices discover each other on same subnet.                 |
| 2.3      | Add mDNS support (`_pairsync._tcp.local`) for cross-subnet discovery.       | Core Team    | Devices discover each other across subnets (with repeater). |
| 2.4      | Implement heartbeat protocol (JSON payload every 5s, timeout after 25s).    | Core Team    | Devices appear/disappear correctly in UI.                   |
| 2.5      | Add manual IP entry fallback.                                               | Core Team    | Manual connections work when auto-discovery fails.          |

### **Phase 3: TLS Handshake &amp; Chunked File Streaming (Weeks 4–5)**

| **Task** | **Description**                                                                             | **Owner** | **Success Criteria**                                               |
| -------- | ------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------ |
| 3.1      | Generate ephemeral self-signed TLS certs (30-day validity) on app launch.                   | Core Team | Certs generated and stored securely.                               |
| 3.2      | Implement TOFU trust model with fingerprint storage (keychain/encrypted file).              | Core Team | First connection prompts trust; subsequent connections auto-trust. |
| 3.3      | Build `/api/pairsync/v1/prepare` endpoint for metadata handshake (file name, size, hashes). | Core Team | Sender/receiver exchange metadata successfully.                    |
| 3.4      | Implement chunked HTTP upload/download (4MB chunks, disk buffering).                        | Core Team | Transfers use ≤50MB RAM on mobile, ≤200MB on desktop.              |
| 3.5      | Add resume support (manifest with chunk bitmap).                                            | Core Team | Interrupted transfers resume from last chunk.                      |
| 3.6      | Implement progress tracking (speed, %, ETA).                                                | UI Team   | Progress bars update in real-time.                                 |

### **Phase 4: QR Pairing + ECDH Handshake (Weeks 6–7)**

**New for v2.0**: Implement secure QR code + ECDH handshake as primary trust method.

| **Task** | **Description**                                                                                | **Owner**            | **Success Criteria**                                            |
| -------- | ---------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------- |
| 4.1      | Implement **X25519 key generation** in shared core (`packages/core/crypto`).                   | Core Team            | Keys generated and serialized correctly.                        |
| 4.2      | Add **QR code generation** (Mobile: `react-native-qrcode-svg`, Desktop: `qrcode`).             | UI Team              | QR codes display device info + public key.                      |
| 4.3      | Add **QR code scanning** (Mobile: `react-native-vision-camera`, Desktop: Tauri `zbar` plugin). | Mobile/Desktop Teams | Scans QR codes and parses payload.                              |
| 4.4      | Implement **ECDH key exchange + HKDF** for session key derivation.                             | Core Team            | Shared secrets derived correctly; AES-256-GCM encryption works. |
| 4.5      | Add **long-term trust storage** for ECDH public keys.                                          | Core Team            | Trusted devices persist across app restarts.                    |
| 4.6      | Implement **fallback to TLS + TOFU** when QR is unavailable.                                   | Core Team            | Seamless fallback with no UX degradation.                       |
| 4.7      | Add **QR pairing UX** (camera overlay, expiry timer, manual entry fallback).                   | UI Team              | UX matches Section 3.8 specifications.                          |
| 4.8      | **E2E Test**: Verify QR pairing across all platform combinations.                              | QA Team              | All QR pairing tests pass.                                      |

### **Phase 5: Background Transfers, Security UI &amp; Release (Week 8)**

| **Task** | **Description**                                                                        | **Owner**   | **Success Criteria**                                   |
| -------- | -------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------ |
| 5.1      | **iOS**: Implement `BackgroundTasks` + `BGTaskScheduler` for background transfers.     | Mobile Team | Transfers continue when app is backgrounded.           |
| 5.2      | **Android**: Implement Foreground Service with persistent notification.                | Mobile Team | Transfers continue with notification; user can cancel. |
| 5.3      | **Both**: Auto-resume transfers on network reconnect.                                  | Core Team   | Transfers resume after Wi-Fi drop.                     |
| 5.4      | Add **Trusted Devices** UI (list, revoke trust) for both TLS and ECDH trust.           | UI Team     | Users can view/revoke trusted devices.                 |
| 5.5      | Add **Security Indicators** (TLS/ECDH status).                                         | UI Team     | Users see trust status in transfer UI.                 |
| 5.6      | Final E2E QA: Test all cross-platform combinations (Windows→Android, macOS→iOS, etc.). | QA Team     | All test cases pass.                                   |

---

## **6. Key Performance Indicators (KPIs) &amp; Non-Functional Benchmarks**

### **Performance Metrics**

| **Category**             | **Target**                             | **Verification Method**                | **Notes**                                          |
| ------------------------ | -------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| **Discovery Latency**    | &lt;2s                                 | Integration logging tests              | Accounts for slower networks/devices.              |
| **Transfer Efficiency**  | ≥80% of local bandwidth                | Throughput logs vs. iPerf              | TLS + TCP overhead reduces theoretical max.        |
| **RAM Usage (Idle)**     | &lt;50MB (Desktop), &lt;40MB (Mobile)  | OS profiler (Instruments/Task Manager) | Background service adds \~10MB.                    |
| **RAM Usage (Transfer)** | &lt;100MB (Desktop), &lt;80MB (Mobile) | OS profiler                            | Chunk buffering + TLS overhead.                    |
| **Binary Size**          | &lt;25MB (Desktop), &lt;30MB (Mobile)  | Build artifact auditing                | React Native + Expo realistically needs \~25–30MB. |

### **Reliability Metrics**

| **Category**                     | **Target** | **Verification Method**                     |
| -------------------------------- | ---------- | ------------------------------------------- |
| **Transfer Success Rate**        | ≥99.9%     | E2E test suite (1000 transfers)             |
| **Resume Success Rate**          | 100%       | Simulate network drops during transfer.     |
| **Background Transfer Survival** | ≥90%       | Test app switching/locking during transfer. |

### **Security Metrics**

| **Category**                     | **Target** | **Verification Method**                  |
| -------------------------------- | ---------- | ---------------------------------------- |
| **MITM Block Rate**              | 100%       | Penetration testing (TOFU validation).   |
| **Unauthorized Access Attempts** | 0          | Log and alert on fingerprint mismatches. |

---

## **7. Open Questions &amp; Assumptions**

### **Assumptions**

1. **Network Conditions**: Users are on a **local network with multicast/mDNS support** (90% of home/office networks).
2. **Device Capabilities**: Devices have **≥2GB RAM** and **≥100MB free storage** for the app.
3. **User Behavior**: Users will **not switch networks mid-transfer** (e.g., Wi-Fi → cellular).

### **Open Questions**

| **Question**                                                                   | **Impact** | **Resolution Plan**                                                 | **Status**                    |
| ------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------- | ----------------------------- |
| How will we handle **enterprise networks** with strict firewall rules?         | High       | Document manual IP + port configuration + QR code.                  | ✅ **Resolved** (Section 3.1) |
| Can we reduce **mobile binary size** below 30MB?                               | Medium     | Relaxed target to **&lt;30MB** (realistic for React Native + Expo). | ✅ **Resolved** (Section 6)   |
| How will we **rate-limit** Quick Save transfers to prevent abuse?              | Medium     | Added per-device throttling (10 transfers/minute, 1GB/hour).        | ✅ **Resolved** (Section 3.3) |
| How will we handle **interface selection** for devices with multiple adapters? | High       | Added IP priority rules + excluded interfaces (VPN, loopback).      | ✅ **Resolved** (Section 3.1) |
| How will we explain **cert regeneration** to users?                            | Medium     | Enhanced re-trust prompt with expiry explanation.                   | ✅ **Resolved** (Section 3.3) |
| How will we handle **partial failures** (disk full, permissions, etc.)?        | High       | Added graceful handling for all mid-transfer failures.              | ✅ **Resolved** (Section 3.2) |
| How will we handle **large folder trees**?                                     | High       | Added batched manifests + user warnings.                            | ✅ **Resolved** (Section 3.2) |
| How will we handle **iOS background limits**?                                  | High       | Added graceful degradation notification.                            | ✅ **Resolved** (Section 3.5) |
| How will we handle **database migrations**?                                    | High       | Added schema versioning + automatic migrations.                     | ✅ **Resolved** (Section 3.7) |

### **New Open Questions**

| **Question**                                                              | **Impact** | **Resolution Plan**                                |
| ------------------------------------------------------------------------- | ---------- | -------------------------------------------------- |
| Should we support **Tauri for mobile** to reduce binary size further?     | Low        | Experimental; requires additional R&amp;D.         |
| Should we add **end-to-end encryption** (beyond TLS) for paranoid users?  | Low        | Would require pre-shared keys; breaks Zero Config. |
| Should we add **compression** for large files to improve transfer speeds? | Low        | Would add CPU overhead; test with LZ4/zstd.        |

---

## **8. Appendix**

### **Glossary**

| **Term**             | **Definition**                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| **TOFU**             | Trust On First Use: A security model where a device is trusted after the first verified connection. |
| **mDNS**             | Multicast DNS: A protocol for service discovery on local networks (e.g., Bonjour, Avahi).           |
| **TLS**              | Transport Layer Security: A protocol for encrypting network communications.                         |
| **Chunked Transfer** | A method of breaking files into smaller pieces for streaming and resume support.                    |

### **References**

- [RFC 6762 (mDNS)](https://datatracker.ietf.org/doc/html/rfc6762)
- [TLS 1.3 Specification](https://datatracker.ietf.org/doc/html/rfc8446)
- [React Native UDP](https://github.com/pebble/react-native-udp)
- [Tauri Plugins](https://v2.tauri.app/en/next/plugins/)

---

**Document Approval:**

- **Product Owner**: Michael Obasi ✅ **Approved**
- **Engineering Lead**: \[TBD\] ⏳
- **QA Lead**: \[TBD\] ⏳

**Related Documents:**

- **Protocol Specification**: [PairSync Protocol Specification v2.0](pairsync-protocol-spec) ✅ **Approved**

**🔒 MVP LOCKED**

- All critical gaps resolved.
- v2.0 handshake (QR + ECDH) approved.
- Speed optimizations deferred to post-MVP.

**Change Log (v3.0):**

- **Handshake Upgrade**: Added **QR Code + ECDH workflow** as primary trust method (Section 3.3, 3.8).
- Added **wire format** for `/api/pairsync/v1/prepare` and chunked transfers (Section 3.2).
- Added **multiple network interfaces** handling with IP selection rules + **excluded interfaces** (VPN, loopback) (Section 3.1).
- Added **clipboard rich-content** edge cases and fallback behavior (Section 3.2).
- Added **cert regeneration** behavior for 30-day expiry + **enhanced re-trust prompt** (Section 3.3).
- Added **Quick Save rate-limiting** (10 transfers/minute, 1GB/hour) (Section 3.3).
- Added **Section 3.6**: Accessibility, localization, and offline-first error messaging.
- Added **protocol versioning** with graceful degradation (Section 3.2).
- Added **partial failure modes** handling (disk full, permissions, force-quit) (Section 3.2).
- Added **large folder trees** support with batched manifests (Section 3.2).
- Added **concurrent transfer + resume interaction** rules (Section 3.2).
- Added **iOS background graceful degradation** messaging (Section 3.5).
- Added **Section 3.7**: Database schema versioning and migration strategy.
- Added **Section 3.8**: QR Pairing UX &amp; ECDH Handshake details.
- Updated **Tech Stack** with cryptography and QR code libraries (Section 4).
- Updated **Implementation Plan** with Phase 4 (QR + ECDH) and Phase 5 (Section 5).
- Resolved all **open questions** from v2.0, v2.1, and v2.2 (Section 7).
