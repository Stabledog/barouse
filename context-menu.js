let menuEl = null;
let launchTabItem = null;

export function initContextMenu(getActiveUrl) {
  menuEl = document.getElementById("context-menu");
  launchTabItem = document.getElementById("ctx-launch-tab");

  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();

    const activeUrl = getActiveUrl();
    launchTabItem.classList.toggle("disabled", !activeUrl);

    // Position near cursor, clamp to right edge
    const estimatedWidth = 180;
    const x = Math.max(0, Math.min(e.clientX, window.innerWidth - estimatedWidth));
    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${e.clientY}px`;
    menuEl.classList.remove("hidden");
  });

  function hideMenu() {
    menuEl.classList.add("hidden");
  }

  document.addEventListener("click", hideMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideMenu();
  });

  // Close when mouse leaves the menu — the user is done with it
  menuEl.addEventListener("mouseleave", hideMenu);

  launchTabItem.addEventListener("click", (e) => {
    e.stopPropagation();
    const url = getActiveUrl();
    if (url) chrome.tabs.create({ url });
    menuEl.classList.add("hidden");
  });
}
