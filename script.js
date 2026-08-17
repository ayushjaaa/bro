/* =========================================================
   CATALOG DATA MODEL
   One source of truth for both the mega menu and the
   category + filter page. Every label below comes directly
   from the approved catalog structure.
========================================================= */

const CATALOG = [
  {
    id: "vape", label: "VAPE",
    children: [
      { id: "disposable", label: "Disposable Vapes",
        types: ["Standard Disposable Vapes", "Rechargeable Disposable Vapes"],
        filters: ["Brand", "Puff Count", "Flavor", "Nicotine Strength", "Nicotine Type", "Device Type", "Pack Quantity", "Price", "Availability"],
        brands: ["Flavour Beast", "Oxbar", "Mr Fog", "Stlth", "Kraze", "Geek Bar", "Gcore", "Drip'n", "Ripper", "Instabar", "Doozy Quad", "Vice", "Elf Bar"] },
      { id: "eliquids", label: "E-Liquids / Vape Juice",
        types: ["Freebase E-Liquid", "Nicotine Salt E-Liquid", "Shortfill / Nicotine-Free"],
        filters: ["Brand", "Flavor", "Nicotine Strength", "Nicotine Type", "Bottle Size", "VG/PG Ratio", "Pack Quantity", "Price", "Availability"],
        brands: ["Gcore 30ml", "Gcore 60ml", "Flavour Beast 30ml", "Flavour Beast 60ml", "Lemon Drop", "Flavour Drop", "Berry Drop", "Kapow", "Mr Fog E-Juices", "Oxbar", "ElfLiq", "Delicious Drip E-Juice", "Vice", "Koil Killaz", "Naked"] },
      { id: "pods", label: "Pre-Filled Pods",
        types: ["Closed-System Pods", "Pre-Filled Cartridges", "Replacement Pre-Filled Pods"],
        filters: ["Brand", "Device Compatibility", "Flavor", "Nicotine Strength", "Pod Capacity", "Pack Quantity", "Price", "Availability"],
        brands: ["Flavour Beast Pods", "Ripper X 75K Pods", "Oxbar Maglink 90K Pods", "Mr Fog Switch Pods"] },
      { id: "devices", label: "Vape Devices",
        types: ["Pod Systems", "Pod Mods", "Vape Pens", "Box Mods", "Battery Devices"],
        filters: ["Brand", "Device Type", "Battery Capacity", "Battery Type", "Pod/Tank Capacity", "Coil Compatibility", "Color", "Pack Quantity", "Price", "Availability"],
        brands: ["Vaporesso", "Mr Fog Drt Device", "Battery", "Caliburn"] },
      { id: "hardware", label: "Vape Hardware & Accessories",
        types: ["Coils", "Tanks", "Cartridges", "Replacement Pods", "Batteries", "Chargers", "Drip Tips", "Replacement Parts", "Other Hardware"],
        filters: ["Brand", "Compatibility", "Resistance", "Capacity", "Size", "Color", "Pack Quantity", "Price", "Availability"],
        brands: ["Vaporesso", "Mr Fog Drt Device", "Battery", "Caliburn"] },
    ]
  },
  {
    id: "smoking", label: "SMOKING",
    children: [
      { id: "rolling", label: "Rolling Accessories",
        children: [
          { id: "papers", label: "Rolling Papers",
            types: ["Standard Rolling Papers", "King Size Rolling Papers", "King Size Slim Rolling Papers", "1¼ Rolling Papers", "Single Wide Rolling Papers"],
            filters: ["Brand", "Paper Size", "Material", "Flavor", "Paper Type", "Length / Width", "Pack Quantity", "Price", "Availability"],
            brands: ["RAW", "Elements", "Zig-Zag", "OCB", "Job", "Bambu"],
            enum: { "Paper Size": ["King Size", "King Size Slim", "1¼", "Single Wide"], "Material": ["Hemp", "Rice", "Unbleached", "Other"] } },
          { id: "wraps", label: "Blunts & Wraps",
            types: ["Hemp Wraps", "Blunt Wraps", "Tobacco Wraps"],
            filters: ["Brand", "Material", "Flavor", "Size", "Wrap Type", "Count / Pack Quantity", "Price", "Availability"] },
          { id: "cones", label: "Pre-Rolled Cones",
            types: ["Standard Cones", "King Size Cones", "Flavored Cones", "Multi-Pack Cones"],
            filters: ["Brand", "Cone Size", "Material", "Flavor", "Count", "Pack Quantity", "Price", "Availability"] },
          { id: "tips", label: "Filters & Tips",
            types: ["Filter Tips", "Glass Tips", "Paper Tips", "Pre-Rolled Filters"],
            filters: ["Brand", "Material", "Tip Type", "Size", "Color", "Pack Quantity", "Price", "Availability"] },
          { id: "rollacc", label: "Rolling Accessories",
            types: ["Rolling Trays", "Rolling Machines", "Rolling Mats"],
            filters: ["Brand", "Product Type", "Size", "Material", "Color", "Design", "Price", "Availability"] },
          { id: "tobacco", label: "Tobacco",
            types: ["Rolling Tobacco", "Cigars", "Cigarillos", "Pipe Tobacco"],
            filters: ["Brand", "Tobacco Type", "Flavor", "Size", "Quantity", "Pack Size", "Price", "Availability"] },
        ]
      },
      { id: "torch", label: "Torch Lighters",
        children: [
          { id: "torch-brand", label: "Shop by Brand", isBrandHub: true,
            brands: ["Spider", "Maven", "Soul", "Supernova", "Zengaz", "Clickit", "Scorch Torch"] },
          { id: "torch-all", label: "All Torch Lighters", types: [],
            brands: ["Spider", "Maven", "Soul", "Supernova", "Zengaz", "Clickit", "Scorch Torch"],
            filters: ["Brand", "Flame Type", "Refillable", "Ignition Type", "Torch Type", "Size", "Color / Design", "Pack / Display Quantity", "Price", "Availability"],
            enum: { "Flame Type": ["Single Flame", "Dual Flame", "Multi-Flame", "Adjustable Flame"] } },
        ]
      },
      { id: "butane", label: "Butane",
        children: [
          { id: "butane-brand", label: "Shop by Brand", isBrandHub: true,
            brands: ["Spider", "Supernova", "London", "Whip-It", "Soul", "Ronson", "Zippo", "K-Lite", "Nibo"] },
          { id: "butane-all", label: "All Butane", types: [],
            brands: ["Spider", "Supernova", "London", "Whip-It", "Soul", "Ronson", "Zippo", "K-Lite", "Nibo"],
            filters: ["Brand", "Butane Type", "Can Size", "Weight", "Refinement / Purity", "Pack Quantity", "Container Type", "Price", "Availability"] },
        ]
      },
    ]
  },
  {
    id: "cannabis", label: "CANNABIS ACCESSORIES",
    children: [
      { id: "glass", label: "Glass",
        types: ["Glass Bongs", "Water Pipes", "Glass Pipes", "Hand Pipes", "Bubblers"],
        filters: ["Brand", "Product Type", "Size / Height", "Material", "Color", "Percolator Type", "Joint Size", "Joint Type", "Design", "Price", "Availability"] },
      { id: "dab", label: "Dab & Concentrate",
        types: ["Dab Rigs", "Dab Tools", "Concentrate Containers", "Wax Accessories"],
        filters: ["Brand", "Product Type", "Material", "Size", "Joint Size", "Color", "Price", "Availability"] },
      { id: "grinders", label: "Grinders",
        types: ["2-Piece Grinders", "3-Piece Grinders", "4-Piece Grinders", "Electric Grinders"],
        filters: ["Brand", "Grinder Type", "Material", "Size", "Number of Pieces", "Color", "Price", "Availability"] },
      { id: "scales", label: "Scales",
        types: ["Pocket Scales", "Digital Scales", "Precision Scales"],
        filters: ["Brand", "Capacity", "Accuracy", "Scale Type", "Unit Options", "Size", "Price", "Availability"] },
      { id: "hookahs", label: "Hookahs",
        types: ["Hookah Sets", "Hookah Pipes", "Hookah Accessories", "Hookah Parts"],
        filters: ["Brand", "Size", "Material", "Hose Count", "Color", "Product Type", "Price", "Availability"] },
      { id: "storage", label: "Storage",
        types: ["Storage Jars", "Storage Containers", "Smell-Proof Storage", "Cases"],
        filters: ["Brand", "Material", "Size", "Capacity", "Closure Type", "Color", "Price", "Availability"] },
      { id: "cleaning", label: "Cleaning",
        types: ["Glass Cleaners", "Cleaning Brushes", "Cleaning Kits", "Cleaning Accessories"],
        filters: ["Brand", "Product Type", "Size", "Pack Quantity", "Price", "Availability"] },
      { id: "parts", label: "Replacement Parts",
        types: ["Downstems", "Bowls", "Screens", "Ash Catchers", "Replacement Glass", "Other Replacement Parts"],
        filters: ["Brand", "Part Type", "Compatibility", "Size", "Joint Size", "Material", "Price", "Availability"] },
    ]
  },
  {
    id: "convenience", label: "CONVENIENCE",
    children: [
      { id: "air", label: "Car Air Fresheners",
        types: ["Hanging Air Fresheners", "Fiber Can Air Fresheners", "Vent Clips", "Air Freshener Sprays"],
        filters: ["Brand", "Scent", "Format", "Pack Quantity", "Size", "Price", "Availability"] },
      { id: "lighters", label: "Lighters",
        types: ["Pocket Lighters", "Utility Lighters", "Electric Lighters"],
        filters: ["Brand", "Lighter Type", "Refillable", "Ignition Type", "Color", "Pack Quantity", "Price", "Availability"] },
      { id: "batteries", label: "Batteries",
        types: ["AA", "AAA", "Specialty Batteries", "Rechargeable Batteries"],
        filters: ["Brand", "Battery Type", "Size", "Capacity", "Rechargeable", "Pack Quantity", "Price", "Availability"] },
      { id: "general", label: "General Convenience", types: [],
        filters: ["Brand", "Price", "Availability"],
        note: "Only populated once client inventory confirms which product types belong here." },
    ]
  },
];

