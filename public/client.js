/**
 * @file client.js
 * @description This file is the main entry point for the client-side application logic.
 * It acts as the "controller" that manages the UI, handles user interactions, and
 * orchestrates calls to the various service modules (crypto, database, session, api).
 * It is responsible for the entire user workflow, from online login and offline
 * provisioning to the secure lock/unlock cycle for accessing encrypted data.
 */

import { cryptoService } from "./crypto-service.js";
import { dbService } from "./db-service.js";
import { sessionManager } from "./session-manager.js";
import { loginUser } from "./api-client.js";

// --- Global State ---
// These variables hold the application's current state.
let currentOnlineUser = null; // Stores the username of the user authenticated via online login.
let selectedOfflineUser = null; // Stores the username selected for an offline unlock operation.

// --- DOM Element References ---
// Caching references to all interactive DOM elements for performance and convenience.
const loginSection = document.getElementById("loginSection");
const userSelectionSection = document.getElementById("userSelectionSection");
const provisioningSection = document.getElementById("provisioningSection");
const sessionSection = document.getElementById("sessionSection");
const dataSection = document.getElementById("dataSection");

const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const userSelect = document.getElementById("userSelect");
const provisionPinInput = document.getElementById("provisionPin");
const unlockPinInput = document.getElementById("unlockPin");
const unlockHeader = document.getElementById("unlockHeader");

const loginButton = document.getElementById("loginButton");
const selectUserButton = document.getElementById("selectUserButton");
const setupButton = document.getElementById("setupButton");
const unlockButton = document.getElementById("unlockButton");
const lockButton = document.getElementById("lockButton");
const addButton = document.getElementById("addButton");

const newItemContentInput = document.getElementById("newItemContent");
const itemsTableBody = document.querySelector("#itemsTable tbody");
const logs = document.getElementById("logs");

// --- Utility Functions ---

/**
 * Logs a message to both the browser's developer console and the on-screen log element.
 * @param {string} message The message to log.
 */
function log(message) {
  console.log(message);
  logs.innerHTML =
    `${new Date().toLocaleTimeString()}: ${message}\n` + logs.innerHTML;
}

/**
 * Disables or enables all buttons on the page to prevent concurrent operations.
 * @param {boolean} disabled - True to disable all buttons, false to enable them.
 */
function disableAllButtons(disabled) {
  document
    .querySelectorAll("button")
    .forEach((button) => (button.disabled = disabled));
}

/**
 * Manages UI visibility by showing only the specified section and hiding all others.
 * This function acts as a simple view router for the single-page application.
 * @param {HTMLElement} sectionToShow - The section element to make visible.
 */
function showSection(sectionToShow) {
  [
    loginSection,
    userSelectionSection,
    provisioningSection,
    sessionSection,
    dataSection,
  ].forEach((section) => {
    section.classList.add("hidden");
  });
  if (sectionToShow) {
    sectionToShow.classList.remove("hidden");
  }
}

// --- Main Application Logic ---

/**
 * Handles the online login process. It calls the API client to authenticate
 * with the server and then transitions the UI to the next appropriate state.
 */
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
    const loginResult = await loginUser(username, password);

    currentOnlineUser = loginResult.username;
    if (!currentOnlineUser) {
      throw new Error("Server did not return a username on login.");
    }

    log(`✅ Login successful for ${currentOnlineUser}!`);
    await checkProvisioningState();
  } catch (error) {
    log(`❌ Login failed: ${error.message}`);
    showSection(loginSection);
  } finally {
    disableAllButtons(false);
  }
}

/**
 * After a successful online login, this function checks if the user has already
 * set up a PIN on this device. It directs them to either the PIN unlock screen
 * or the one-time PIN setup screen.
 */
async function checkProvisioningState() {
  if (!currentOnlineUser) {
    log("Cannot check provisioning state without a logged-in user.");
    showSection(loginSection);
    return;
  }
  const user = await dbService.getProvisionedUser(currentOnlineUser);
  if (user) {
    log(
      `Device is already provisioned for ${currentOnlineUser}. Ready to unlock session.`
    );
    selectedOfflineUser = currentOnlineUser;
    unlockHeader.textContent = `3. Unlock Session for ${selectedOfflineUser}`;
    showSection(sessionSection);
  } else {
    log(
      `Device not provisioned for ${currentOnlineUser}. Please complete setup.`
    );
    showSection(provisioningSection);
  }
}

/**
 * Populates the user selection dropdown with usernames of all users who have
 * provisioned this device for offline use.
 * @param {Array<Object>} users - An array of user objects from the database.
 */
function populateUserSelection(users) {
  userSelect.innerHTML = "";
  users.forEach((user) => {
    const option = document.createElement("option");
    option.value = user.username;
    option.textContent = user.username;
    userSelect.appendChild(option);
  });
}

/**
 * Handles the selection of a user from the dropdown in offline mode,
 * then transitions to the PIN entry screen for that user.
 */
function handleUserSelection() {
  selectedOfflineUser = userSelect.value;
  if (!selectedOfflineUser) {
    log("ERROR: Please select a user.");
    return;
  }
  log(`User selected: ${selectedOfflineUser}. Please enter PIN.`);
  unlockHeader.textContent = `3. Unlock Session for ${selectedOfflineUser}`;
  showSection(sessionSection);
}

