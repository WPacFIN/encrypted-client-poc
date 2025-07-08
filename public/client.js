import { cryptoService } from "./crypto-service.js";
import { dbService } from "./db-service.js";
import { sessionManager } from "./session-manager.js";
import { loginUser } from "./api-client.js";

// --- State ---
let currentOnlineUser = null;
let selectedOfflineUser = null;

// --- DOM Elements ---
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

function populateUserSelection(users) {
  userSelect.innerHTML = "";
  users.forEach((user) => {
    const option = document.createElement("option");
    option.value = user.username;
    option.textContent = user.username;
    userSelect.appendChild(option);
  });
}

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

  // Re-initialize the app to show the correct starting screen (online vs offline)
  initialize();
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

  if (navigator.onLine) {
    log("App is online. Showing login screen.");
    showSection(loginSection);
  } else {
    log("App is offline. Checking for local users...");
    const users = await dbService.getAllProvisionedUsers();
    if (users && users.length > 0) {
      log(`Found ${users.length} provisioned users.`);
      populateUserSelection(users);
      showSection(userSelectionSection);
    } else {
      log(
        "No users provisioned for offline use. Please connect to the internet to log in and set up a user."
      );
      showSection(loginSection);
      loginButton.disabled = true;
      usernameInput.disabled = true;
      passwordInput.disabled = true;
    }
  }

  loginButton.addEventListener("click", handleLogin);
  selectUserButton.addEventListener("click", handleUserSelection);
  setupButton.addEventListener("click", setupOfflineAccess);
  unlockButton.addEventListener("click", unlockSession);
  lockButton.addEventListener("click", lockSession);
  addButton.addEventListener("click", addNewItem);
  itemsTableBody.addEventListener("click", handleTableAction);
}

initialize();
