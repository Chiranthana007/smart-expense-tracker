const SESSION_KEY = "smart-expense-session-token";

const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const loginForm = document.querySelector("#loginForm");
const usernameInput = document.querySelector("#username");
const passwordInput = document.querySelector("#password");
const loginMessage = document.querySelector("#loginMessage");
const createAccountButton = document.querySelector("#createAccountButton");
const logoutButton = document.querySelector("#logoutButton");
const userStatus = document.querySelector("#userStatus");

const form = document.querySelector("#expenseForm");
const amountInput = document.querySelector("#amount");
const categoryInput = document.querySelector("#category");
const descriptionInput = document.querySelector("#description");
const expensesContainer = document.querySelector("#expensesContainer");
const totalAmount = document.querySelector("#totalAmount");
const categorySummary = document.querySelector("#categorySummary");
const highestCategory = document.querySelector("#highestCategory");
const suggestionText = document.querySelector("#suggestionText");
const clearButton = document.querySelector("#clearButton");
const modeButtons = document.querySelectorAll(".mode-card");
const dashboardPanels = document.querySelectorAll(".dashboard-panel");

let expenses = [];
let currentUser = null;
let sessionToken = sessionStorage.getItem(SESSION_KEY);

function formatMoney(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR"
  }).format(amount);
}

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong.");
  }

  return data;
}

async function createUser(username, password) {
  return apiRequest("/api/register", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

async function loginUser(username, password) {
  return apiRequest("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

async function loadProfile() {
  return apiRequest("/api/me");
}

async function loadExpenses() {
  const data = await apiRequest("/api/expenses");
  expenses = data.expenses;
}

async function addExpense(amount, category, description) {
  const data = await apiRequest("/api/expenses", {
    method: "POST",
    body: JSON.stringify({ amount, category, description })
  });

  expenses.push(data.expense);
  render();
}

async function clearExpenses() {
  await apiRequest("/api/expenses", {
    method: "DELETE"
  });

  expenses = [];
  render();
}

async function logout() {
  try {
    await apiRequest("/api/logout", {
      method: "POST"
    });
  } catch (error) {
    console.warn("Logout request failed.", error);
  }

  sessionToken = "";
  currentUser = null;
  expenses = [];
  sessionStorage.removeItem(SESSION_KEY);
  appView.classList.add("hidden");
  loginView.classList.remove("hidden");
  setLoginMessage("Logged out.", "success");
  usernameInput.focus();
}

function getTotalExpense() {
  return expenses.reduce((total, expense) => total + expense.amount, 0);
}

function getCategoryTotals() {
  return expenses.reduce((totals, expense) => {
    totals[expense.category] = (totals[expense.category] || 0) + expense.amount;
    return totals;
  }, {});
}

function getHighestCategory() {
  const totals = getCategoryTotals();
  let maxCategory = "";
  let maxAmount = 0;

  Object.entries(totals).forEach(([category, amount]) => {
    if (amount > maxAmount) {
      maxCategory = category;
      maxAmount = amount;
    }
  });

  return maxCategory ? { category: maxCategory, amount: maxAmount } : null;
}

function getSuggestion() {
  const total = getTotalExpense();
  const highest = getHighestCategory();

  if (!highest) {
    return "Add an expense to get a saving suggestion.";
  }

  const categoryShare = (highest.amount / total) * 100;
  const categoryName = highest.category.toLowerCase();
  const expenseCount = expenses.length;

  if (expenseCount < 3) {
    return "Add a few more expenses to get a more accurate spending suggestion.";
  }

  if (categoryShare >= 50) {
    return `${highest.category} is taking ${categoryShare.toFixed(0)}% of your spending. Set a weekly limit for this category.`;
  }

  if (categoryName.includes("food") || categoryName.includes("snack") || categoryName.includes("restaurant")) {
    return "Food spending is your top area. Try planning meals or reducing outside food for a few days.";
  }

  if (categoryName.includes("travel") || categoryName.includes("transport") || categoryName.includes("fuel")) {
    return "Travel is your top area. Try grouping trips together or using a cheaper transport option when possible.";
  }

  if (categoryName.includes("shop") || categoryName.includes("clothes") || categoryName.includes("fashion")) {
    return "Shopping is your top area. Wait 24 hours before buying non-essential items.";
  }

  if (categoryName.includes("bill") || categoryName.includes("rent") || categoryName.includes("electric")) {
    return "Bills are your top area. Review fixed payments and check if any plan can be reduced.";
  }

  if (total > 10000) {
    return `Your total spending is ${formatMoney(total)}. Try saving at least 10% before adding new expenses.`;
  }

  return `${highest.category} is your highest category. Try reducing it by 10% next week.`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderExpenses() {
  if (expenses.length === 0) {
    expensesContainer.innerHTML = '<div class="empty-state">No expenses recorded.</div>';
    return;
  }

  expensesContainer.innerHTML = expenses
    .map((expense) => `
      <article class="expense-row">
        <div class="expense-amount">${formatMoney(expense.amount)}</div>
        <div class="expense-category">${escapeHtml(expense.category)}</div>
        <div class="expense-description">${escapeHtml(expense.description)}</div>
      </article>
    `)
    .join("");
}

function renderCategorySummary() {
  const totals = getCategoryTotals();
  const entries = Object.entries(totals);

  if (entries.length === 0) {
    categorySummary.innerHTML = '<div class="empty-state">No category totals yet.</div>';
    return;
  }

  categorySummary.innerHTML = entries
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => `
      <div class="category-item">
        <span>${escapeHtml(category)}</span>
        <strong>${formatMoney(amount)}</strong>
      </div>
    `)
    .join("");
}

function renderInsights() {
  const highest = getHighestCategory();
  totalAmount.textContent = formatMoney(getTotalExpense());

  if (!highest) {
    highestCategory.textContent = "No data available.";
    suggestionText.textContent = getSuggestion();
    return;
  }

  highestCategory.textContent = `${highest.category} is the highest spending category at ${formatMoney(highest.amount)}.`;
  suggestionText.textContent = getSuggestion();
}

function render() {
  userStatus.textContent = `Logged in as ${currentUser.username}`;
  renderExpenses();
  renderCategorySummary();
  renderInsights();
}

function setActivePanel(panelName) {
  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === panelName);
  });

  dashboardPanels.forEach((panel) => {
    panel.classList.toggle("active-panel", panel.dataset.panel === panelName);
  });
}

function setLoginMessage(message, type = "") {
  loginMessage.textContent = message;
  loginMessage.className = `login-message ${type}`.trim();
}

async function enterApp(authData) {
  sessionToken = authData.token;
  currentUser = authData.user;
  sessionStorage.setItem(SESSION_KEY, sessionToken);
  await loadExpenses();
  loginView.classList.add("hidden");
  appView.classList.remove("hidden");
  render();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const authData = await loginUser(usernameInput.value, passwordInput.value);
    setLoginMessage("Login successful.", "success");
    loginForm.reset();
    await enterApp(authData);
  } catch (error) {
    setLoginMessage(error.message, "error");
  }
});