const AVAILABILITY_OPTIONS = ["In Stock", "Out of Stock"];

/* ========================= HELPERS ========================= */

function findL2(l1Id, l2Id) {
  const l1 = CATALOG.find(n => n.id === l1Id);
  return l1 ? l1.children.find(n => n.id === l2Id) : null;
}

function firstLeaf(l2) {
  if (!l2.children) return l2;
  return l2.children[0];
}

// deterministic pseudo-price so the same card always shows the same number
function priceFor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return (9 + (h % 71) + 0.99).toFixed(2);
}

function chevronSvg() {
  return '<span class="chev"><svg viewBox="0 0 20 20"><polyline points="7 5 13 10 7 15"></polyline></svg></span>';
}

function chevronDownSvg() {
  return '<span class="chev"><svg viewBox="0 0 20 20"><polyline points="5 7 10 13 15 7"></polyline></svg></span>';
}

/* ========================= MEGA MENU ========================= */

const l1List = document.getElementById("l1List");
const megamenu = document.getElementById("megamenu");
const megamenuBackdrop = document.getElementById("megamenuBackdrop");
const mmCol1 = document.getElementById("mmCol1");
const mmCol2 = document.getElementById("mmCol2");
const mmCol3 = document.getElementById("mmCol3");

let mmState = { l1: CATALOG[0].id, l2: CATALOG[0].children[0].id, l3: null, brand: null, open: false };

