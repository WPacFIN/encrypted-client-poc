# PWA Encryption Demo

## Project Overview

This project is a reference implementation demonstrating a robust architecture for encrypting data at rest in an offline-first Progressive Web App (PWA). It provides a secure, multi-user environment where data can be encrypted on the client, stored locally in IndexedDB, and accessed securely even when the device is disconnected from the network for extended periods.

The core features include:

- **Online User Authentication:** A standard username/password login against a simple backend server.
- **Offline PIN Provisioning:** After logging in, a user can "provision" a device by creating a PIN. This allows them to access their data offline without re-entering their password.
- **Multi-User Offline Access:** The application intelligently detects its online/offline status. When offline, it presents a list of all users who have provisioned the device, allowing any of them to unlock their specific data using their PIN.
- **Secure Data Encryption:** All user-generated data is encrypted at rest in the browser's IndexedDB using strong cryptographic principles.
- **Session Management:** Provides a secure lock/unlock cycle for data access, ensuring the decryption key only exists in memory during an active session.

## Final Architecture: The Split Token / IndexedDB Model

This project implements a **dual-key encryption model** where all cryptographic material needed for offline access is stored directly and reliably in IndexedDB.

This architecture was chosen after initial research and prototyping revealed that an alternative approach using `HttpOnly` cookies and Service Worker `fetch` interception, while theoretically sound, proved unreliable across different browser behaviors and introduced significant implementation complexity. The current model is more robust, easier to debug, and standard for offline-first applications.

### Architectural Flow

1.  **Key Derivation (The "Master Key"):**

    - When a user sets their PIN, it is combined with a unique, randomly generated **salt**.
    - These two pieces are fed into the **PBKDF2** algorithm, a slow, computationally intensive function.
    - The output is a strong 256-bit **Master Key (MK)**. This key exists only in memory for a few moments and is never stored. Its sole purpose is to encrypt the actual data key.

2.  **Key Generation & Wrapping (The "Data Encryption Key"):**

    - During provisioning, the client generates a separate, cryptographically strong 256-bit **Data Encryption Key (DEK)** using the Web Crypto API.
    - This DEK is then immediately encrypted ("wrapped") using the in-memory Master Key. The result is the `wrappedDek`.
    - The original, plaintext DEK is discarded from memory.

3.  **Secure Offline Storage (The "Split Tokens"):**

    - The two non-secret pieces of data required for offline unlock are stored in a `users` table in IndexedDB, keyed by the username:
      - The unique `salt`.
      - The `wrappedDek`.
    - This is the "split token" model: the PIN is the secret the user holds, and the necessary data to use that secret is stored locally. Neither part is useful without the other.

4.  **Offline Unlock Cycle:**
    - When an offline user selects their profile and enters their PIN, the application retrieves their specific `salt` and `wrappedDek` from IndexedDB.
    - It re-derives the Master Key in memory using the entered PIN and the retrieved `salt`.
    - It uses the Master Key to decrypt (unwrap) the `wrappedDek`, restoring the Data Encryption Key (DEK) into memory for the current session.
    - When the user clicks "Lock Session" or closes the tab, the in-memory DEK is erased, and the data is once again secure at rest.

### Security Considerations

- **Primary Risk:** The security of this model against a dedicated offline attacker hinges on the strength of the user's PIN. A weak PIN can be brute-forced, although PBKDF2 makes this extremely slow.
- **XSS Vulnerability:** While this model is simpler, it shares a risk with the previous architecture: if the application has a Cross-Site Scripting (XSS) vulnerability, an attacker could potentially access the `cryptoService` and `sessionManager` to decrypt data _after_ a legitimate user has unlocked their session. The primary defense against this remains a secure application with no XSS vulnerabilities.

## How to Run

### 1. Project Structure

Ensure your project is set up with the following directory structure:

```
.
├── public/
│   ├── index.html
│   ├── client.js
│   ├── crypto-service.js
│   ├── db-service.js
│   ├── session-manager.js
│   ├── api-client.js
│   └── service-worker.js
├── users.json
├── server.js
└── package.json
```

### 2. Install Dependencies

You need to have Node.js and npm installed. Open a terminal in the project's root directory and run:

```bash
npm install
```

### 3. Start the Server

Run the following command in your terminal:

```bash
node server.js
```

### 4. Open the Application

Open your web browser and navigate to:

**http://localhost:3000**
