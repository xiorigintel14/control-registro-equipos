(() => {
  const TAB_ID = "verification-tab";
  const PANEL_ID = "verification-panel";
  const SESSION_KEY = "equipment-verification-session";
  let active = false;
  let stream = null;
  let detector = null;
  let timer = null;
  let scanning = false;
  let lastCode = "";
  let lastReadAt = 0;

  const apiBase = () => String(window.EQUIPMENT_CONFIG?.apiBase || "").replace(/\/$/, "");
  const api = async (path, options) => {
    const response = await fetch(`${apiBase()}${path}`, options);
    const result = await response.json();
    if (!response.ok || result.ok === false) throw new Error(result.error || "No se pudo completar la operación");
    return result;
  };
  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === "style") node.style.cssText = value;
      else if (key === "className") node.className = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key.startsWith("data-") || key.startsWith("aria-")) node.setAttribute(key, value);
      else if (value !== undefined) node[key] = value;
    });
    node.append(...children.filter(Boolean));
    return node;
  };
  const buttonStyle = "border:0;border-radius:11px;padding:12px 14px;font-weight:800;cursor:pointer";
  const inputStyle = "width:100%;box-sizing:border-box;border:1px solid #444;border-radius:11px;background:#252525;color:#f5f5f5;padding:13px;font-size:15px";
  const session = () => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; }
  };
  const saveSession = (value) => value ? localStorage.setItem(SESSION_KEY, JSON.stringify(value)) : localStorage.removeItem(SESSION_KEY);
  const message = (text, kind = "normal") => {
    const box = document.querySelector("[data-verification-message]");
    if (!box) return;
    box.textContent = text;
    box.style.display = text ? "block" : "none";
    box.style.background = kind === "ok" ? "#153b18" : kind === "error" ? "#4b1717" : "#292929";
    box.style.color = kind === "ok" ? "#b9f6ca" : kind === "error" ? "#ffcdd2" : "#eee";
  };

  function stopCamera() {
    scanning = false;
    if (timer) cancelAnimationFrame(timer);
    timer = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    const camera = document.querySelector("[data-verification-camera]");
    if (camera) camera.style.display = "none";
  }

  async function startCamera() {
    if (!session()) return message("Primero inicia una jornada.", "error");
    if (!("BarcodeDetector" in window)) return message("Este navegador no permite este lector. Usa Chrome actualizado o escribe la serie manualmente.", "error");
    try {
      detector = new BarcodeDetector({ formats: ["code_128", "code_39", "ean_13", "itf", "codabar"] });
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      const camera = document.querySelector("[data-verification-camera]");
      const video = camera.querySelector("video");
      camera.style.display = "block";
      video.srcObject = stream;
      await video.play();
      scanning = true;
      scanFrame(video);
    } catch (error) {
      stopCamera();
      message(error?.name === "NotAllowedError" ? "Habilita el permiso de cámara en Chrome." : "No se pudo abrir la cámara.", "error");
    }
  }

  async function scanFrame(video) {
    if (!scanning) return;
    try {
      const codes = await detector.detect(video);
      if (codes.length) {
        const code = String(codes[0].rawValue || "").trim().replace(/\s+/g, "").toUpperCase();
        const now = Date.now();
        if (code && (code !== lastCode || now - lastReadAt > 2500)) {
          lastCode = code;
          lastReadAt = now;
          navigator.vibrate?.(60);
          await verifyCode(code);
        }
      }
    } catch {}
    timer = requestAnimationFrame(() => scanFrame(video));
  }

  async function verifyCode(rawCode) {
    const current = session();
    const code = String(rawCode || "").trim().replace(/\s+/g, "").toUpperCase();
    if (!current || !code) return;
    message(`Verificando ${code}…`);
    try {
      const result = await api("/api/verifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan", sessionId: current.id, code })
      });
      const labels = {
        VERIFICADO: `✅ ${code} está en Stock y quedó verificado.`,
        DUPLICADO: `ℹ️ ${code} ya fue verificado en esta jornada.`,
        ENTREGADO: `⚠️ ${code} figura como Entregado.`,
        NO_REGISTRADO: `⚠️ ${code} no está registrado en el inventario.`,
        NO_PERTENECE: `⚠️ ${code} no pertenecía al Stock inicial de esta jornada.`
      };
      message(labels[result.resultado] || result.mensaje || "Lectura registrada.", result.resultado === "VERIFICADO" ? "ok" : "error");
      const input = document.querySelector("[data-verification-code]");
      if (input) input.value = "";
      await loadCurrent();
    } catch (error) { message(error.message, "error"); }
  }

  function renderSummary(target, data) {
    target.textContent = "";
    const counts = [
      ["Stock inicial", data.total || 0],
      ["Verificados", data.verificados || 0],
      ["Faltantes", data.faltantes || 0],
      ["Observaciones", data.observaciones || 0]
    ];
    const grid = el("div", { style: "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0" });
    counts.forEach(([label, value]) => grid.append(el("div", { style: "border:1px solid #444;border-radius:11px;background:#252525;padding:12px" }, el("strong", { style: "display:block;font-size:22px;color:#69f0ae" }, String(value)), el("span", { style: "font-size:12px;color:#ccc" }, label))));
    target.append(grid);
    if (Array.isArray(data.porMarca) && data.porMarca.length) {
      target.append(el("h3", { style: "font-size:14px;margin:16px 0 8px" }, "Verificados por marca"));
      data.porMarca.forEach((item) => target.append(el("div", { style: "display:flex;justify-content:space-between;border-bottom:1px solid #333;padding:8px 2px" }, el("span", {}, item.marca), el("strong", {}, `${item.verificados}/${item.total}`))));
    }
    if (Array.isArray(data.codigosFaltantes) && data.codigosFaltantes.length) {
      const details = el("details", { style: "margin-top:14px" }, el("summary", { style: "cursor:pointer;color:#ffcc80;font-weight:700" }, `Ver ${data.codigosFaltantes.length} series faltantes`));
      const list = el("div", { style: "margin-top:8px;max-height:220px;overflow:auto" });
      data.codigosFaltantes.forEach((code) => list.append(el("div", { style: "font-family:monospace;padding:7px;border-bottom:1px solid #333" }, code)));
      details.append(list);
      target.append(details);
    }
  }

  async function loadCurrent() {
    const current = session();
    const controls = document.querySelector("[data-verification-controls]");
    const start = document.querySelector("[data-verification-start]");
    const summary = document.querySelector("[data-verification-summary]");
    if (!controls || !start || !summary) return;
    controls.style.display = current ? "block" : "none";
    start.style.display = current ? "none" : "block";
    summary.textContent = "";
    if (!current) return;
    document.querySelector("[data-verification-title]").textContent = current.name;
    try {
      const result = await api(`/api/verifications?sessionId=${encodeURIComponent(current.id)}`);
      renderSummary(summary, result.resumen);
    } catch (error) { message(error.message, "error"); }
  }

  async function startSession() {
    const input = document.querySelector("[data-verification-name]");
    const name = input.value.trim();
    if (!name) return message("Escribe un nombre para la jornada.", "error");
    message("Preparando la lista de equipos en Stock…");
    try {
      const result = await api("/api/verifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", name })
      });
     saveSession({
  id: result.sessionId || result.jornadaId,
  name: name
});
      message(`Jornada iniciada con ${result.total} equipos en Stock.`, "ok");
      await loadCurrent();
    } catch (error) { message(error.message, "error"); }
  }

  async function closeSession() {
    const current = session();
    if (!current || !confirm("¿Finalizar esta jornada de verificación?")) return;
    stopCamera();
    try {
      const result = await api("/api/verifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", sessionId: current.id })
      });
      saveSession(null);
      message(`Jornada finalizada: ${result.resumen.verificados} verificados y ${result.resumen.faltantes} faltantes.`, "ok");
      await loadCurrent();
      await loadHistory();
    } catch (error) { message(error.message, "error"); }
  }

  async function loadHistory() {
    const target = document.querySelector("[data-verification-history]");
    if (!target) return;
    target.textContent = "Consultando historial…";
    try {
      const result = await api("/api/verifications?history=1");
      target.textContent = "";
      if (!result.historial.length) return void (target.textContent = "Todavía no existen jornadas finalizadas.");
      result.historial.forEach((item) => {
        const row = el("details", { style: "border:1px solid #444;border-radius:11px;background:#252525;padding:12px;margin-top:8px" });
        row.append(el("summary", { style: "cursor:pointer;font-weight:800" }, `${item.nombre} · ${item.verificados}/${item.total}`));
        row.append(el("div", { style: "margin-top:8px;color:#ccc;font-size:13px;line-height:1.6" }, `Inicio: ${item.inicio}\nFin: ${item.fin || "En curso"}\nFaltantes: ${item.faltantes}\nObservaciones: ${item.observaciones}`));
        target.append(row);
      });
    } catch (error) { target.textContent = error.message; }
  }

  function showPanel(tabList, tab) {
    active = true;
    tabList.querySelectorAll('[role="tab"]').forEach((item) => item.setAttribute("aria-selected", item === tab ? "true" : "false"));
    tabList.parentElement?.querySelectorAll(':scope > [role="tabpanel"]').forEach((panel) => panel.style.display = panel.id === PANEL_ID ? "block" : "none");
    loadCurrent();
    loadHistory();
  }

  function restorePanels(tabList, tab) {
    if (tab?.id === "inventory-tab") {
  active = false;
  stopCamera();

  document
    .getElementById(PANEL_ID)
    ?.style.setProperty("display", "none");

  return;
}
    active = false;
    stopCamera();
    document.getElementById(PANEL_ID)?.style.setProperty("display", "none");
    tabList.querySelectorAll('[role="tab"]').forEach((item) => item.setAttribute("aria-selected", item === tab ? "true" : "false"));
    tabList.parentElement?.querySelectorAll(':scope > [role="tabpanel"]').forEach((panel) => { if (panel.id !== PANEL_ID && panel.id !== "inventory-panel") panel.style.removeProperty("display"); });
  }

  function install() {
    const tabList = document.querySelector('[role="tablist"]');
    if (!tabList || document.getElementById(TAB_ID)) return;
    const originalTabs = [...tabList.querySelectorAll('[role="tab"]')];
    if (originalTabs.length < 2) return;
    tabList.style.gridTemplateColumns = "repeat(4,minmax(0,1fr))";
    const tab = el("button", { id: TAB_ID, type: "button", role: "tab", className: originalTabs[0].className, textContent: "Verificar" });
    tab.setAttribute("aria-selected", "false");
    tab.addEventListener("click", () => showPanel(tabList, tab));
    originalTabs.forEach((item) => item.addEventListener("click", () => restorePanels(tabList, item)));
    tabList.append(tab);

    const panel = el("section", { id: PANEL_ID, role: "tabpanel", style: "display:none;border:1px solid #303030;background:#1e1e1e;border-radius:12px;color:#f5f5f5;padding:20px" });
    const start = el("div", { "data-verification-start": "" },
      el("h2", { style: "margin:0 0 6px;font-size:19px" }, "Nueva verificación física"),
      el("p", { style: "margin:0 0 14px;color:#ccc;font-size:13px" }, "Se guardará una copia de los equipos que están en Stock al iniciar."),
      el("input", { "data-verification-name": "", placeholder: "Ej. Inventario septiembre 2026", style: inputStyle }),
      el("button", { type: "button", style: `${buttonStyle};width:100%;margin-top:10px;background:#4caf50;color:#102212`, onClick: startSession }, "Iniciar jornada")
    );
    const controls = el("div", { "data-verification-controls": "", style: "display:none" },
      el("h2", { "data-verification-title": "", style: "margin:0 0 12px;font-size:19px;color:#69f0ae" }),
      el("div", { style: "display:flex;gap:8px" },
        el("input", { "data-verification-code": "", placeholder: "Escanea o escribe la serie", style: inputStyle }),
        el("button", { type: "button", title: "Abrir cámara", style: `${buttonStyle};background:#4caf50;color:#102212;font-size:19px`, onClick: startCamera }, "📷")
      ),
      el("button", { type: "button", style: `${buttonStyle};width:100%;margin-top:8px;background:#2e7d32;color:white`, onClick: () => verifyCode(document.querySelector("[data-verification-code]").value) }, "Verificar serie"),
      el("div", { "data-verification-camera": "", style: "display:none;position:relative;margin-top:12px;overflow:hidden;border-radius:12px;background:#000" },
        el("video", { muted: true, playsInline: true, style: "display:block;width:100%;aspect-ratio:4/3;object-fit:cover" }),
        el("div", { style: "position:absolute;left:6%;right:6%;top:38%;height:24%;border:2px solid #69f0ae;border-radius:10px;box-shadow:0 0 0 999px rgba(0,0,0,.55)" }),
        el("button", { type: "button", style: "position:absolute;right:10px;top:10px;border:0;border-radius:8px;padding:8px", onClick: stopCamera }, "Cerrar")
      ),
      el("div", { "data-verification-summary": "" }),
      el("button", { type: "button", style: `${buttonStyle};width:100%;margin-top:16px;background:#7f1d1d;color:white`, onClick: closeSession }, "Finalizar jornada")
    );
    const status = el("div", { "data-verification-message": "", role: "status", style: "display:none;border-radius:10px;padding:11px;margin:12px 0" });
    const history = el("div", {}, el("h2", { style: "font-size:17px;margin:22px 0 8px" }, "Historial de verificaciones"), el("div", { "data-verification-history": "" }));
    panel.append(start, controls, status, history);
    tabList.parentElement?.append(panel);
    if (active) showPanel(tabList, tab);
  }

  install();
  new MutationObserver(install).observe(document.body, { childList: true, subtree: true });
  window.addEventListener("beforeunload", stopCamera);
})();