function brandForLeaf(l2) {
  return (!l2.children && l2.brands) ? l2.brands[0] : null;
}

function renderL1() {
  l1List.innerHTML = CATALOG.map(l1 => `
    <li data-l1="${l1.id}" class="${l1.id === mmState.l1 && mmState.open ? "active" : ""}">${l1.label}</li>
  `).join("");

  l1List.querySelectorAll("li").forEach(li => {
    li.addEventListener("click", () => {
      const id = li.dataset.l1;
      if (mmState.open && mmState.l1 === id) {
        closeMegaMenu();
      } else {
        const l1 = CATALOG.find(n => n.id === id);
        mmState.l1 = id;
        const first = l1.children[0];
        mmState.l2 = first.id;
        mmState.l3 = first.children ? first.children[0].id : null;
        mmState.brand = brandForLeaf(first);
        openMegaMenu();
      }
    });
  });
}

function openMegaMenu() {
  mmState.open = true;
  megamenu.classList.add("open");
  megamenuBackdrop.classList.add("open");
  renderL1();
  renderMegaMenuColumns();
}

function closeMegaMenu() {
  mmState.open = false;
  megamenu.classList.remove("open");
  megamenuBackdrop.classList.remove("open");
  renderL1();
}

megamenuBackdrop.addEventListener("click", closeMegaMenu);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeMegaMenu(); });

