# Architecting a Secure, Offline-First Encryption System for Progressive Web Applications

## Section 1: Foundational Principles and Threat Modeling for Offline PWAs

This section establishes the security landscape for the Progressive Web App (PWA), grounding the subsequent architectural decisions in a clear understanding of the risks and the capabilities of the chosen technologies. A robust security posture begins with acknowledging the inherent challenges of the client environment and selecting the appropriate tools to mitigate them.

### 1.1 The Offline-First Paradigm and PWA Storage

The user requirement for an application that remains functional for weeks without network connectivity places it firmly in the "offline-first" architectural paradigm.[1, 2] Progressive Web Apps are exceptionally well-suited for this model, offering a native-like experience with robust mechanisms for offline operation and background processing.[3, 4] The core technologies that enable this are Service Workers, which act as a programmable network proxy to handle offline requests and background tasks, and a suite of client-side storage APIs for persisting application data and assets.[5, 6]

For storing structured application data, **IndexedDB** is the unequivocally correct choice and the industry standard.[7, 8] Its advantages over alternatives are significant and directly address the needs of a complex, data-driven offline application:

- **Asynchronous API:** IndexedDB operations are asynchronous and non-blocking, ensuring that complex database queries do not freeze the main user interface thread, a critical factor for maintaining a responsive user experience.[7, 9] This stands in stark contrast to the synchronous nature of `localStorage`, which can introduce performance bottlenecks.[10]
- **Storage Capacity and Data Types:** It is designed to store significant amounts of structured data, including complex JavaScript objects and binary data (blobs), making it ideal for persisting encrypted data payloads.[7, 10]
- **Service Worker Accessibility:** Unlike Web Storage (`localStorage` and `sessionStorage`), IndexedDB is fully accessible from within a Service Worker context, allowing for background data synchronization and management even when the main application tab is closed.[8, 10]

Other storage mechanisms like WebSQL and Application Cache are deprecated and must be avoided in modern web development.[7] While the IndexedDB API can be verbose, helper libraries such as `idb` can provide a more developer-friendly, promise-based wrapper without altering the underlying security model.[3, 8, 10]

### 1.2 The Untrusted Client Threat Model

The foundational principle of all web security, which becomes paramount in an offline-first PWA, is to **never trust the client**.[11, 12] The client environment—the user's browser and device—is outside the developer's control and must be considered insecure. Any data stored or code executed on the client can be inspected, manipulated, or exfiltrated by a determined adversary. This reality necessitates a defense-in-depth strategy where security controls do not rely on the client's integrity.

The specific threats to data stored within an offline PWA include:

- **Physical Access and Direct Inspection:** An attacker with physical access to a user's unlocked device can use standard browser developer tools to inspect the contents of IndexedDB. By default, IndexedDB stores data in plaintext, making it trivial to read and copy.[13, 14] Forensic analysis can also recover this data from the device's storage, even from private browsing sessions in some cases.[15]
- **Malware and Infostealers:** Malicious software running on the user's operating system can be designed to target and exfiltrate browser storage files directly from the disk. This bypasses the browser's security model entirely, making plaintext storage a significant liability.[16]
- **User Manipulation and Cheating:** In some application contexts, the user themselves may be the adversary. A technically savvy user could attempt to locate their data in IndexedDB, modify it (e.g., change a game score or unlock a feature), and potentially re-encrypt it if the key is accessible, undermining the application's integrity.[17]
- **Cross-Site Scripting (XSS):** Should the application have an XSS vulnerability, an attacker can inject and execute arbitrary JavaScript in the context of the application's origin. This gives the attacker's script access to the same APIs as the legitimate application, including the ability to read from IndexedDB and interact with the Web Crypto API to decrypt data or misuse keys.[18, 19, 20]

The convergence of these threats makes it clear that storing sensitive data in plaintext on the client is not a viable option. The architectural challenge is not merely about enabling offline access but about securing data in an environment that is, by its very nature, untrustworthy. This leads to a "chicken-and-egg" problem: to encrypt the data, a key is needed, but where can that key be stored securely on an untrusted client?.[21] The solution lies not in finding a perfectly secure storage location, but in designing a key management architecture that does not require the key to be persistently stored in an accessible state.