/**
 * Fetches and renders the encrypted data items for the currently unlocked user.
 * It queries the database for items owned by the `selectedOfflineUser`.
 */
async function renderItemsTable() {
  log("Refreshing items table...");
  itemsTableBody.innerHTML = "";
  const allItems = await dbService.getAllDataForUser(selectedOfflineUser);
  if (!allItems || allItems.length === 0) {
    log("No items found in the database for this user.");
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

/**
 * Handles clicks on buttons within the data table (Unlock, Update, Lock).
 * This function acts as a delegate for all table actions.
 * @param {Event} event - The click event from the table.
 */
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
      await sessionManager.saveItem({
        id,
        content: newContent,
        owner: selectedOfflineUser,
      });
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

/**
 * Handles the "Add Item" button click. It creates a new item object,
 * associates it with the current user, and saves it via the session manager.
 */
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
    const newItem = {
      id: crypto.randomUUID(),
      content: content,
      owner: selectedOfflineUser,
    };
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

/**
 * Handles the one-time PIN setup process for a user on a new device.
 * This is the core provisioning flow.
 */
async function setupOfflineAccess() {
  disableAllButtons(true);
  try {
    const pin = provisionPinInput.value;
    if (!pin || pin.length < 6) {
      log("ERROR: PIN must be at least 6 digits.");
      return;
    }
    log(`1. Starting provisioning process for ${currentOnlineUser}...`);
    const salt = cryptoService.generateSalt();
    log("2. Generating salt...");
    log("3. Generating new DEK...");
    const dek = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const masterKey = await cryptoService.deriveMasterKey(pin, salt);
    log("4. Deriving Master Key from PIN (this might take a moment)...");
    const wrappedDek = await cryptoService.wrapDek(masterKey, dek);
    log("5. Wrapping the DEK with the Master Key...");

    await dbService.saveProvisionedUser(currentOnlineUser, salt, wrappedDek);

    log(
      `6. Storing salt and wrapped DEK for ${currentOnlineUser} in IndexedDB...`
    );
    log("✅ Provisioning complete! Device is ready for offline use.");
    selectedOfflineUser = currentOnlineUser;
    unlockHeader.textContent = `3. Unlock Session for ${selectedOfflineUser}`;
    showSection(sessionSection);
  } catch (error) {
    log(`❌ Provisioning failed: ${error.message}`);
  } finally {
    disableAllButtons(false);
  }
}

/**
 * Handles the PIN entry to unlock an existing offline session.
 */
async function unlockSession() {
  disableAllButtons(true);
  try {
    const pin = unlockPinInput.value;
    if (!pin) {
      log("ERROR: Please enter your PIN.");
      return;
    }
    log(`Attempting to unlock session for ${selectedOfflineUser} with PIN...`);
    const success = await sessionManager.unlockSession(
      pin,
      selectedOfflineUser
    );
    if (success) {
      log("✅ Session unlocked successfully!");
      sessionStorage.setItem("lastUser", selectedOfflineUser); // Remember the user for refresh
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

/**
 * Locks the current session by clearing the in-memory key and resetting the UI.
 */
function lockSession() {
  log("Locking session...");
  sessionManager.lockSession();
  sessionStorage.removeItem("lastUser"); // Forget the user on explicit lock
  unlockPinInput.value = "";

  // Re-initialize the app to show the correct starting screen (online vs offline)
  initialize();
}

/**
 * The main entry point for the application. This function determines the
 * initial state of the application (online, offline, provisioned, etc.)
 * and sets up all the necessary event listeners.
 */
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

  try {
    const lastUser = sessionStorage.getItem("lastUser");
    if (lastUser) {
      log(`Found last active user: ${lastUser}. Going to PIN unlock.`);
      selectedOfflineUser = lastUser;
      unlockHeader.textContent = `3. Unlock Session for ${selectedOfflineUser}`;
      showSection(sessionSection);
    } else {
      const users = await dbService.getAllProvisionedUsers();
      if (users && users.length > 0) {
        log(`Found ${users.length} provisioned users. Showing user selection.`);
        populateUserSelection(users);
        showSection(userSelectionSection);
      } else {
        log("Device is not provisioned for any user.");
        if (navigator.onLine) {
          log("App is online. Showing login screen for first-time setup.");
          showSection(loginSection);
        } else {
          log("App is offline and no users are set up. Login is disabled.");
          showSection(loginSection);
          loginButton.disabled = true;
          usernameInput.disabled = true;
          passwordInput.disabled = true;
        }
      }
    }
  } catch (error) {
    log(`❌ Initialization failed: ${error.message}`);
    log(
      "This can happen if the database connection fails. Please check your network or try refreshing."
    );
  }

  loginButton.addEventListener("click", handleLogin);
  selectUserButton.addEventListener("click", handleUserSelection);
  setupButton.addEventListener("click", setupOfflineAccess);
  unlockButton.addEventListener("click", unlockSession);
  lockButton.addEventListener("click", lockSession);
  addButton.addEventListener("click", addNewItem);
  itemsTableBody.addEventListener("click", handleTableAction);
}

// Start the application.
initialize();