function renderMegaMenuColumns() {
  const l1 = CATALOG.find(n => n.id === mmState.l1);
  const activeL2 = l1.children.find(n => n.id === mmState.l2);

  // Column 1: L2 category list
  mmCol1.innerHTML = `
    <p class="mm-heading">Shop ${l1.label.charAt(0) + l1.label.slice(1).toLowerCase()}</p>
    ${l1.children.map(l2 => `
      <div class="mm-row ${l2.id === mmState.l2 ? "active" : ""}" data-l2="${l2.id}">
        <span>${l2.label}</span>
        ${l2.children ? chevronSvg() : ""}
      </div>
    `).join("")}
  `;
  mmCol1.querySelectorAll("[data-l2]").forEach(row => {
    row.addEventListener("click", () => {
      mmState.l2 = row.dataset.l2;
      const l2 = l1.children.find(n => n.id === mmState.l2);
      mmState.l3 = l2.children ? l2.children[0].id : null;
      mmState.brand = brandForLeaf(l2);
      renderMegaMenuColumns();
    });
  });

  // Column 2 + 3 depend on whether this L2 has L3 children
  if (activeL2.children) {
    const activeL3 = activeL2.children.find(n => n.id === mmState.l3) || activeL2.children[0];

    mmCol2.innerHTML = `
      <p class="mm-heading">Browse ${activeL2.label}</p>
      ${activeL2.children.map(l3 => `
        <div class="mm-row ${l3.id === activeL3.id ? "active" : ""}" data-l3="${l3.id}">
          <span>${l3.label}</span>
        </div>
      `).join("")}
      <a class="mm-viewall" href="#" data-goto="${l1.id}|${activeL2.id}|${activeL2.children[0].id}">
        View All ${activeL2.label}
        <svg viewBox="0 0 20 20"><polyline points="7 5 13 10 7 15"></polyline></svg>
      </a>
    `;
    mmCol2.querySelectorAll("[data-l3]").forEach(row => {
      row.addEventListener("click", () => {
        mmState.l3 = row.dataset.l3;
        renderMegaMenuColumns();
      });
    });

    if (activeL3.isBrandHub) {
      mmCol3.innerHTML = `
        <p class="mm-heading">Shop by Brand</p>
        <div class="mm-brand-grid">
          ${activeL3.brands.map(b => `<a href="#" data-goto="${l1.id}|${activeL2.id}|${activeL3.id}">${b}</a>`).join("")}
        </div>
        <a class="mm-viewall" href="#" data-goto="${l1.id}|${activeL2.id}|${activeL3.id}">
          View All Brands
          <svg viewBox="0 0 20 20"><polyline points="7 5 13 10 7 15"></polyline></svg>
        </a>
      `;
    } else {
      mmCol3.innerHTML = `
        <p class="mm-heading">${activeL3.types.length ? "Shop by Type" : "Shop by Filter"}</p>
        <div class="mm-chip-row">
          ${(activeL3.types.length ? activeL3.types : activeL3.filters).slice(0, 6).map(t => `<span class="mm-chip">${t}</span>`).join("")}
        </div>
        <a class="mm-viewall" href="#" data-goto="${l1.id}|${activeL2.id}|${activeL3.id}">
          View All ${activeL3.label}
          <svg viewBox="0 0 20 20"><polyline points="7 5 13 10 7 15"></polyline></svg>
        </a>
      `;
    }
  } else if (activeL2.brands) {
    // L2 leaf with its own brand list: Shop By Brand + Shop by Type, like the reference screenshot.
    const activeBrand = activeL2.brands.find(b => b === mmState.brand) || activeL2.brands[0];

    mmCol2.innerHTML = `
      <p class="mm-heading">Shop By Brand</p>
      ${activeL2.brands.map(b => `
        <div class="mm-row ${b === activeBrand ? "active" : ""}" data-brand="${b}">
          <span>${b}</span>
        </div>
      `).join("")}
      <a class="mm-viewall" href="#" data-goto="${l1.id}|${activeL2.id}|">
        View All Brand
        <svg viewBox="0 0 20 20"><polyline points="7 5 13 10 7 15"></polyline></svg>
      </a>
    `;
    mmCol2.querySelectorAll("[data-brand]").forEach(row => {
      row.addEventListener("click", () => {
        mmState.brand = row.dataset.brand;
        renderMegaMenuColumns();
      });
    });

    mmCol3.innerHTML = `
      <p class="mm-heading">Shop ${activeBrand}</p>
      ${activeL2.types.map(t => `
        <div class="mm-row" data-goto="${l1.id}|${activeL2.id}|">
          <span>${activeBrand} ${t}</span>
        </div>
      `).join("")}
      <a class="mm-viewall" href="#" data-goto="${l1.id}|${activeL2.id}|">
        View All Products
        <svg viewBox="0 0 20 20"><polyline points="7 5 13 10 7 15"></polyline></svg>
      </a>
    `;
  } else {
    // L2 leaf: no L3, no brand list. Col2 = product types, Col3 = filter highlights.
    mmCol2.innerHTML = `
      <p class="mm-heading">Shop by Type</p>
      ${activeL2.types.length
        ? activeL2.types.map(t => `<div class="mm-row" data-type="${t}"><span>${t}</span></div>`).join("")
        : `<p class="mm-note">${activeL2.note || "Product types to be confirmed from inventory."}</p>`}
      <a class="mm-viewall" href="#" data-goto="${l1.id}|${activeL2.id}|">
        View All ${activeL2.label}
        <svg viewBox="0 0 20 20"><polyline points="7 5 13 10 7 15"></polyline></svg>
      </a>
    `;
    mmCol3.innerHTML = `
      <p class="mm-heading">Popular Filters</p>
      <div class="mm-chip-row">
        ${activeL2.filters.slice(0, 8).map(f => `<span class="mm-chip">${f}</span>`).join("")}
      </div>
    `;
  }

  // wire "go to PLP" links inside the menu
  megamenu.querySelectorAll("[data-goto]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const [l1id, l2id, l3id] = el.dataset.goto.split("|");
      closeMegaMenu();
      goToCategory(l1id, l2id, l3id || null);
    });
  });
}