### 1.3 Defining the Security Goal: Encryption at Rest

The primary security objective of this architecture is to ensure **encryption at rest**. This means that all sensitive application data is cryptographically unreadable while it is persisted in IndexedDB on the user's device. This directly mitigates the risks of physical device theft, malware, and casual data inspection.

It is critical to distinguish this goal from Digital Rights Management (DRM). This architecture is not designed to prevent a legitimate, authenticated user from viewing their own data once it has been decrypted for use within the application.[17] The focus is on protecting the data from unauthorized third-party access. When the user provides the correct secret (their PIN), the data is decrypted into memory for the application to function; at this point, it is considered "live" and is no longer at rest.

The **Web Crypto API** is the cornerstone of this solution. It is a low-level, native browser API that provides the essential cryptographic primitives required for building a secure system without relying on third-party libraries for the core operations.[17] It is the standard and recommended tool for implementing robust, client-side encryption in modern web applications.[8, 22]

## Section 2: The Cryptographic Core: A Dual-Key (KEM/DEM) Architecture

To meet the complex requirements of PIN-based access, long-term offline sessions, and a secure refresh mechanism, a simple, single-key encryption model is insufficient. This architecture employs a **dual-key model**, a standard cryptographic pattern analogous to a Key Encapsulation Mechanism / Data Encapsulation Mechanism (KEM/DEM). In this model, a high-entropy **Data Encryption Key (DEK)** is used for efficient bulk encryption of data, while a **Master Key (MK)**, derived from the user's PIN, is used solely to encrypt, or "wrap," the DEK. This decoupling is the critical architectural decision that enables both robust security and the required key rotation functionality.

### 2.1 The Master Key (MK): Deriving Strength from a Low-Entropy PIN

A user-provided PIN is a low-entropy secret, meaning it has limited randomness and is vulnerable to guessing and brute-force attacks if used directly.[23] It is fundamentally unsuitable for direct use as a cryptographic key. The solution is to use a **Password-Based Key Derivation Function (PBKDF2)** to "stretch" this weak secret into a strong, 256-bit key.

PBKDF2, available through the `SubtleCrypto.deriveKey` method of the Web Crypto API, is designed to be computationally intensive, making offline brute-force attacks against the derived key prohibitively slow and expensive.[24, 25] A correct implementation requires careful selection of its parameters:

- **Password:** The user's PIN, encoded into a `Uint8Array` using a `TextEncoder`.[26]
- **Salt:** A cryptographically random, unique, 16-byte (128-bit) value must be generated for each user when they set their PIN.[26, 27] The salt is not a secret; its purpose is to prevent attackers from using precomputed rainbow tables to crack multiple users' PINs simultaneously. The salt **must** be stored in plaintext alongside the encrypted data and retrieved before key derivation.[28, 29]
- **Iterations:** This parameter defines the work factor. A higher number of iterations makes the derivation process slower for both the user and a potential attacker. A high value is critical for security. Following NIST recommendations, a minimum of **600,000 iterations** is advised, with the understanding that this may introduce a brief, one-time delay in the UI when the key is first derived.[29]
- **Hash Algorithm:** **SHA-256** is the secure and universally supported hashing algorithm for use within PBKDF2.[26, 30]
- **Derived Key Algorithm:** The resulting Master Key will be a `CryptoKey` object configured for `AES-GCM`, but its usage permissions will be strictly limited to `wrapKey` and `unwrapKey`. It will only be used to encrypt and decrypt the DEK.

### 2.2 The Data Encryption Key (DEK): The Offline "Session Token"

The DEK is the workhorse of this encryption system. It is a separate, cryptographically strong 256-bit key responsible for the actual encryption and decryption of every piece of data stored in IndexedDB. This key is the concrete implementation of the user's "offline refresh token" concept. Using a DEK provides two major advantages over using the MK for everything:

