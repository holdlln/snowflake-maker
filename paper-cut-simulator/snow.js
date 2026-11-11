const STORAGE_KEY = "snowflake-studio.collection";
const MAX_FLAKES = 16;
const SVG_NS = "http://www.w3.org/2000/svg";

function readCollection() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter((flake) => typeof flake?.path === "string" && flake.path.length
      && Array.isArray(flake.viewBox) && flake.viewBox.length === 4
      && flake.viewBox.every(Number.isFinite)
      && flake.viewBox[2] > 0 && flake.viewBox[3] > 0).slice(0, MAX_FLAKES);
  } catch {
    return [];
  }
}

function svg(tag, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function shapePath(flake) {
  return svg("path", { d: flake.path, "fill-rule": "evenodd" });
}

export function mountSnowScene(onChange) {
  const scene = document.getElementById("snow-scene");
  const field = document.getElementById("snow-field");
  const shelf = document.getElementById("snow-shelf");
  const list = document.getElementById("snow-collection");
  const pauseButton = document.getElementById("pause-snow");
  let collection = readCollection();
  let paused = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function updateCount() {
    document.getElementById("snow-count").textContent = `보관한 결정 ${collection.length}개`;
  }

  function persist() {
    let stored = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
    } catch {
      stored = false;
    }
    updateCount();
    onChange();
    return stored;
  }

  function updateMotion() {
    field.dataset.paused = String(paused);
    pauseButton.textContent = paused ? "재생" : "일시 정지";
    pauseButton.disabled = !collection.length;
  }

  function renderSnowfall() {
    field.replaceChildren();
    if (!collection.length) return;
    const definitions = svg("defs");
    collection.forEach((flake, i) => {
      const symbol = svg("symbol", { id: `falling-flake-${i}`, viewBox: flake.viewBox.join(" ") });
      symbol.append(shapePath(flake));
      definitions.append(symbol);
    });
    const library = svg("svg", { class: "flake-defs", width: 0, height: 0 });
    library.append(definitions);
    field.append(library);

    for (let i = 0; i < 32; i++) {
      const particle = svg("svg", { class: "falling-flake", viewBox: "0 0 100 100" });
      particle.append(svg("use", { href: `#falling-flake-${i % collection.length}`, width: 100, height: 100 }));
      const size = 20 + Math.random() * 54;
      const duration = 12 + Math.random() * 18;
      particle.style.setProperty("--x", `${(i + Math.random()) / 32 * 100}%`);
      particle.style.setProperty("--size", `${size}px`);
      particle.style.setProperty("--duration", `${duration}s`);
      particle.style.setProperty("--delay", `${-Math.random() * duration}s`);
      particle.style.setProperty("--drift", `${Math.random() * 150 - 75}px`);
      particle.style.setProperty("--spin", i % 2 ? ".75turn" : "-.65turn");
      particle.style.setProperty("--opacity", String(.36 + size / 140));
      field.append(particle);
    }
  }

  function renderScene() {
    document.getElementById("snow-empty").hidden = collection.length > 0;
    shelf.hidden = collection.length === 0;
    document.getElementById("snow-shelf-count").textContent = `보관한 결정 ${collection.length}개`;
    list.replaceChildren(...collection.map((flake, i) => {
      const item = document.createElement("li");
      const preview = svg("svg", { viewBox: flake.viewBox.join(" "), "aria-hidden": "true" });
      preview.append(shapePath(flake));
      const label = document.createElement("span");
      const name = (typeof flake.name === "string" && flake.name.trim()) || `결정 ${String(i + 1).padStart(2, "0")}`;
      label.className = "snow-name";
      label.textContent = name;
      const remove = document.createElement("button");
      remove.textContent = "×";
      remove.setAttribute("aria-label", `${name} 보관함에서 빼기`);
      remove.addEventListener("click", () => {
        collection.splice(i, 1);
        const stored = persist();
        renderScene();
        if (!stored) document.getElementById("snow-subtitle").textContent = "이번 탭에서 뺐어요. 브라우저 보관함은 갱신하지 못했어요.";
        (list.children[i]?.querySelector("button") ?? document.getElementById("close-snow")).focus();
      });
      item.append(preview, label, remove);
      return item;
    }));
    renderSnowfall();
    updateMotion();
  }

  for (const opener of document.querySelectorAll("[data-open-snow]")) {
    opener.addEventListener("click", () => {
      if (scene.open) return;
      document.getElementById("snow-subtitle").textContent = "내가 만든 결정이 하늘에서 내려요.";
      renderScene();
      scene.showModal();
    });
  }
  document.getElementById("close-snow").addEventListener("click", () => scene.close());
  scene.addEventListener("close", () => field.replaceChildren());
  pauseButton.addEventListener("click", () => {
    paused = !paused;
    updateMotion();
  });
  updateCount();

  const has = (path) => collection.some((flake) => flake.path === path);
  return {
    get count() { return collection.length; },
    has,
    save(path, { x, y, width, height }, name = "") {
      if (has(path)) return "duplicate";
      if (collection.length >= MAX_FLAKES) return "full";
      const pad = Math.max(width, height) * .08;
      const viewBox = [x - pad, y - pad, width + 2 * pad, height + 2 * pad];
      collection.push({ path, viewBox, name });
      return persist() ? "saved" : "memory";
    },
  };
}
