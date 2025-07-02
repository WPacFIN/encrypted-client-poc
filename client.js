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
const newItemContentInput = document.getElementById("newItemContent");
const addButton = document.getElementById("addButton");
const itemsTableBody = document.querySelector("#itemsTable tbody");
const logs = document.getElementById("logs");

// --- Utility Functions ---
function log(message) {
  console.log(message);
  logs.innerHTML =
    `${new Date().toLocaleTimeString()}: ${message}\n` + logs.innerHTML;
}

function disableButtons(disabled) {
  const buttons = document.querySelectorAll("button");
  buttons.forEach((button) => (button.disabled = disabled));
}

// --- Main Application Logic ---

async function renderItemsTable() {
  log("Refreshing items table...");
  itemsTableBody.innerHTML = ""; // Clear existing table
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

  const row = target.closest("tr");
  const id = row.dataset.id;
  const contentCell = row.querySelector(".content-cell");
  const actionCell = row.querySelector(".action-cell");

  disableButtons(true);

  try {
    if (target.classList.contains("unlock-btn")) {
      log(`Unlocking item ${id}...`);
      const decryptedItem = await sessionManager.getDecryptedItem(id);
      contentCell.innerHTML = `<input type="text" value="${decryptedItem.content}">`;
      actionCell.innerHTML = `
                <button class="update-btn">Update</button>
                <button class="lock-btn">Lock</button>
            `;
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
    console.error(error);
  } finally {
    disableButtons(false);
  }
}

async function addNewItem() {
  disableButtons(true);
  try {
    const content = newItemContentInput.value;
    if (!content) {
      log("ERROR: Please provide content for the new item.");
      return;
    }

    const newItem = {
      id: crypto.randomUUID(),
      content: content,
    };

    log(`Adding new item with ID: ${newItem.id}...`);
    await sessionManager.saveItem(newItem);
    log(`✅ Successfully saved new item.`);
    newItemContentInput.value = ""; // Clear input
    await renderItemsTable(); // Refresh table
  } catch (error) {
    log(`❌ Failed to save new item: ${error.message}`);
    console.error(error);
  } finally {
    disableButtons(false);
  }
}

async function setupOfflineAccess() {
  disableButtons(true);
  try {
    const pin = provisionPinInput.value;
    if (!pin || pin.length < 6) {
      log("ERROR: PIN must be at least 6 digits.");
      return;
    }

    log("1. Starting provisioning process...");
    const salt = cryptoService.generateSalt();
    log("2. Generating salt...");
    const { dek: rawDekBuffer, expiryTimestamp } =
      await provisionOfflineAccess();
    log("3. Requesting new DEK from mock server...");
    const dekAsCryptoKey = await window.crypto.subtle.importKey(
      "raw",
      rawDekBuffer,
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"]
    );
    log("3.5. Importing raw DEK into a CryptoKey...");
    const masterKey = await cryptoService.deriveMasterKey(pin, salt);
    log("4. Deriving Master Key from PIN (this might take a moment)...");
    const wrappedDek = await cryptoService.wrapDek(masterKey, dekAsCryptoKey);
    log("5. Wrapping the DEK with the Master Key...");
    await dbService.setMetadata("userSalt", salt);
    await dbService.setMetadata("expiryTimestamp", expiryTimestamp);
    log("6. Storing salt and expiry in IndexedDB...");
    setWrappedDekCookie(wrappedDek);
    log("7. Sending wrapped DEK to mock server to set as cookie...");
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
      sessionSection.classList.add("hidden");
      dataSection.classList.remove("hidden");
      await renderItemsTable();
    } else {
      log("❌ Invalid PIN. Failed to unlock session.");
    }
  } catch (error) {
    log(`❌ Unlock process failed: ${error.message}`);
    console.error(error);
  } finally {
    disableButtons(false);
  }
}

// --- Initialization ---
async function initialize() {
  log("Client initialized. Checking for existing provisioning...");

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
      await navigator.serviceWorker.ready;
      log("Service Worker registered and active.");
    } catch (error) {
      log(`Service Worker registration failed: ${error}`);
    }
  }

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
  addButton.addEventListener("click", addNewItem);
  itemsTableBody.addEventListener("click", handleTableAction);
}

initialize();