1.  **Performance:** Deriving the MK from the PIN via PBKDF2 is slow by design. Performing this operation for every database read/write would be untenably slow. Instead, it is done only once per session to unlock the much faster DEK.
2.  **Key Rotation:** The DEK can be periodically replaced (rotated) without requiring the user to change their PIN or re-encrypting the entire database with a new MK. This is the foundation of the offline session renewal mechanism.

The DEK will be generated on the server using a cryptographically secure random number generator and provided to the client during the initial provisioning and subsequent renewals.

The chosen algorithm for data encryption is **AES-GCM (Galois/Counter Mode)**. It is the recommended symmetric encryption algorithm within the Web Crypto API for its strong security, high performance, and, most importantly, its nature as an Authenticated Encryption with Associated Data (AEAD) cipher.[31, 32] This means it provides both confidentiality (encryption) and integrity/authenticity (protection against tampering).

A correct implementation of AES-GCM using `SubtleCrypto.encrypt` and `SubtleCrypto.decrypt` requires the following:

- **Key:** The 256-bit DEK held in memory.
- **Initialization Vector (IV):** A unique, 12-byte (96-bit) random value **must be generated for every single encryption operation**.[29, 31, 32] The IV does not need to be secret and should be prepended to the ciphertext before storage. Reusing an IV with the same key is a critical vulnerability that can break the encryption entirely.[31]
- **Tag Length:** The default and recommended authentication tag length of 128 bits will be used.[29, 31] This tag is automatically generated during encryption and verified during decryption. If the ciphertext has been altered in any way, the tag will not match, and the decryption operation will fail, preventing the application from processing tampered data.[29, 31]

### 2.3 PIN Security Policies: Mitigating Offline Brute-Force Attacks

While PBKDF2 makes offline brute-force attacks difficult, its effectiveness is still tied to the entropy of the user's PIN. Therefore, enforcing strong PIN policies is a crucial layer of defense. These policies adapt the OWASP Authentication Cheat Sheet recommendations for passwords to a PIN-based system.[33]

- **Minimum Length:** A minimum PIN length of at least 6, and preferably 8, digits should be enforced to increase the search space for an attacker.
- **Complexity and Composition:** Avoid overly complex rules. For a numeric PIN, the primary strength comes from its length. For alphanumeric PINs, no specific composition rules (e.g., must contain a number) should be required, as they often reduce usability without significantly improving security.[33]
- **Blocking Common PINs:** The application should maintain and enforce a blocklist of common and easily guessable PINs (e.g., "123456", "111111", "000000", keyboard patterns) to prevent users from choosing weak credentials.[33]
- **UI-Based Rate Limiting:** While an attacker with the encrypted data can perform unlimited offline attacks, the application's own UI should be protected. After a small number of incorrect PIN entries (e.g., 3-5), the application should lock the user out for an exponentially increasing period. This mitigates simple guessing attacks through the legitimate interface.
- **User Education:** The UI should clearly state that the PIN protects sensitive local data and should be memorable but not easily guessable.

## Section 3: System Architecture: End-to-End Encryption and Session Flows

This section presents the complete, stateful architecture, detailing the interactions between the user, the PWA client, and the server across the lifecycle of an offline session. The design transforms the user's abstract requirements into a concrete, secure, and robust set of operational flows.

### 3.1 Actors and Components

- **User:** The individual interacting with the application. Provides standard login credentials (e.g., username/password) for online authentication and a PIN for offline data access.
- **PWA Client:** The JavaScript application code running in the user's browser. This component is responsible for the user interface, all client-side cryptographic operations via the Web Crypto API, local data management in IndexedDB, and communication with the Service Worker and backend server.
- **Backend Server:** The trusted, server-side component of the application. It is responsible for primary user authentication, managing user accounts, and acting as a key generation and distribution authority for the Data Encryption Key (DEK).
- **Service Worker:** A script that runs in the background, separate from the main web page. In this architecture, it acts as a network proxy and, critically, as a secure conduit for reading the `HttpOnly` cookie containing the wrapped DEK.