renderL1();

/* ========================= SIDEBAR TREE ========================= */

const catTree = document.getElementById("catTree");
let plpState = { l1: "vape", l2: "disposable", l3: null };

function renderCatTree() {
  catTree.innerHTML = CATALOG.map(l1 => {
    const l1Expanded = l1.id === plpState.l1;
    return `
      <div class="tree-l1">
        <button class="tree-l1-btn ${l1Expanded ? "expanded" : ""}" data-l1="${l1.id}">
          <span>${l1.label}</span>
          ${chevronSvg()}
        </button>
        <div class="tree-l2-list ${l1Expanded ? "expanded" : ""}" data-l1group="${l1.id}">
          ${l1.children.map(l2 => {
            const l2Active = plpState.l1 === l1.id && plpState.l2 === l2.id;
            return `
              <div class="tree-l2-row">
                <button class="tree-l2-btn ${l2Active ? "active" : ""}" data-l1="${l1.id}" data-l2="${l2.id}">
                  <span>${l2.label}</span>
                  ${l2.children ? chevronDownSvg() : ""}
                </button>
                ${l2.children ? `
                  <div class="tree-l3-list ${l2Active ? "expanded" : ""}" data-l2group="${l2.id}">
                    ${l2.children.map(l3 => `
                      <button class="tree-l3-btn ${plpState.l3 === l3.id ? "active" : ""}" data-l1="${l1.id}" data-l2="${l2.id}" data-l3="${l3.id}">${l3.label}</button>
                    `).join("")}
                  </div>
                ` : ""}
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).join("");

  catTree.querySelectorAll(".tree-l1-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.l1;
      if (plpState.l1 === id) { plpState.l1 = null; }
      else {
        const l1 = CATALOG.find(n => n.id === id);
        plpState.l1 = id;
      }
      renderCatTree();
    });
  });

  catTree.querySelectorAll(".tree-l2-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const l2 = findL2(btn.dataset.l1, btn.dataset.l2);
      const l3 = l2.children ? l2.children[0].id : null;
      goToCategory(btn.dataset.l1, btn.dataset.l2, l3);
    });
  });

  catTree.querySelectorAll(".tree-l3-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      goToCategory(btn.dataset.l1, btn.dataset.l2, btn.dataset.l3);
    });
  });
}

