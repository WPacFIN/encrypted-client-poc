// client.js
import { cryptoService } from "./crypto-service.js";
import { dbService } from "./db-service.js";
import { sessionManager } from "./session-manager.js";
import { provisionOfflineAccess, setWrappedDekCookie } from "./mock-server.js";

// --- DOM Elements ---
const provisioningSection = document.getElementById("provisioningSection");
const sessionSection = document.getElementById("sessionSection");
const dataSection = document.getElementById("dataSection");
const provisionPinInput = document.getElementById("provisionPin");
const unlockPinInput = document.getElementById("unlockPin");
const setupButton = document.getElementById("setupButton");
const unlockButton = document.getElementById("unlockButton");
const saveButton = document.getElementById("saveButton");
const loadButton = document.getElementById("loadButton");
const dataIdInput = document.getElementById("dataId");
const dataContentInput = document.getElementById("dataContent");
const logs = document.getElementById("logs");

// --- Utility Functions ---
function log(message) {
  console.log(message);
  logs.textContent =
    `${new Date().toLocaleTimeString()}: ${message}\n` + logs.textContent;
}

function disableButtons(disabled) {
  setupButton.disabled = disabled;
  unlockButton.disabled = disabled;
  saveButton.disabled = disabled;
  loadButton.disabled = disabled;
}

// --- Main Application Logic ---

async function setupOfflineAccess() {
  disableButtons(true);
  const pin = provisionPinInput.value;
  if (!pin || pin.length < 6) {
    log("ERROR: PIN must be at least 6 digits.");
    disableButtons(false);
    return;
  }

  try {
    log("1. Starting provisioning process...");

    // Step 1: Generate a salt on the client
    log("2. Generating a new salt...");
    const salt = cryptoService.generateSalt();

    // Step 2: Call mock server to get a new DEK and its expiry
    log("3. Requesting new DEK from mock server...");
    const { dek: rawDekBuffer, expiryTimestamp } =
      await provisionOfflineAccess();

    // Step 3: Import the raw DEK into a CryptoKey object. This is required
    // before it can be wrapped.
    log("3.5. Importing raw DEK into a CryptoKey...");
    const dekAsCryptoKey = await window.crypto.subtle.importKey(
      "raw",
      rawDekBuffer,
      { name: "AES-GCM" },
      true, // Key must be extractable to be wrapped
      ["encrypt", "decrypt"]
    );

    // Step 4: Derive Master Key from PIN and salt
    log("4. Deriving Master Key from PIN (this might take a moment)...");
    const masterKey = await cryptoService.deriveMasterKey(pin, salt);
    log("   Master Key derived.");

    // Step 5: Wrap (encrypt) the DEK with the Master Key
    log("5. Wrapping the DEK with the Master Key...");
    const wrappedDek = await cryptoService.wrapDek(masterKey, dekAsCryptoKey);
    log("   DEK has been wrapped.");

    // Step 6: Store metadata in IndexedDB and "cookie"
    log("6. Storing salt and expiry in IndexedDB...");
    await dbService.setMetadata("userSalt", salt);
    await dbService.setMetadata("expiryTimestamp", expiryTimestamp);

    log("7. Sending wrapped DEK to mock server to set as cookie...");
    setWrappedDekCookie(wrappedDek);

    log("✅ Provisioning complete! Device is ready for offline use.");
    provisioningSection.classList.add("hidden");
    sessionSection.classList.remove("hidden");
  } catch (error) {
    log(`❌ Provisioning failed: ${error.message}`);
    console.error(error);
  } finally {
    disableButtons(false);
  }
}

async function unlockSession() {
  disableButtons(true);
  const pin = unlockPinInput.value;
  if (!pin) {
    log("ERROR: Please enter your PIN.");
    disableButtons(false);
    return;
  }

  log("Attempting to unlock session with PIN...");
  const success = await sessionManager.unlockSession(pin);

  if (success) {
    log("✅ Session unlocked successfully!");
    sessionSection.classList.add("hidden");
    dataSection.classList.remove("hidden");
  } else {
    log("❌ Invalid PIN. Failed to unlock session.");
  }
  disableButtons(false);
}

async function saveData() {
  disableButtons(true);
  const id = dataIdInput.value;
  const content = dataContentInput.value;

  if (!id || !content) {
    log("ERROR: Please provide both an ID and content to save.");
    disableButtons(false);
    return;
  }

  try {
    log(`Saving item with ID: ${id}...`);
    await sessionManager.saveItem({ id, content });
    log(`✅ Successfully saved item "${id}".`);
  } catch (error) {
    log(`❌ Failed to save data: ${error.message}`);
  } finally {
    disableButtons(false);
  }
}

async function loadData() {
  disableButtons(true);
  const id = dataIdInput.value;
  if (!id) {
    log("ERROR: Please provide an ID to load.");
    disableButtons(false);
    return;
  }

  try {
    log(`Loading item with ID: ${id}...`);
    const item = await sessionManager.getDecryptedItem(id);
    if (item) {
      log(`✅ Loaded data for ID "${id}": ${JSON.stringify(item)}`);
      dataContentInput.value = item.content;
    } else {
      log(`⚠️ No data found for ID "${id}".`);
    }
  } catch (error) {
    log(`❌ Failed to load data: ${error.message}`);
  } finally {
    disableButtons(false);
  }
}

// --- Initialization ---
async function initialize() {
  log("Client initialized. Checking for existing provisioning...");

  // Register the service worker
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/service-worker.js");
      log("Service Worker registered successfully.");
    } catch (error) {
      log(`Service Worker registration failed: ${error}`);
    }
  }

  // Check if the device is already provisioned
  const salt = await dbService.getMetadata("userSalt");
  if (salt) {
    log("Device appears to be provisioned. Hiding setup section.");
    provisioningSection.classList.add("hidden");
    sessionSection.classList.remove("hidden");
  } else {
    log("Device not provisioned. Please complete setup.");
  }

  // Add event listeners
  setupButton.addEventListener("click", setupOfflineAccess);
  unlockButton.addEventListener("click", unlockSession);
  saveButton.addEventListener("click", saveData);
  loadButton.addEventListener("click", loadData);
}

initialize();