### 3.2 Flow 1: Initial Online Provisioning and PIN Setup

This one-time flow occurs when a user first enables offline access for their account. It establishes the cryptographic foundation for all future offline operations.

1.  **Online Authentication:** The user performs a standard, secure login to the backend server using a robust authentication method (e.g., federated login via OAuth 2.0, or a password-based flow over HTTPS).[34, 35] This establishes a trusted and authenticated server session.
2.  **PIN Creation:** The PWA prompts the user to create a new PIN for offline access. The UI enforces the security policies defined in Section 2.3 (minimum length, complexity, etc.).
3.  **Salt Generation:** The PWA client uses `window.crypto.getRandomValues()` to generate a unique, 16-byte cryptographic salt.
4.  **DEK Request:** The client sends the newly generated salt to a secure, authenticated endpoint on the backend server (e.g., `/provision-offline-access`).
5.  **DEK Generation and Issuance:** The server receives the salt, validates the user's session, and generates a new, cryptographically random 32-byte (256-bit) Data Encryption Key (DEK) and an expiry timestamp (e.g., 30 days in the future). It returns the DEK and its `expiryTimestamp` to the client.
6.  **Master Key Derivation:** In the client, the PWA derives the 256-bit Master Key (MK) from the user's entered PIN and the generated salt using the PBKDF2 function. This MK exists only in memory.
7.  **DEK Wrapping (Encryption):** The client uses the in-memory MK to encrypt the DEK using AES-GCM. The resulting ciphertext is the `wrappedDEK`. Immediately after this operation, the MK is discarded from memory.
8.  **Secure Storage:** The client now stores the necessary components for offline access. The `salt` and `expiryTimestamp` are stored in a dedicated object store in IndexedDB. The `wrappedDEK` is stored securely using the `HttpOnly` cookie method detailed in Section 4.
9.  **Provisioning Complete:** The user is notified that their device is set up for offline access.

### 3.3 Flow 2: Offline Data Access (Session Unlock)

This flow occurs every time the user opens the PWA while offline and needs to access their encrypted data.

1.  **PWA Launch and State Check:** The user opens the PWA. The application checks for the presence of the offline provisioning data (the salt in IndexedDB and the `HttpOnly` cookie). If found, it knows the device is provisioned for offline use and the data is encrypted.
2.  **PIN Prompt:** The UI presents a "lock screen," prompting the user to enter their PIN to unlock their local data.
3.  **Retrieve Stored Components:** The PWA reads the `salt` from IndexedDB. It then initiates the process to read the `wrappedDEK` from the `HttpOnly` cookie via the Service Worker (see Section 4.2).
4.  **Master Key Derivation:** Once the PIN is entered, the PWA derives the MK in memory using the entered PIN and the retrieved `salt`.
5.  **DEK Unwrapping (Decryption):** The PWA uses the in-memory MK to attempt to decrypt the `wrappedDEK`.
    - **Success:** If the PIN was correct, the AES-GCM authentication tag will validate, and the decryption will succeed. The original DEK is recovered and stored in a private variable within a closure, making it available for the application session but not globally accessible. The MK is immediately discarded from memory. The UI is unlocked, granting the user access to their data.
    - **Failure:** If the PIN was incorrect, the decryption will fail. The UI will display a generic "Invalid PIN" error message to prevent account enumeration attacks and will increment a failure counter to implement UI-based rate limiting.[33]
6.  **Data Operations:** For the remainder of the session, whenever the application needs to read from or write to IndexedDB, it uses the in-memory DEK. For every write operation, it generates a new, random 12-byte IV, prepends it to the encrypted data, and stores the combined blob. For every read, it extracts the IV, then uses the DEK and IV to decrypt the data.

### 3.4 Flow 3: Offline Session Expiry and Renewal (Key Rotation)

This flow implements the "refresh token" functionality by treating the DEK's lifetime as the offline session's lifetime. This is a direct application of time-based key rotation principles to enhance security.[36, 37]

