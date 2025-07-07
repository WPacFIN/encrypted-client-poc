// public/client.js
import { cryptoService } from "./crypto-service.js";
import { dbService } from "./db-service.js";
import { sessionManager } from "./session-manager.js";
import { loginUser, storeDekOnServer } from "./api-client.js";

const loginSection = document.getElementById("loginSection");
const provisioningSection = document.getElementById("provisioningSection");
const sessionSection = document.getElementById("sessionSection");
const dataSection = document.getElementById("dataSection");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const provisionPinInput = document.getElementById("provisionPin");
const unlockPinInput = document.getElementById("unlockPin");
const loginButton = document.getElementById("loginButton");
const setupButton = document.getElementById("setupButton");
const unlockButton = document.getElementById("unlockButton");
const lockButton = document.getElementById("lockButton");
const addButton = document.getElementById("addButton");
const newItemContentInput = document.getElementById("newItemContent");
const itemsTableBody = document.querySelector("#itemsTable tbody");
const logs = document.getElementById("logs");

function log(message) {
  console.log(message);
  logs.innerHTML =
    `${new Date().toLocaleTimeString()}: ${message}\n` + logs.innerHTML;
}

function disableAllButtons(disabled) {
  document
    .querySelectorAll("button")
    .forEach((button) => (button.disabled = disabled));
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function showSection(sectionToShow) {
  [loginSection, provisioningSection, sessionSection, dataSection].forEach(
    (section) => {
      section.classList.add("hidden");
    }
  );
  if (sectionToShow) {
    sectionToShow.classList.remove("hidden");
  }
}

async function handleLogin() {
  disableAllButtons(true);
  try {
    const username = usernameInput.value;
    const password = passwordInput.value;
    if (!username || !password) {
      log("ERROR: Username and password are required.");
      return;
    }
    log(`Attempting to log in as ${username}...`);
    await loginUser(username, password);
    log("✅ Login successful!");
    await checkProvisioningState();
  } catch (error) {
    log(`❌ Login failed: ${error.message}`);
    showSection(loginSection);
  } finally {
    disableAllButtons(false);
  }
}

async function checkProvisioningState() {
  const isProvisioned = await dbService.getMetadata("userSalt");
  if (isProvisioned) {
    log("Device is provisioned. Ready to unlock session.");
    showSection(sessionSection);
  } else {
    log("Device not provisioned. Please complete setup.");
    showSection(provisioningSection);
  }
}

async function renderItemsTable() {
  log("Refreshing items table...");
  itemsTableBody.innerHTML = "";
  const allItems = await dbService.getAllData();
  if (allItems.length === 0) {
    log("No items found in the database.");
    return;
  }
  allItems.forEach((item) => {
    const row = document.createElement("tr");
    row.dataset.id = item.id;
    row.innerHTML = `
            <td>${item.id}</td>
            <td class="content-cell"><span>[Encrypted]</span></td>
            <td class="action-cell"><button class="unlock-btn">Unlock</button></td>
        `;
    itemsTableBody.appendChild(row);
  });
  log(`Rendered ${allItems.length} items.`);
}

async function handleTableAction(event) {
  const target = event.target;
  if (!target.matches("button")) return;
  if (sessionManager.isLocked()) {
    log("❌ Action failed: Session is locked.");
    return;
  }
  const row = target.closest("tr");
  const id = row.dataset.id;
  const contentCell = row.querySelector(".content-cell");
  const actionCell = row.querySelector(".action-cell");
  disableAllButtons(true);
  try {
    if (target.classList.contains("unlock-btn")) {
      log(`Unlocking item ${id}...`);
      const decryptedItem = await sessionManager.getDecryptedItem(id);
      contentCell.innerHTML = `<input type="text" value="${decryptedItem.content}">`;
      actionCell.innerHTML = `<button class="update-btn">Update</button><button class="lock-btn">Lock</button>`;
      log(`Item ${id} unlocked.`);
    } else if (target.classList.contains("update-btn")) {
      log(`Updating item ${id}...`);
      const newContent = contentCell.querySelector("input").value;
      await sessionManager.saveItem({ id, content: newContent });
      contentCell.innerHTML = `<span>[Encrypted]</span>`;
      actionCell.innerHTML = `<button class="unlock-btn">Unlock</button>`;
      log(`Item ${id} updated and locked.`);
    } else if (target.classList.contains("lock-btn")) {
      log(`Locking item ${id}...`);
      contentCell.innerHTML = `<span>[Encrypted]</span>`;
      actionCell.innerHTML = `<button class="unlock-btn">Unlock</button>`;
      log(`Item ${id} locked.`);
    }
  } catch (error) {
    log(`❌ Action failed for item ${id}: ${error.message}`);
  } finally {
    disableAllButtons(false);
  }
}

async function addNewItem() {
  if (sessionManager.isLocked()) {
    log("❌ Action failed: Session is locked.");
    return;
  }
  disableAllButtons(true);
  try {
    const content = newItemContentInput.value;
    if (!content) {
      log("ERROR: Please provide content for the new item.");
      return;
    }
    const newItem = { id: crypto.randomUUID(), content: content };
    log(`Adding new item with ID: ${newItem.id}...`);
    await sessionManager.saveItem(newItem);
    log(`✅ Successfully saved new item.`);
    newItemContentInput.value = "";
    await renderItemsTable();
  } catch (error) {
    log(`❌ Failed to save new item: ${error.message}`);
  } finally {
    disableAllButtons(false);
  }
}

async function setupOfflineAccess() {
  disableAllButtons(true);
  try {
    const pin = provisionPinInput.value;
    if (!pin || pin.length < 6) {
      log("ERROR: PIN must be at least 6 digits.");
      return;
    }
    log("1. Starting provisioning process...");
    const salt = cryptoService.generateSalt();
    log("2. Generating salt...");
    log("3. Generating new DEK...");
    const dek = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const expiryTimestamp = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const masterKey = await cryptoService.deriveMasterKey(pin, salt);
    log("4. Deriving Master Key from PIN (this might take a moment)...");
    const wrappedDek = await cryptoService.wrapDek(masterKey, dek);
    log("5. Wrapping the DEK with the Master Key...");
    const base64WrappedDek = arrayBufferToBase64(wrappedDek);
    log("6. Sending wrapped DEK to server to set as HttpOnly cookie...");
    await storeDekOnServer(base64WrappedDek);
    await dbService.setMetadata("userSalt", salt);
    await dbService.setMetadata("expiryTimestamp", expiryTimestamp);
    log("7. Storing salt and expiry in IndexedDB...");
    log("✅ Provisioning complete! Device is ready for offline use.");
    showSection(sessionSection);
  } catch (error) {
    log(`❌ Provisioning failed: ${error.message}`);
  } finally {
    disableAllButtons(false);
  }
}

async function unlockSession() {
  disableAllButtons(true);
  try {
    const pin = unlockPinInput.value;
    if (!pin) {
      log("ERROR: Please enter your PIN.");
      return;
    }
    log("Attempting to unlock session with PIN...");
    const success = await sessionManager.unlockSession(pin);
    if (success) {
      log("✅ Session unlocked successfully!");
      showSection(dataSection);
      await renderItemsTable();
    } else {
      log("❌ Invalid PIN. Failed to unlock session.");
    }
  } catch (error) {
    log(`❌ Unlock process failed: ${error.message}`);
  } finally {
    disableAllButtons(false);
  }
}

function lockSession() {
  log("Locking session...");
  sessionManager.lockSession();
  unlockPinInput.value = "";
  showSection(sessionSection);
  log("Session is now locked. Please enter PIN to unlock.");
}

async function initialize() {
  log("Client initialized.");
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/service-worker.js");
      await navigator.serviceWorker.ready;
      log("Service Worker registered and active.");
    } catch (error) {
      log(`Service Worker registration failed: ${error}`);
    }
  }
  showSection(loginSection);
  loginButton.addEventListener("click", handleLogin);
  setupButton.addEventListener("click", setupOfflineAccess);
  unlockButton.addEventListener("click", unlockSession);
  lockButton.addEventListener("click", lockSession);
  addButton.addEventListener("click", addNewItem);
  itemsTableBody.addEventListener("click", handleTableAction);
}

initialize();
