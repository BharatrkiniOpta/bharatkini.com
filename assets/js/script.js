const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector("#site-nav");
const copyButtons = document.querySelectorAll("[data-copy-value]");
let toastTimerId;

if (navToggle && siteNav) {
  navToggle.addEventListener("click", () => {
    const isOpen = siteNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
    navToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  });
}

function getToastElement() {
  let toast = document.querySelector(".feedback-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.className = "feedback-toast";
    toast.setAttribute("aria-live", "polite");
    toast.setAttribute("aria-atomic", "true");
    document.body.appendChild(toast);
  }

  return toast;
}

function showToast(message) {
  const toast = getToastElement();

  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add("is-visible");

  window.clearTimeout(toastTimerId);
  toastTimerId = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2200);
}

function applyFeedbackState(element, duration = 1600) {
  element.classList.add("is-feedback-active");

  window.setTimeout(() => {
    element.classList.remove("is-feedback-active");
  }, duration);
}

copyButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const value = button.getAttribute("data-copy-value");
    const message =
      button.getAttribute("data-copy-message") || "Copied to your clipboard.";

    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      applyFeedbackState(button);
      button.classList.add("is-copied");
      showToast(message);

      window.setTimeout(() => {
        button.classList.remove("is-copied");
      }, 1600);
    } catch (_error) {
      showToast("Copy failed. Please try again.");
    }
  });
});