1.  **Expiry Check:** During the "Session Unlock" flow (Flow 2), after successfully decrypting the DEK, the PWA compares the stored `expiryTimestamp` with the current time.
2.  **Handling Expiration:**
    - **Session Valid:** If the session has not expired, the application proceeds as normal.
    - **Session Expired:** If the `expiryTimestamp` is in the past, the application informs the user that their secure offline session has expired. It can enter a "graceful degradation" mode where existing (decrypted) data might be viewable, but all write operations and access to further encrypted data are blocked. The user is instructed that they must go online to renew their session.
3.  **Renewal Process (Online):**
    a. The user connects their device to the internet.
    b. The PWA prompts the user to re-enter their PIN to initiate the renewal.
    c. The PWA uses its primary online authentication credential (e.g., a long-lived, secure `HttpOnly` session cookie from the initial login) to make an authenticated request to a dedicated server endpoint (e.g., `/renew-offline-session`). To prove knowledge of the PIN without sending it, the client could send a hash of the PIN or a timestamp signed with the derived MK.
    d. The server validates the user's online session and the proof of PIN knowledge.
    e. The server generates a **brand new DEK** and a **new `expiryTimestamp`**.
    f. The server sends the new DEK and `expiryTimestamp` to the client.
    g. The client derives the MK from the user's PIN and the existing salt, wraps the _new_ DEK, and overwrites the old `wrappedDEK` in the `HttpOnly` cookie and the old `expiryTimestamp` in IndexedDB. This constitutes an efficient, client-side key rotation.[38, 39]
    h. The offline session is now successfully "refreshed" or "renewed," and the user can continue to work offline for another defined period.

This rotation of the DEK ensures that even if an attacker were to compromise a DEK, its usefulness is time-bound. It limits the "blast radius" of a key compromise to only the data encrypted during that specific session's lifetime, a significant security enhancement.

## Section 4: Secure Key Storage and Management on the Client

The most critical and nuanced implementation detail of this architecture is deciding where to store the `wrappedDEK`. This component is the lynchpin of the entire offline security model. Its storage location must be chosen to maximize protection against the threats outlined in Section 1.2, particularly XSS attacks and direct file inspection.

### 4.1 Analyzing Client-Side Storage Options

A careful analysis of the available browser storage mechanisms reveals a clear hierarchy of security.

- **`localStorage` and `sessionStorage` (Rejected):** These APIs are fundamentally insecure for storing sensitive cryptographic material. They are synchronous, which can harm performance, but more importantly, they are globally accessible to any JavaScript running on the page. A single XSS vulnerability would allow an attacker to trivially steal the `wrappedDEK`.[18, 19, 20] Furthermore, they are not accessible within Service Workers, making them incompatible with the proposed architecture.[10]
- **`IndexedDB` (Viable but Flawed):** While IndexedDB is the correct choice for the main application data, it shares the same critical vulnerability as `localStorage`: it is fully accessible to any script running in the page's origin. Storing the `wrappedDEK` in IndexedDB offers no meaningful protection against XSS attacks. An attacker's script could simply read the `wrappedDEK` from the database, wait for the user to enter their PIN, and then use the same cryptographic APIs to perform decryption.[17, 22] It offers no security advantage over `localStorage` for this specific purpose.
- **`HttpOnly` Cookies (The Recommended Approach):** `HttpOnly` cookies possess a unique security property that makes them the superior choice: they cannot be accessed via client-side JavaScript (`document.cookie`).[18, 19] This provides powerful, browser-enforced mitigation against XSS attacks attempting to steal the `wrappedDEK`. While unconventional for storing client-only data, this mechanism can be cleverly repurposed for our needs.

### 4.2 The "App-Bound Encryption" Piggyback Strategy

The security of `HttpOnly` cookies is further enhanced in modern Chromium-based browsers like Google Chrome and Microsoft Edge through a feature known as **app-bound encryption**.[16] The browser automatically encrypts its cookie database on disk using a key that is tied to the browser application and protected by the underlying operating system's security features. This means that malware or an attacker with disk access cannot simply copy the cookie file and read its contents; they would need to subvert the browser's own protected processes.[16]

