(() => {
  const PANEL_ID = "inventory-panel";
  const TAB_ID = "inventory-tab";
  let inventoryActive = false;

  function apiBase() {
    return String(window.EQUIPMENT_CONFIG?.apiBase || "").replace(/\/$/, "");
  }

  function cardStyle(element) {
    Object.assign(element.style, {
      border: "1px solid #303030",
      background: "#1e1e1e",
      borderRadius: "12px",
      color: "#f5f5f5",
      padding: "20px",
    });
  }

  async function loadInventory() {
    const panel = document.getElementById(PANEL_ID);
    const content = panel?.querySelector("[data-inventory-content]");
    if (!content) return;
    content.textContent = "Consultando existencias…";
    try {
      const response = await fetch(`${apiBase()}/api/inventory`);
      const result = await response.json();
      if (!response.ok || !result.ok || !Array.isArray(result.inventario)) {
        throw new Error(result.error || "No se pudo consultar el inventario");
      }
      content.textContent = "";
      if (!result.inventario.length) {
        content.textContent = "No hay equipos disponibles.";
        return;
      }
      const total = result.inventario.reduce((sum, item) => sum + Number(item.cantidad || 0), 0);
      const summary = document.createElement("p");
      summary.textContent = `${total} equipo${total === 1 ? "" : "s"} disponible${total === 1 ? "" : "s"}`;
      summary.style.cssText = "margin:0 0 14px;color:#b0b0b0;font-size:14px";
      content.append(summary);
      result.inventario.forEach((item) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px 14px;margin-top:8px;border:1px solid #444;border-radius:12px;background:#252525";
        const brand = document.createElement("strong");
        brand.textContent = item.marca || "Sin marca";
        const quantity = document.createElement("strong");
        quantity.textContent = String(Number(item.cantidad || 0));
        quantity.style.cssText = "min-width:44px;text-align:center;padding:8px 12px;border-radius:10px;background:#153b18;color:#69f0ae;font-size:18px";
        row.append(brand, quantity);
        content.append(row);
      });
    } catch (error) {
      content.textContent = error instanceof Error ? error.message : "No se pudo consultar el inventario";
      content.style.color = "#ffcdd2";
    }
  }

  function showInventory(tabList, tab) {
    inventoryActive = true;
    tabList.querySelectorAll('[role="tab"]').forEach((item) => item.setAttribute("aria-selected", item === tab ? "true" : "false"));
    tabList.parentElement?.querySelectorAll(':scope > [role="tabpanel"]').forEach((panel) => {
      if (panel.id !== PANEL_ID) panel.style.display = "none";
    });
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.style.display = "block";
    void loadInventory();
  }

  function restoreOriginalPanels(tabList, tab) {
    inventoryActive = false;
    document.getElementById(PANEL_ID)?.style.setProperty("display", "none");
    tabList.querySelectorAll('[role="tab"]').forEach((item) => item.setAttribute("aria-selected", item === tab ? "true" : "false"));
    tabList.parentElement?.querySelectorAll(':scope > [role="tabpanel"]').forEach((panel) => {
      if (panel.id !== PANEL_ID) panel.style.removeProperty("display");
    });
  }

  function installInventoryTab() {
    const tabList = document.querySelector('[role="tablist"]');
    if (!tabList || document.getElementById(TAB_ID)) return;
    tabList.style.gridTemplateColumns = "repeat(3,minmax(0,1fr))";
    const originalTabs = [...tabList.querySelectorAll('[role="tab"]')];
    if (originalTabs.length < 2) return;
    const tab = document.createElement("button");
    tab.id = TAB_ID;
    tab.type = "button";
    tab.role = "tab";
    tab.className = originalTabs[0].className;
    tab.setAttribute("aria-selected", "false");
    tab.textContent = "Inventario";
    tab.addEventListener("click", () => showInventory(tabList, tab));
    originalTabs.forEach((item) => item.addEventListener("click", () => restoreOriginalPanels(tabList, item)));
    tabList.append(tab);

    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.role = "tabpanel";
    panel.style.display = "none";
    cardStyle(panel);
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px";
    const title = document.createElement("h2");
    title.textContent = "Equipos disponibles por marca";
    title.style.cssText = "margin:0;font-size:18px;font-weight:800";
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.textContent = "Actualizar";
    refresh.style.cssText = "border:0;border-radius:10px;background:#4caf50;color:#102212;padding:9px 12px;font-weight:700";
    refresh.addEventListener("click", loadInventory);
    const content = document.createElement("div");
    content.dataset.inventoryContent = "";
    header.append(title, refresh);
    panel.append(header, content);
    tabList.parentElement?.append(panel);
    if (inventoryActive) showInventory(tabList, tab);
  }

  installInventoryTab();
  new MutationObserver(installInventoryTab).observe(document.body, { childList: true, subtree: true });
})();