function goToCategory(l1id, l2id, l3id) {
  plpState = { l1: l1id, l2: l2id, l3: l3id };
  renderCatTree();
  renderPLP();
  document.getElementById("plp").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ========================= FILTERS + PRODUCT GRID ========================= */

const filterListEl = document.getElementById("filterList");
const breadcrumbEl = document.getElementById("breadcrumb");
const contentTitleEl = document.getElementById("contentTitle");
const productGridEl = document.getElementById("productGrid");

let expandedFilterGroups = new Set();

function getActiveLeaf() {
  const l1 = CATALOG.find(n => n.id === plpState.l1);
  const l2 = l1.children.find(n => n.id === plpState.l2);
  if (l2.children) {
    return l2.children.find(n => n.id === plpState.l3) || l2.children[0];
  }
  return l2;
}

function renderBreadcrumb() {
  const l1 = CATALOG.find(n => n.id === plpState.l1);
  const l2 = l1.children.find(n => n.id === plpState.l2);
  const parts = [l1.label, l2.label];
  if (l2.children) {
    const l3 = l2.children.find(n => n.id === plpState.l3) || l2.children[0];
    parts.push(l3.label);
  }
  breadcrumbEl.innerHTML = parts.map((p, i) =>
    i === parts.length - 1 ? `<span class="current">${p}</span>` : `<span>${p}</span><span class="sep">/</span>`
  ).join("");
}

function renderFilters() {
  const leaf = getActiveLeaf();

  if (leaf.isBrandHub) {
    filterListEl.innerHTML = `<p class="mm-note">This is a brand-discovery hub. Filters apply on the "All ${leaf.label.replace('Shop by Brand', '').trim()}" listing.</p>`;
    return;
  }

  const groups = leaf.filters.map(f => {
    let bodyHtml = "";

    if (f === "Brand" && leaf.brands) {
      bodyHtml = `<input class="filter-text-input" type="text" placeholder="Search brand..." />` +
        leaf.brands.map(b => `
          <label class="filter-check"><input type="checkbox" /> ${b}</label>
        `).join("");
    } else if (f === "Brand") {
      bodyHtml = `<input class="filter-text-input" type="text" placeholder="Search brand..." />`;
    } else if (f === "Availability") {
      bodyHtml = AVAILABILITY_OPTIONS.map(a => `<label class="filter-check"><input type="checkbox" /> ${a}</label>`).join("");
    } else if (f === "Price") {
      bodyHtml = `<div class="filter-range"><span>$0</span><input type="range" min="0" max="200" value="100" /><span>$200+</span></div>`;
    } else if (leaf.enum && leaf.enum[f]) {
      bodyHtml = leaf.enum[f].map(v => `<label class="filter-check"><input type="checkbox" /> ${v}</label>`).join("");
    } else {
      bodyHtml = `<input class="filter-text-input" type="text" placeholder="Filter by ${f.toLowerCase()}..." />`;
    }

    const key = leaf.id + "|" + f;
    const isExpanded = expandedFilterGroups.has(key);

    return `
      <div class="filter-group">
        <button class="filter-group-head ${isExpanded ? "expanded" : ""}" data-key="${key}">
          <span>${f}</span>
          ${chevronDownSvg()}
        </button>
        <div class="filter-group-body ${isExpanded ? "expanded" : ""}">${bodyHtml}</div>
      </div>
    `;
  }).join("");

  filterListEl.innerHTML = groups;

  filterListEl.querySelectorAll(".filter-group-head").forEach(head => {
    head.addEventListener("click", () => {
      const key = head.dataset.key;
      if (expandedFilterGroups.has(key)) expandedFilterGroups.delete(key);
      else expandedFilterGroups.add(key);
      renderFilters();
    });
  });
}

function renderProductGrid() {
  const leaf = getActiveLeaf();
  contentTitleEl.textContent = leaf.label;

  if (leaf.isBrandHub) {
    productGridEl.innerHTML = leaf.brands.map(b => `
      <div class="pcard">
        <div class="pcard-media"><span class="pcard-tag">Brand</span></div>
        <div class="pcard-body">
          <div class="pcard-title">${b}</div>
          <div class="pcard-meta">${leaf.label}</div>
        </div>
      </div>
    `).join("");
    return;
  }

  if (!leaf.types || !leaf.types.length) {
    productGridEl.innerHTML = `<div class="empty-note">${leaf.note || `No product types confirmed yet for ${leaf.label}. Use the filters above once inventory is loaded.`}</div>`;
    return;
  }

  const brandPool = leaf.brands || null;
  const cards = [];
  leaf.types.forEach(type => {
    if (brandPool) {
      brandPool.slice(0, 2).forEach(brand => {
        cards.push({ title: `${brand} ${type}`, meta: leaf.label, price: priceFor(brand + type) });
      });
    } else {
      cards.push({ title: type, meta: leaf.label, price: priceFor(type + leaf.id) });
    }
  });

  productGridEl.innerHTML = cards.map(c => `
    <div class="pcard">
      <div class="pcard-media"><span class="pcard-tag">New</span></div>
      <div class="pcard-body">
        <div class="pcard-title">${c.title}</div>
        <div class="pcard-meta">${c.meta}</div>
        <div class="pcard-price">$${c.price}</div>
      </div>
    </div>
  `).join("");
}

function renderPLP() {
  renderBreadcrumb();
  renderFilters();
  renderProductGrid();
}

/* ========================= INIT ========================= */

renderCatTree();
renderPLP();