By storing our `wrappedDEK` in an `HttpOnly` cookie, we can "piggyback" on this advanced security feature, gaining protection against both XSS and offline disk inspection attacks. The implementation requires a specific pattern involving the Service Worker:

1.  **Setting the Cookie:** During the provisioning flow, after the client has created the `wrappedDEK`, it does not store it directly. Instead, it sends the `wrappedDEK` to the server, which then sends it back in the response with a `Set-Cookie` header. This header must specify the flags `HttpOnly`, `Secure` (to ensure it's only sent over HTTPS), and `SameSite=Strict`.
2.  **Reading the Cookie:** Because the client-side JavaScript cannot read the cookie, it must use an indirect method. The PWA's main thread will make a `fetch` request to a "no-op" endpoint on its own origin (e.g., `/read-cookie`). The browser, when dispatching this request, will automatically attach all relevant cookies, including our `HttpOnly` cookie.
3.  **Service Worker Interception:** The PWA's Service Worker will have a `fetch` event listener that intercepts this specific request. The Service Worker can then access the `Request` object, read the cookie's value from the `headers`, and pass the `wrappedDEK` value back to the main thread using `postMessage`.

This flow cleverly uses the browser's own security boundaries and the Service Worker's proxying capabilities to create a secure channel for passing a secret from the protected cookie jar to the application's cryptographic logic, all without ever exposing it to the main DOM environment where XSS attacks occur.

### 4.3 Comparative Analysis of Client-Side Storage for `wrappedDEK`

The following table summarizes the analysis and provides a clear justification for the recommended approach.

| Storage Mechanism | Protection vs. Physical Access                                | Protection vs. XSS Attack          | PWA/Service Worker Access         | Implementation Complexity | Recommendation      |
| :---------------- | :------------------------------------------------------------ | :--------------------------------- | :-------------------------------- | :------------------------ | :------------------ |
| `localStorage`    | **Low** (Plaintext on disk) [19]                              | **None** (JS accessible) [18]      | No (in SW) [10]                   | Low                       | **Rejected**        |
| `IndexedDB`       | **Low** (Plaintext on disk) [16]                              | **None** (JS accessible) [17]      | Yes (Direct) [10]                 | Medium                    | **Not Recommended** |
| `HttpOnly Cookie` | **Medium** (App-bound encryption in supporting browsers) [16] | **High** (Inaccessible to JS) [19] | Yes (Indirect via SW `fetch`) [5] | High                      | **Recommended**     |

While the `HttpOnly` cookie approach introduces higher implementation complexity, its superior security profile, particularly its resilience to XSS, makes it the only responsible choice for storing a critical cryptographic component like the `wrappedDEK`. The additional protection from app-bound encryption against physical disk access in major browsers is a significant bonus.

## Section 5: Implementation Details and Reference Code

This section provides reference JavaScript code snippets to demonstrate the implementation of the core cryptographic and logical components of the architecture. These examples use modern `async/await` syntax and assume a modular structure.

### 5.1 Crypto Service Module

This module encapsulates all interactions with the Web Crypto API.

[./crypto-service.js](./crypto-service.js)

### 5.2 IndexedDB Wrapper

A simple service using the `idb` library for cleaner interaction with IndexedDB.

[./db-service.js](./db-service.js)

### 5.3 Session Management Logic

This code demonstrates the high-level logic for the offline unlock flow.

[./session-manager.js](./session-manager.js)

### 5.4 Service Worker Snippet

The `fetch` event listener in the service worker responsible for reading the `HttpOnly` cookie.

[./service-worker.js](./service-worker.js)

### 5.5 Service Worker Client Module

This module provides the communication bridge from the main application to the service worker.

[./service-worker-client.js](./service-worker-client.js)

## Section 6: Conclusion and Future Outlook

This report has detailed a comprehensive, secure, and robust architecture for encrypting data at rest within an offline-first Progressive Web App. The proposed system meets all user requirements, including the use of a PIN-based secret, long-term offline functionality, and a secure session renewal mechanism analogous to a refresh token.

### 6.1 Summary of the Architecture

The core of the design is a **dual-key (KEM/DEM) cryptographic model**. A short-lived **Master Key (MK)** is derived from the user's PIN using the slow and strong **PBKDF2** algorithm. This MK is used only once per session to decrypt (unwrap) a long-lived, 256-bit **Data Encryption Key (DEK)**. The DEK, which acts as the offline session token, is then used for all bulk data encryption and decryption operations using the highly secure and performant **AES-GCM** algorithm.

The "refresh token" functionality is implemented as a **time-based key rotation policy** for the DEK. An expiry timestamp is associated with the DEK, and upon expiration, the user must go online to authenticate and receive a new DEK from the server, starting a new secure offline session.

The most critical component, the encrypted DEK, is stored in a **secure, `HttpOnly` cookie**. This unconventional approach leverages the browser's native protection against XSS attacks and, in many cases, OS-level "app-bound encryption," providing the most secure storage mechanism currently available on the web platform for client-side secrets.

### 6.2 Security Posture and Limitations

The proposed architecture provides a strong security posture against the most common threats to client-side data.

**Strengths:**

- **Protection Against Data-at-Rest Theft:** Data stored in IndexedDB is fully encrypted, rendering it useless to an attacker with physical access to the device's storage, especially when combined with app-bound cookie encryption.[16]
- **Resilience to XSS:** By storing the `wrappedDEK` in an `HttpOnly` cookie, the system is highly resistant to XSS-based attacks that aim to steal the key and decrypt the database.[19]
- **Time-Bound Key Exposure:** The DEK rotation policy limits the "blast radius" of a key compromise. If a DEK is ever extracted from memory, its utility is limited to the data encrypted within its specific lifetime.[36]

**Limitations:**

- **Reliance on PIN Strength:** The ultimate security of the data against a dedicated, offline brute-force attack hinges on the entropy of the user's PIN and the computational cost of the PBKDF2 function. A weak, easily guessable PIN remains a potential point of failure. This trade-off between usability and security is unavoidable in any password-based system.
- **In-Memory Threats:** While the DEK is held in memory during an active session, it is theoretically vulnerable to sophisticated memory-scraping malware or advanced side-channel attacks. This is an inherent risk of any client-side decryption process.
- **Implementation Complexity:** The recommended architecture, particularly the `HttpOnly` cookie and Service Worker pattern, is significantly more complex than simpler (and less secure) alternatives. It requires a thorough understanding of multiple web APIs and their interactions.

### 6.3 Future Outlook: The Need for a Native API

The complexity of this architecture highlights a significant gap in the web platform: the lack of a standardized, easy-to-use, and secure API for storing client-side secrets. The fact that the most secure solution involves repurposing `HttpOnly` cookies and Service Worker fetch handlers is indicative of a missing primitive.

Ideally, browsers would provide a **native, local-first secret storage API**, analogous to `localStorage` but with guaranteed, hardware-backed security where available (e.g., leveraging platform authenticators like Touch ID/Face ID, or secure enclaves like the TEE). Such an API would obviate the need for the complex workarounds detailed in this report, dramatically simplifying the development of secure offline-first applications and providing stronger, more reliable security guarantees across all browsers and platforms.[16] Until such an API becomes a reality, the architecture presented here represents the current best practice for achieving robust, PIN-protected, offline data encryption in a Progressive Web App.

## Section 7: Demonstration Client

This section provides the complete code for a simple HTML client to demonstrate and test the functionality of the proposed architecture. It includes the HTML structure, the main client-side JavaScript, and a mock server module to simulate backend interactions for a purely client-side demo.

### 7.1 `index.html`

This file provides the user interface for the demonstration.

[./index.html](./index.html)

### 7.2 `mock-server.js`

This file simulates the backend server's role in generating the DEK and setting the cookie. For this demo, the `HttpOnly` cookie is simulated using `localStorage`.

[./mock-server.js](./mock-server.js)

### 7.3 `client.js`

This is the main application logic that connects the UI to the cryptographic services.

[./client.js](./client.js)