createAccountButton.addEventListener("click", async () => {
  try {
    const authData = await createUser(usernameInput.value, passwordInput.value);
    setLoginMessage("Account created.", "success");
    loginForm.reset();
    await enterApp(authData);
  } catch (error) {
    setLoginMessage(error.message, "error");
  }
});

logoutButton.addEventListener("click", logout);

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActivePanel(button.dataset.view);
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const amount = Number(amountInput.value);
  const category = categoryInput.value;
  const description = descriptionInput.value;

  if (!amount || amount <= 0 || !category.trim() || !description.trim()) {
    return;
  }

  await addExpense(amount, category, description);
  form.reset();
  amountInput.focus();
});

clearButton.addEventListener("click", async () => {
  if (expenses.length === 0) {
    return;
  }

  const shouldClear = window.confirm("Clear all expenses for this account?");

  if (!shouldClear) {
    return;
  }

  await clearExpenses();
});

async function init() {
  if (!sessionToken) {
    loginView.classList.remove("hidden");
    appView.classList.add("hidden");
    usernameInput.focus();
    return;
  }

  try {
    const profile = await loadProfile();
    currentUser = profile.user;
    await loadExpenses();
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    render();
  } catch (error) {
    sessionToken = "";
    sessionStorage.removeItem(SESSION_KEY);
    loginView.classList.remove("hidden");
    appView.classList.add("hidden");
    setLoginMessage("Please login again.", "error");
  }
}

init();
