"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// api/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => handler
});
module.exports = __toCommonJS(index_exports);

// server/log.ts
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// server/wps-api.ts
var WPS_BASE_URL = "https://api.wps-inc.com";
var searchCache = /* @__PURE__ */ new Map();
var CACHE_TTL = 30 * 60 * 1e3;
function getApiKey() {
  const key = process.env.WPS_API_KEY;
  if (!key) throw new Error("WPS_API_KEY is not configured");
  return key;
}
async function wpsRequest(endpoint, params) {
  const url = new URL(`${WPS_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  log(`WPS Request: ${url.toString()}`, "wps");
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) {
    const errorText = await response.text();
    log(`WPS API error ${response.status}: ${errorText}`, "wps");
    throw new Error(`WPS API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
async function getItems(params) {
  const queryParams = {
    "page[size]": "48",
    include: "images,product"
  };
  if (params.page && params.page > 1) queryParams["page[cursor]"] = params.cursor || "";
  if (params.productType) queryParams["filter[product_type]"] = params.productType;
  return wpsRequest("/items", queryParams);
}
var EXCLUDED_PRODUCT_TYPES = /* @__PURE__ */ new Set([
  "Shirts",
  "Sweaters",
  "Jackets",
  "Headgear",
  "Gloves",
  "Pants",
  "Jerseys",
  "Socks",
  "Boots",
  "Goggles",
  "Helmets",
  "Helmet Accessories",
  "Promotional",
  "Guards/Braces",
  "Chest/Back Protectors",
  "Knee/Shin Protection",
  "Elbow/Wrist Protection",
  "Neck Support",
  "Base Layers",
  "Rain Gear",
  "Casual Wear",
  "Underwear",
  "Bags/Luggage/Cases",
  "Gifts/Novelties"
]);
var EXCLUDED_NAME_PATTERNS = /\b(REPLICA|SCALE|DIE.?CAST|T-SHIRT|SWEATSHIRT|JERSEY|HOODIE|SNAPBACK|HAT|BEANIE|JACKET|GLOVE|BOOT|GOGGLE|HELMET|PANT\b|SOCK\b)/i;
async function searchItemsByVehicle(searchTerms, makeName) {
  const cacheKey = `search:${searchTerms.sort().join("|")}:${makeName || ""}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log(`Cache hit for "${cacheKey}" (${cached.data.totalFound} parts)`, "wps");
    return cached.data;
  }
  const allItems = /* @__PURE__ */ new Map();
  const allTermsSet = /* @__PURE__ */ new Set();
  for (const term of searchTerms) {
    allTermsSet.add(term);
  }
  if (makeName) {
    allTermsSet.add(makeName);
    for (const term of searchTerms) {
      const parts = term.split(/[\s-]+/).filter((p) => p.length >= 2 && p.toLowerCase() !== makeName?.toLowerCase());
      for (const part of parts) {
        allTermsSet.add(`${makeName} ${part}`);
      }
    }
  }
  const uniqueTerms = Array.from(allTermsSet).slice(0, 8);
  log(`Vehicle search terms: ${JSON.stringify(uniqueTerms)} (make: ${makeName})`, "wps");
  const itemSearches = uniqueTerms.map(
    (term) => wpsRequest("/items", {
      "page[size]": "200",
      "filter[name][like]": `%${term}%`,
      "filter[status]": "STK",
      include: "images,product,inventory"
    }).catch((err) => {
      log(`Item search failed for "${term}": ${err.message}`, "wps");
      return { data: [] };
    })
  );
  const productSearches = uniqueTerms.map(
    (term) => wpsRequest("/products", {
      "page[size]": "200",
      "filter[name][like]": `%${term}%`,
      include: "items.images,items"
    }).catch((err) => {
      log(`Product search failed for "${term}": ${err.message}`, "wps");
      return { data: [] };
    })
  );
  const [itemResults, productResults] = await Promise.all([
    Promise.all(itemSearches),
    Promise.all(productSearches)
  ]);
  function isRelevantPart(item) {
    if (!item.product_type) return false;
    if (EXCLUDED_PRODUCT_TYPES.has(item.product_type)) return false;
    if (EXCLUDED_NAME_PATTERNS.test(item.name || "")) return false;
    const price = parseFloat(item.list_price);
    if (isNaN(price) || price <= 0) return false;
    return true;
  }
  for (const result2 of itemResults) {
    if (result2.data) {
      for (const item of result2.data) {
        if (!allItems.has(item.id) && isRelevantPart(item)) {
          allItems.set(item.id, item);
        }
      }
    }
  }
  for (const result2 of productResults) {
    if (result2.data) {
      for (const product of result2.data) {
        if (product.items?.data) {
          for (const item of product.items.data) {
            if (item.status === "STK" && !allItems.has(item.id) && isRelevantPart(item)) {
              if (!item.product) {
                item.product = { data: { id: product.id, name: product.name, description: product.description } };
              }
              allItems.set(item.id, item);
            }
          }
        }
      }
    }
  }
  const items = Array.from(allItems.values());
  const grouped = {};
  for (const item of items) {
    const type = item.product_type || "Other";
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(item);
  }
  const partsCategoryOrder = [
    "Engine",
    "Piston kits & Components",
    "Gaskets/Seals",
    "Clutch",
    "Exhaust",
    "Air Filters",
    "Oil Filters",
    "Intake/Carb/Fuel System",
    "Brakes",
    "Suspension",
    "Sprockets",
    "Chains",
    "Drive",
    "Handlebars",
    "Foot Controls",
    "Cable/Hydraulic Control Lines",
    "Electrical",
    "Switches",
    "Illumination",
    "Body",
    "Graphics/Decals",
    "Rims",
    "Tires",
    "Hardware/Fasteners/Fittings",
    "Tools",
    "Chemicals",
    "Accessories"
  ];
  const sortedGrouped = {};
  for (const cat of partsCategoryOrder) {
    if (grouped[cat]) {
      grouped[cat].sort((a, b) => parseFloat(a.list_price) - parseFloat(b.list_price));
      sortedGrouped[cat] = grouped[cat];
    }
  }
  for (const type of Object.keys(grouped)) {
    if (!sortedGrouped[type]) {
      grouped[type].sort((a, b) => parseFloat(a.list_price) - parseFloat(b.list_price));
      sortedGrouped[type] = grouped[type];
    }
  }
  const result = { data: items, grouped: sortedGrouped, totalFound: items.length };
  searchCache.set(cacheKey, { data: result, timestamp: Date.now() });
  if (searchCache.size > 200) {
    const oldest = Array.from(searchCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp).slice(0, 50);
    for (const [key] of oldest) searchCache.delete(key);
  }
  return result;
}
async function getItemById(itemId) {
  return wpsRequest(`/items/${itemId}`, {
    include: "images,product,inventory,features"
  });
}
async function getVehicleMakes() {
  return wpsRequest("/vehiclemakes", { "page[size]": "200" });
}
async function getVehicleItems(vehicleId, page = 1) {
  return wpsRequest(`/vehicles/${vehicleId}/items`, {
    "page[size]": "50",
    "page[number]": page.toString(),
    include: "images,product"
  });
}
function isConfigured() {
  return !!process.env.WPS_API_KEY;
}
var PRODUCT_TYPE_CATEGORIES = {
  dirt_bike: [
    "Engine",
    "Pistons",
    "Cylinders",
    "Gaskets",
    "Cranks",
    "Valves",
    "Camshafts",
    "Exhaust",
    "Air Filters",
    "Oil Filters",
    "Brake Pads",
    "Brake Rotors",
    "Chains",
    "Sprockets",
    "Handlebars",
    "Grips",
    "Levers",
    "Plastics",
    "Graphics",
    "Tires",
    "Tubes",
    "Suspension",
    "Clutch",
    "Bearings",
    "Cables",
    "Footpegs",
    "Radiator",
    "Skid Plates",
    "Bars & Clamps"
  ],
  atv: [
    "Engine",
    "Pistons",
    "Cylinders",
    "Gaskets",
    "Cranks",
    "Valves",
    "Exhaust",
    "Air Filters",
    "Oil Filters",
    "Brake Pads",
    "Brake Rotors",
    "Tires",
    "A-Arms",
    "Bumpers",
    "Winches",
    "Axles",
    "CV Joints",
    "Tie Rods",
    "Ball Joints",
    "Wheel Bearings",
    "Clutch",
    "Belts",
    "Radiator",
    "Skid Plates"
  ],
  utv: [
    "Engine",
    "Pistons",
    "Gaskets",
    "Clutch",
    "Belts",
    "Exhaust",
    "Air Filters",
    "Oil Filters",
    "Brake Pads",
    "Brake Rotors",
    "Tires",
    "Windshields",
    "Roofs",
    "Doors",
    "Bumpers",
    "Winches",
    "Axles",
    "Radiator",
    "Light Bars",
    "Harnesses",
    "Seats"
  ],
  street: [
    "Engine",
    "Pistons",
    "Cylinders",
    "Gaskets",
    "Valves",
    "Camshafts",
    "Exhaust",
    "Air Filters",
    "Oil Filters",
    "Brake Pads",
    "Brake Rotors",
    "Chains",
    "Sprockets",
    "Handlebars",
    "Grips",
    "Levers",
    "Fairings",
    "Mirrors",
    "Tires",
    "Suspension",
    "Seats",
    "Windshields",
    "Frame Sliders",
    "Tail Lights"
  ],
  dual_sport: [
    "Engine",
    "Pistons",
    "Cylinders",
    "Gaskets",
    "Valves",
    "Exhaust",
    "Air Filters",
    "Oil Filters",
    "Brake Pads",
    "Brake Rotors",
    "Chains",
    "Sprockets",
    "Handlebars",
    "Grips",
    "Levers",
    "Hand Guards",
    "Tires",
    "Tubes",
    "Suspension",
    "Skid Plates",
    "Luggage",
    "Panniers",
    "Crash Bars"
  ]
};

// server/bigcommerce-api.ts
function getConfig() {
  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;
  const accessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;
  if (!storeHash || !accessToken) {
    throw new Error("BigCommerce credentials not configured");
  }
  return { storeHash, accessToken };
}
async function bcRequest(endpoint, method = "GET", body) {
  const { storeHash, accessToken } = getConfig();
  const url = `https://api.bigcommerce.com/stores/${storeHash}/v3${endpoint}`;
  const headers = {
    "X-Auth-Token": accessToken,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : void 0
  });
  if (!response.ok) {
    const errorText = await response.text();
    log(`BigCommerce API error ${response.status}: ${errorText}`, "bigcommerce");
    throw new Error(`BigCommerce API error: ${response.status}`);
  }
  return response.json();
}
async function getProductBySku(sku) {
  const wpSku = sku.startsWith("WP") ? sku : `WP${sku}`;
  const result = await bcRequest(`/catalog/products?sku=${encodeURIComponent(wpSku)}&include=variants`);
  if (result?.data?.length > 0) {
    return result.data[0];
  }
  const result2 = await bcRequest(`/catalog/products?sku=${encodeURIComponent(sku)}&include=variants`);
  if (result2?.data?.length > 0) {
    return result2.data[0];
  }
  return null;
}
async function getProductsBySku(skus) {
  const results = {};
  const batchSize = 10;
  for (let i = 0; i < skus.length; i += batchSize) {
    const batch = skus.slice(i, i + batchSize);
    const promises = batch.map(async (sku) => {
      try {
        const product = await getProductBySku(sku);
        if (product) {
          results[sku] = {
            id: product.id,
            name: product.name,
            price: product.price,
            url: product.custom_url?.url || `/product/${product.id}`
          };
        }
      } catch (err) {
        log(`SKU lookup failed for ${sku}: ${err.message}`, "bigcommerce");
      }
    });
    await Promise.all(promises);
  }
  return results;
}
async function createCart(lineItems) {
  return bcRequest("/carts?include=redirect_urls", "POST", {
    line_items: lineItems.map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity
    }))
  });
}
function getStoreDomain() {
  return "www.fuelpowersportscs.com";
}
function isConfigured2() {
  return !!process.env.BIGCOMMERCE_STORE_HASH && !!process.env.BIGCOMMERCE_ACCESS_TOKEN;
}

// server/vehicle-data.ts
var VEHICLE_TYPES = [
  { id: "dirt_bike", name: "Dirt Bike" },
  { id: "atv", name: "ATV" },
  { id: "utv", name: "UTV" },
  { id: "street", name: "Street Motorcycle" },
  { id: "dual_sport", name: "Dual Sport" }
];
var YEARS = Array.from({ length: 35 }, (_, i) => (/* @__PURE__ */ new Date()).getFullYear() + 1 - i);
var MAKES = [
  { id: "honda", name: "Honda", types: ["dirt_bike", "atv", "utv", "street", "dual_sport"] },
  { id: "yamaha", name: "Yamaha", types: ["dirt_bike", "atv", "utv", "street", "dual_sport"] },
  { id: "kawasaki", name: "Kawasaki", types: ["dirt_bike", "atv", "utv", "street", "dual_sport"] },
  { id: "ktm", name: "KTM", types: ["dirt_bike", "street", "dual_sport"] },
  { id: "husqvarna", name: "Husqvarna", types: ["dirt_bike", "dual_sport"] },
  { id: "suzuki", name: "Suzuki", types: ["dirt_bike", "atv", "street", "dual_sport"] },
  { id: "polaris", name: "Polaris", types: ["atv", "utv"] },
  { id: "can-am", name: "Can-Am", types: ["atv", "utv"] },
  { id: "harley", name: "Harley-Davidson", types: ["street"] },
  { id: "ducati", name: "Ducati", types: ["street"] },
  { id: "bmw", name: "BMW", types: ["street", "dual_sport"] },
  { id: "triumph", name: "Triumph", types: ["street"] },
  { id: "indian", name: "Indian", types: ["street"] },
  { id: "aprilia", name: "Aprilia", types: ["street"] },
  { id: "gasgas", name: "GasGas", types: ["dirt_bike", "dual_sport"] },
  { id: "beta", name: "Beta", types: ["dirt_bike", "dual_sport"] },
  { id: "sherco", name: "Sherco", types: ["dirt_bike", "dual_sport"] },
  { id: "cfmoto", name: "CFMoto", types: ["atv", "utv", "street"] },
  { id: "arctic-cat", name: "Arctic Cat", types: ["atv", "utv"] },
  { id: "textron", name: "Textron", types: ["atv", "utv"] }
];
var MODELS = [
  // Honda Dirt Bikes
  { id: "crf450r", name: "CRF450R", makeId: "honda", types: ["dirt_bike"], searchTerms: ["CRF450R", "CRF 450R", "Honda CRF"] },
  { id: "crf450rx", name: "CRF450RX", makeId: "honda", types: ["dirt_bike"], searchTerms: ["CRF450RX", "CRF 450RX"] },
  { id: "crf250r", name: "CRF250R", makeId: "honda", types: ["dirt_bike"], searchTerms: ["CRF250R", "CRF 250R"] },
  { id: "crf250rx", name: "CRF250RX", makeId: "honda", types: ["dirt_bike"], searchTerms: ["CRF250RX", "CRF 250RX"] },
  { id: "crf150r", name: "CRF150R", makeId: "honda", types: ["dirt_bike"], searchTerms: ["CRF150R", "CRF 150R"] },
  { id: "crf125f", name: "CRF125F", makeId: "honda", types: ["dirt_bike"], searchTerms: ["CRF125F", "CRF 125F"] },
  { id: "crf110f", name: "CRF110F", makeId: "honda", types: ["dirt_bike"], searchTerms: ["CRF110F", "CRF 110F"] },
  { id: "crf50f", name: "CRF50F", makeId: "honda", types: ["dirt_bike"], searchTerms: ["CRF50F", "CRF 50F"] },
  { id: "crf70f", name: "CRF70F", makeId: "honda", types: ["dirt_bike"], searchTerms: ["CRF70F", "CRF 70F"] },
  { id: "cr85r", name: "CR85R", makeId: "honda", types: ["dirt_bike"], searchTerms: ["CR85R", "CR 85R"] },
  { id: "crf80f", name: "CRF80F", makeId: "honda", types: ["dirt_bike"], searchTerms: ["CRF80F", "CRF 80F"] },
  { id: "crf65f", name: "CRF65F", makeId: "honda", types: ["dirt_bike"], searchTerms: ["CRF65F", "CRF 65F"] },
  // Honda ATVs
  { id: "trx450r", name: "TRX450R", makeId: "honda", types: ["atv"], searchTerms: ["TRX450R", "TRX 450R"] },
  { id: "trx250x", name: "TRX250X", makeId: "honda", types: ["atv"], searchTerms: ["TRX250X", "TRX 250X"] },
  { id: "trx90x", name: "TRX90X", makeId: "honda", types: ["atv"], searchTerms: ["TRX90X", "TRX 90X"] },
  { id: "rancher", name: "Rancher", makeId: "honda", types: ["atv"], searchTerms: ["Rancher", "TRX420", "Honda Rancher"] },
  { id: "foreman", name: "Foreman", makeId: "honda", types: ["atv"], searchTerms: ["Foreman", "TRX520", "Honda Foreman"] },
  { id: "rincon", name: "Rincon", makeId: "honda", types: ["atv"], searchTerms: ["Rincon", "TRX680", "Honda Rincon"] },
  // Honda UTVs
  { id: "talon-1000r", name: "Talon 1000R", makeId: "honda", types: ["utv"], searchTerms: ["Talon 1000R", "Honda Talon"] },
  { id: "talon-1000x", name: "Talon 1000X", makeId: "honda", types: ["utv"], searchTerms: ["Talon 1000X"] },
  { id: "pioneer-1000", name: "Pioneer 1000", makeId: "honda", types: ["utv"], searchTerms: ["Pioneer 1000", "Honda Pioneer"] },
  { id: "pioneer-700", name: "Pioneer 700", makeId: "honda", types: ["utv"], searchTerms: ["Pioneer 700"] },
  { id: "pioneer-520", name: "Pioneer 520", makeId: "honda", types: ["utv"], searchTerms: ["Pioneer 520"] },
  // Honda Street
  { id: "cbr1000rr", name: "CBR1000RR-R", makeId: "honda", types: ["street"], searchTerms: ["CBR1000RR", "CBR 1000RR"] },
  { id: "cbr600rr", name: "CBR600RR", makeId: "honda", types: ["street"], searchTerms: ["CBR600RR", "CBR 600RR"] },
  { id: "cb650r", name: "CB650R", makeId: "honda", types: ["street"], searchTerms: ["CB650R", "CB 650R"] },
  { id: "rebel500", name: "Rebel 500", makeId: "honda", types: ["street"], searchTerms: ["Rebel 500", "Honda Rebel"] },
  { id: "rebel1100", name: "Rebel 1100", makeId: "honda", types: ["street"], searchTerms: ["Rebel 1100"] },
  { id: "grom", name: "Grom", makeId: "honda", types: ["street"], searchTerms: ["Grom", "MSX125", "Honda Grom"] },
  { id: "monkey", name: "Monkey", makeId: "honda", types: ["street"], searchTerms: ["Monkey", "Honda Monkey"] },
  // Honda Dual Sport
  { id: "crf450rl", name: "CRF450RL", makeId: "honda", types: ["dual_sport"], searchTerms: ["CRF450RL", "CRF 450RL"] },
  { id: "crf300l", name: "CRF300L", makeId: "honda", types: ["dual_sport"], searchTerms: ["CRF300L", "CRF 300L"] },
  { id: "xr650l", name: "XR650L", makeId: "honda", types: ["dual_sport"], searchTerms: ["XR650L", "XR 650L"] },
  { id: "africa-twin", name: "Africa Twin", makeId: "honda", types: ["dual_sport"], searchTerms: ["Africa Twin", "CRF1100L"] },
  // Yamaha Dirt Bikes
  { id: "yz450f", name: "YZ450F", makeId: "yamaha", types: ["dirt_bike"], searchTerms: ["YZ450F", "YZ 450F"] },
  { id: "yz250f", name: "YZ250F", makeId: "yamaha", types: ["dirt_bike"], searchTerms: ["YZ250F", "YZ 250F"] },
  { id: "yz250", name: "YZ250", makeId: "yamaha", types: ["dirt_bike"], searchTerms: ["YZ250", "YZ 250"] },
  { id: "yz125", name: "YZ125", makeId: "yamaha", types: ["dirt_bike"], searchTerms: ["YZ125", "YZ 125"] },
  { id: "yz85", name: "YZ85", makeId: "yamaha", types: ["dirt_bike"], searchTerms: ["YZ85", "YZ 85"] },
  { id: "yz65", name: "YZ65", makeId: "yamaha", types: ["dirt_bike"], searchTerms: ["YZ65", "YZ 65"] },
  { id: "tt-r230", name: "TT-R230", makeId: "yamaha", types: ["dirt_bike"], searchTerms: ["TTR230", "TT-R230"] },
  { id: "tt-r125", name: "TT-R125", makeId: "yamaha", types: ["dirt_bike"], searchTerms: ["TTR125", "TT-R125"] },
  { id: "tt-r110", name: "TT-R110", makeId: "yamaha", types: ["dirt_bike"], searchTerms: ["TTR110", "TT-R110"] },
  { id: "tt-r50", name: "TT-R50", makeId: "yamaha", types: ["dirt_bike"], searchTerms: ["TTR50", "TT-R50"] },
  { id: "pw50", name: "PW50", makeId: "yamaha", types: ["dirt_bike"], searchTerms: ["PW50", "PW 50"] },
  // Yamaha ATVs
  { id: "raptor-700r", name: "Raptor 700R", makeId: "yamaha", types: ["atv"], searchTerms: ["Raptor 700R", "YFM700R"] },
  { id: "raptor-700", name: "Raptor 700", makeId: "yamaha", types: ["atv"], searchTerms: ["Raptor 700", "YFM700"] },
  { id: "yfz450r", name: "YFZ450R", makeId: "yamaha", types: ["atv"], searchTerms: ["YFZ450R", "YFZ 450R"] },
  { id: "grizzly-700", name: "Grizzly 700", makeId: "yamaha", types: ["atv"], searchTerms: ["Grizzly 700", "YFM700FG"] },
  { id: "kodiak-700", name: "Kodiak 700", makeId: "yamaha", types: ["atv"], searchTerms: ["Kodiak 700"] },
  // Yamaha UTVs
  { id: "yxz1000r", name: "YXZ1000R", makeId: "yamaha", types: ["utv"], searchTerms: ["YXZ1000R", "YXZ 1000R"] },
  { id: "wolverine-rmax", name: "Wolverine RMAX", makeId: "yamaha", types: ["utv"], searchTerms: ["Wolverine RMAX"] },
  { id: "viking", name: "Viking", makeId: "yamaha", types: ["utv"], searchTerms: ["Viking", "Yamaha Viking"] },
  // Yamaha Street
  { id: "yzf-r1", name: "YZF-R1", makeId: "yamaha", types: ["street"], searchTerms: ["YZF-R1", "R1", "Yamaha R1"] },
  { id: "yzf-r7", name: "YZF-R7", makeId: "yamaha", types: ["street"], searchTerms: ["YZF-R7", "R7"] },
  { id: "yzf-r3", name: "YZF-R3", makeId: "yamaha", types: ["street"], searchTerms: ["YZF-R3", "R3"] },
  { id: "mt-09", name: "MT-09", makeId: "yamaha", types: ["street"], searchTerms: ["MT-09", "MT09", "FZ-09"] },
  { id: "mt-07", name: "MT-07", makeId: "yamaha", types: ["street"], searchTerms: ["MT-07", "MT07", "FZ-07"] },
  { id: "mt-03", name: "MT-03", makeId: "yamaha", types: ["street"], searchTerms: ["MT-03", "MT03"] },
  { id: "xsr900", name: "XSR900", makeId: "yamaha", types: ["street"], searchTerms: ["XSR900", "XSR 900"] },
  // Yamaha Dual Sport
  { id: "tenere-700", name: "Tenere 700", makeId: "yamaha", types: ["dual_sport"], searchTerms: ["Tenere 700", "T7"] },
  { id: "wr250r", name: "WR250R", makeId: "yamaha", types: ["dual_sport"], searchTerms: ["WR250R", "WR 250R"] },
  { id: "tw200", name: "TW200", makeId: "yamaha", types: ["dual_sport"], searchTerms: ["TW200", "TW 200"] },
  { id: "xt250", name: "XT250", makeId: "yamaha", types: ["dual_sport"], searchTerms: ["XT250", "XT 250"] },
  // Kawasaki Dirt Bikes
  { id: "kx450", name: "KX450", makeId: "kawasaki", types: ["dirt_bike"], searchTerms: ["KX450", "KX 450"] },
  { id: "kx250", name: "KX250", makeId: "kawasaki", types: ["dirt_bike"], searchTerms: ["KX250", "KX 250"] },
  { id: "kx112", name: "KX112", makeId: "kawasaki", types: ["dirt_bike"], searchTerms: ["KX112", "KX 112"] },
  { id: "kx85", name: "KX85", makeId: "kawasaki", types: ["dirt_bike"], searchTerms: ["KX85", "KX 85"] },
  { id: "kx65", name: "KX65", makeId: "kawasaki", types: ["dirt_bike"], searchTerms: ["KX65", "KX 65"] },
  { id: "klx300r", name: "KLX300R", makeId: "kawasaki", types: ["dirt_bike"], searchTerms: ["KLX300R", "KLX 300R"] },
  { id: "klx140r", name: "KLX140R", makeId: "kawasaki", types: ["dirt_bike"], searchTerms: ["KLX140R", "KLX 140R"] },
  { id: "klx110r", name: "KLX110R", makeId: "kawasaki", types: ["dirt_bike"], searchTerms: ["KLX110R", "KLX 110R"] },
  { id: "kx50", name: "KX50", makeId: "kawasaki", types: ["dirt_bike"], searchTerms: ["KX50", "KX 50"] },
  // Kawasaki ATVs
  { id: "kfx450r", name: "KFX450R", makeId: "kawasaki", types: ["atv"], searchTerms: ["KFX450R", "KFX 450R"] },
  { id: "kfx90", name: "KFX90", makeId: "kawasaki", types: ["atv"], searchTerms: ["KFX90", "KFX 90"] },
  { id: "brute-force-750", name: "Brute Force 750", makeId: "kawasaki", types: ["atv"], searchTerms: ["Brute Force 750"] },
  { id: "brute-force-300", name: "Brute Force 300", makeId: "kawasaki", types: ["atv"], searchTerms: ["Brute Force 300"] },
  // Kawasaki UTVs
  { id: "teryx-krx-1000", name: "Teryx KRX 1000", makeId: "kawasaki", types: ["utv"], searchTerms: ["Teryx KRX 1000", "KRX1000"] },
  { id: "teryx4", name: "Teryx4", makeId: "kawasaki", types: ["utv"], searchTerms: ["Teryx4", "Teryx 4"] },
  { id: "mule-pro", name: "Mule Pro", makeId: "kawasaki", types: ["utv"], searchTerms: ["Mule Pro", "Kawasaki Mule"] },
  // Kawasaki Street
  { id: "zx-10r", name: "Ninja ZX-10R", makeId: "kawasaki", types: ["street"], searchTerms: ["ZX-10R", "ZX10R", "Ninja ZX-10R"] },
  { id: "zx-6r", name: "Ninja ZX-6R", makeId: "kawasaki", types: ["street"], searchTerms: ["ZX-6R", "ZX6R", "Ninja ZX-6R"] },
  { id: "zx-4rr", name: "Ninja ZX-4RR", makeId: "kawasaki", types: ["street"], searchTerms: ["ZX-4RR", "ZX4RR"] },
  { id: "ninja-400", name: "Ninja 400", makeId: "kawasaki", types: ["street"], searchTerms: ["Ninja 400"] },
  { id: "z900", name: "Z900", makeId: "kawasaki", types: ["street"], searchTerms: ["Z900", "Z 900"] },
  { id: "z650", name: "Z650", makeId: "kawasaki", types: ["street"], searchTerms: ["Z650", "Z 650"] },
  { id: "z400", name: "Z400", makeId: "kawasaki", types: ["street"], searchTerms: ["Z400", "Z 400"] },
  { id: "vulcan-s", name: "Vulcan S", makeId: "kawasaki", types: ["street"], searchTerms: ["Vulcan S", "EN650"] },
  // Kawasaki Dual Sport
  { id: "klx300", name: "KLX300", makeId: "kawasaki", types: ["dual_sport"], searchTerms: ["KLX300", "KLX 300"] },
  { id: "klr650", name: "KLR650", makeId: "kawasaki", types: ["dual_sport"], searchTerms: ["KLR650", "KLR 650"] },
  { id: "versys-650", name: "Versys 650", makeId: "kawasaki", types: ["dual_sport"], searchTerms: ["Versys 650"] },
  // KTM Dirt Bikes
  { id: "450-sx-f", name: "450 SX-F", makeId: "ktm", types: ["dirt_bike"], searchTerms: ["450 SX-F", "KTM 450SXF"] },
  { id: "350-sx-f", name: "350 SX-F", makeId: "ktm", types: ["dirt_bike"], searchTerms: ["350 SX-F", "KTM 350SXF"] },
  { id: "250-sx-f", name: "250 SX-F", makeId: "ktm", types: ["dirt_bike"], searchTerms: ["250 SX-F", "KTM 250SXF"] },
  { id: "250-sx", name: "250 SX", makeId: "ktm", types: ["dirt_bike"], searchTerms: ["250 SX", "KTM 250SX"] },
  { id: "150-sx", name: "150 SX", makeId: "ktm", types: ["dirt_bike"], searchTerms: ["150 SX", "KTM 150SX"] },
  { id: "125-sx", name: "125 SX", makeId: "ktm", types: ["dirt_bike"], searchTerms: ["125 SX", "KTM 125SX"] },
  { id: "450-xc-f", name: "450 XC-F", makeId: "ktm", types: ["dirt_bike"], searchTerms: ["450 XC-F", "KTM 450XCF"] },
  { id: "350-xc-f", name: "350 XC-F", makeId: "ktm", types: ["dirt_bike"], searchTerms: ["350 XC-F", "KTM 350XCF"] },
  { id: "300-xc", name: "300 XC", makeId: "ktm", types: ["dirt_bike"], searchTerms: ["300 XC", "KTM 300XC"] },
  { id: "85-sx", name: "85 SX", makeId: "ktm", types: ["dirt_bike"], searchTerms: ["85 SX", "KTM 85SX", "KTM 85"] },
  { id: "65-sx", name: "65 SX", makeId: "ktm", types: ["dirt_bike"], searchTerms: ["65 SX", "KTM 65SX", "KTM 65"] },
  { id: "50-sx", name: "50 SX", makeId: "ktm", types: ["dirt_bike"], searchTerms: ["50 SX", "KTM 50SX", "KTM 50"] },
  { id: "50-sx-mini", name: "50 SX Mini", makeId: "ktm", types: ["dirt_bike"], searchTerms: ["50 SX Mini", "KTM 50 Mini"] },
  // KTM Street
  { id: "1290-super-duke", name: "1290 Super Duke R", makeId: "ktm", types: ["street"], searchTerms: ["1290 Super Duke", "Super Duke"] },
  { id: "890-duke-r", name: "890 Duke R", makeId: "ktm", types: ["street"], searchTerms: ["890 Duke R"] },
  { id: "790-duke", name: "790 Duke", makeId: "ktm", types: ["street"], searchTerms: ["790 Duke"] },
  { id: "390-duke", name: "390 Duke", makeId: "ktm", types: ["street"], searchTerms: ["390 Duke"] },
  { id: "rc-390", name: "RC 390", makeId: "ktm", types: ["street"], searchTerms: ["RC 390", "RC390"] },
  // KTM Dual Sport
  { id: "500-exc-f", name: "500 EXC-F", makeId: "ktm", types: ["dual_sport"], searchTerms: ["500 EXC-F", "KTM 500EXCF"] },
  { id: "350-exc-f", name: "350 EXC-F", makeId: "ktm", types: ["dual_sport"], searchTerms: ["350 EXC-F", "KTM 350EXCF"] },
  { id: "300-exc", name: "300 EXC", makeId: "ktm", types: ["dual_sport"], searchTerms: ["300 EXC", "KTM 300EXC"] },
  { id: "1290-super-adventure", name: "1290 Super Adventure", makeId: "ktm", types: ["dual_sport"], searchTerms: ["1290 Super Adventure"] },
  { id: "890-adventure", name: "890 Adventure", makeId: "ktm", types: ["dual_sport"], searchTerms: ["890 Adventure"] },
  { id: "390-adventure", name: "390 Adventure", makeId: "ktm", types: ["dual_sport"], searchTerms: ["390 Adventure"] },
  // Husqvarna Dirt Bikes
  { id: "fc-450", name: "FC 450", makeId: "husqvarna", types: ["dirt_bike"], searchTerms: ["FC450", "FC 450", "HUSKY FC450", "Husqvarna FC"] },
  { id: "fc-350", name: "FC 350", makeId: "husqvarna", types: ["dirt_bike"], searchTerms: ["FC350", "FC 350", "HUSKY FC350"] },
  { id: "fc-250", name: "FC 250", makeId: "husqvarna", types: ["dirt_bike"], searchTerms: ["FC250", "FC 250", "HUSKY FC250"] },
  { id: "tc-250", name: "TC 250", makeId: "husqvarna", types: ["dirt_bike"], searchTerms: ["TC250", "TC 250", "HUSKY TC250"] },
  { id: "tc-125", name: "TC 125", makeId: "husqvarna", types: ["dirt_bike"], searchTerms: ["TC125", "TC 125", "HUSKY TC125"] },
  { id: "fx-450", name: "FX 450", makeId: "husqvarna", types: ["dirt_bike"], searchTerms: ["FX450", "FX 450", "HUSKY FX450"] },
  { id: "fx-350", name: "FX 350", makeId: "husqvarna", types: ["dirt_bike"], searchTerms: ["FX350", "FX 350", "HUSKY FX350"] },
  { id: "tc-85", name: "TC 85", makeId: "husqvarna", types: ["dirt_bike"], searchTerms: ["TC85", "TC 85", "HUSKY TC85"] },
  { id: "tc-65", name: "TC 65", makeId: "husqvarna", types: ["dirt_bike"], searchTerms: ["TC65", "TC 65", "HUSKY TC65"] },
  { id: "tc-50", name: "TC 50", makeId: "husqvarna", types: ["dirt_bike"], searchTerms: ["TC50", "TC 50", "HUSKY TC50"] },
  { id: "tc-50-mini", name: "TC 50 Mini", makeId: "husqvarna", types: ["dirt_bike"], searchTerms: ["TC50 Mini", "TC 50 Mini", "HUSKY TC50"] },
  // Husqvarna Dual Sport
  { id: "fe-501s", name: "FE 501s", makeId: "husqvarna", types: ["dual_sport"], searchTerms: ["FE501", "FE 501", "HUSKY FE501"] },
  { id: "fe-350s", name: "FE 350s", makeId: "husqvarna", types: ["dual_sport"], searchTerms: ["FE350", "FE 350", "HUSKY FE350"] },
  { id: "norden-901", name: "Norden 901", makeId: "husqvarna", types: ["dual_sport"], searchTerms: ["Norden 901", "Husqvarna Norden"] },
  { id: "svartpilen-401", name: "Svartpilen 401", makeId: "husqvarna", types: ["dual_sport"], searchTerms: ["Svartpilen 401", "Husqvarna Svartpilen"] },
  // Suzuki Dirt Bikes
  { id: "rm-z450", name: "RM-Z450", makeId: "suzuki", types: ["dirt_bike"], searchTerms: ["RM-Z450", "RMZ450"] },
  { id: "rm-z250", name: "RM-Z250", makeId: "suzuki", types: ["dirt_bike"], searchTerms: ["RM-Z250", "RMZ250"] },
  { id: "rm85", name: "RM85", makeId: "suzuki", types: ["dirt_bike"], searchTerms: ["RM85", "RM 85"] },
  { id: "dr-z125l", name: "DR-Z125L", makeId: "suzuki", types: ["dirt_bike"], searchTerms: ["DR-Z125L", "DRZ125"] },
  { id: "dr-z50", name: "DR-Z50", makeId: "suzuki", types: ["dirt_bike"], searchTerms: ["DR-Z50", "DRZ50"] },
  { id: "rm65", name: "RM65", makeId: "suzuki", types: ["dirt_bike"], searchTerms: ["RM65", "RM 65"] },
  { id: "jr80", name: "JR80", makeId: "suzuki", types: ["dirt_bike"], searchTerms: ["JR80", "JR 80"] },
  // Suzuki ATVs
  { id: "lt-z400", name: "QuadSport Z400", makeId: "suzuki", types: ["atv"], searchTerms: ["QuadSport Z400", "LT-Z400"] },
  { id: "lt-z90", name: "QuadSport Z90", makeId: "suzuki", types: ["atv"], searchTerms: ["QuadSport Z90", "LT-Z90"] },
  { id: "kingquad-750", name: "KingQuad 750", makeId: "suzuki", types: ["atv"], searchTerms: ["KingQuad 750"] },
  { id: "kingquad-500", name: "KingQuad 500", makeId: "suzuki", types: ["atv"], searchTerms: ["KingQuad 500"] },
  // Suzuki Street
  { id: "gsx-r1000r", name: "GSX-R1000R", makeId: "suzuki", types: ["street"], searchTerms: ["GSX-R1000R", "GSXR1000"] },
  { id: "gsx-r750", name: "GSX-R750", makeId: "suzuki", types: ["street"], searchTerms: ["GSX-R750", "GSXR750"] },
  { id: "gsx-r600", name: "GSX-R600", makeId: "suzuki", types: ["street"], searchTerms: ["GSX-R600", "GSXR600"] },
  { id: "hayabusa", name: "Hayabusa", makeId: "suzuki", types: ["street"], searchTerms: ["Hayabusa", "GSX1300R"] },
  { id: "gsx-s1000", name: "GSX-S1000", makeId: "suzuki", types: ["street"], searchTerms: ["GSX-S1000"] },
  { id: "sv650", name: "SV650", makeId: "suzuki", types: ["street"], searchTerms: ["SV650", "SV 650"] },
  // Suzuki Dual Sport
  { id: "dr-z400s", name: "DR-Z400S", makeId: "suzuki", types: ["dual_sport"], searchTerms: ["DR-Z400S", "DRZ400S"] },
  { id: "dr-z400sm", name: "DR-Z400SM", makeId: "suzuki", types: ["dual_sport"], searchTerms: ["DR-Z400SM", "DRZ400SM"] },
  { id: "dr650s", name: "DR650S", makeId: "suzuki", types: ["dual_sport"], searchTerms: ["DR650S", "DR 650S"] },
  { id: "v-strom-650", name: "V-Strom 650", makeId: "suzuki", types: ["dual_sport"], searchTerms: ["V-Strom 650", "VStrom 650"] },
  { id: "v-strom-1050", name: "V-Strom 1050", makeId: "suzuki", types: ["dual_sport"], searchTerms: ["V-Strom 1050", "VStrom 1050"] },
  // Polaris ATVs
  { id: "scrambler-xp1000", name: "Scrambler XP 1000", makeId: "polaris", types: ["atv"], searchTerms: ["Scrambler XP 1000"] },
  { id: "sportsman-570", name: "Sportsman 570", makeId: "polaris", types: ["atv"], searchTerms: ["Sportsman 570"] },
  { id: "sportsman-850", name: "Sportsman 850", makeId: "polaris", types: ["atv"], searchTerms: ["Sportsman 850"] },
  { id: "sportsman-xp1000", name: "Sportsman XP 1000", makeId: "polaris", types: ["atv"], searchTerms: ["Sportsman XP 1000"] },
  { id: "outlaw-70", name: "Outlaw 70", makeId: "polaris", types: ["atv"], searchTerms: ["Outlaw 70"] },
  // Polaris UTVs
  { id: "rzr-pro-r", name: "RZR Pro R", makeId: "polaris", types: ["utv"], searchTerms: ["RZR Pro R"] },
  { id: "rzr-turbo-r", name: "RZR Turbo R", makeId: "polaris", types: ["utv"], searchTerms: ["RZR Turbo R"] },
  { id: "rzr-xp-1000", name: "RZR XP 1000", makeId: "polaris", types: ["utv"], searchTerms: ["RZR XP 1000"] },
  { id: "rzr-trail", name: "RZR Trail", makeId: "polaris", types: ["utv"], searchTerms: ["RZR Trail"] },
  { id: "rzr-200", name: "RZR 200", makeId: "polaris", types: ["utv"], searchTerms: ["RZR 200"] },
  { id: "general-xp-1000", name: "General XP 1000", makeId: "polaris", types: ["utv"], searchTerms: ["General XP 1000"] },
  { id: "ranger-xp-1000", name: "Ranger XP 1000", makeId: "polaris", types: ["utv"], searchTerms: ["Ranger XP 1000"] },
  // Can-Am ATVs
  { id: "ds-250", name: "DS 250", makeId: "can-am", types: ["atv"], searchTerms: ["DS 250", "Can-Am DS"] },
  { id: "ds-90", name: "DS 90", makeId: "can-am", types: ["atv"], searchTerms: ["DS 90"] },
  { id: "outlander-650", name: "Outlander 650", makeId: "can-am", types: ["atv"], searchTerms: ["Outlander 650"] },
  { id: "outlander-850", name: "Outlander 850", makeId: "can-am", types: ["atv"], searchTerms: ["Outlander 850"] },
  { id: "outlander-1000r", name: "Outlander 1000R", makeId: "can-am", types: ["atv"], searchTerms: ["Outlander 1000R"] },
  { id: "renegade-850", name: "Renegade 850", makeId: "can-am", types: ["atv"], searchTerms: ["Renegade 850"] },
  { id: "renegade-1000r", name: "Renegade 1000R", makeId: "can-am", types: ["atv"], searchTerms: ["Renegade 1000R"] },
  // Can-Am UTVs
  { id: "maverick-x3", name: "Maverick X3", makeId: "can-am", types: ["utv"], searchTerms: ["Maverick X3"] },
  { id: "maverick-r", name: "Maverick R", makeId: "can-am", types: ["utv"], searchTerms: ["Maverick R"] },
  { id: "commander-1000r", name: "Commander 1000R", makeId: "can-am", types: ["utv"], searchTerms: ["Commander 1000R"] },
  { id: "defender-hd10", name: "Defender HD10", makeId: "can-am", types: ["utv"], searchTerms: ["Defender HD10"] },
  // Harley-Davidson Street
  { id: "street-glide", name: "Street Glide", makeId: "harley", types: ["street"], searchTerms: ["Street Glide", "FLHX"] },
  { id: "road-glide", name: "Road Glide", makeId: "harley", types: ["street"], searchTerms: ["Road Glide", "FLTRX"] },
  { id: "road-king", name: "Road King", makeId: "harley", types: ["street"], searchTerms: ["Road King", "FLHR"] },
  { id: "sportster-s", name: "Sportster S", makeId: "harley", types: ["street"], searchTerms: ["Sportster S", "RH1250S"] },
  { id: "nightster", name: "Nightster", makeId: "harley", types: ["street"], searchTerms: ["Nightster", "RH975"] },
  { id: "fat-boy", name: "Fat Boy", makeId: "harley", types: ["street"], searchTerms: ["Fat Boy", "FLFBS"] },
  { id: "softail-slim", name: "Softail Slim", makeId: "harley", types: ["street"], searchTerms: ["Softail Slim", "FLSL"] },
  { id: "breakout", name: "Breakout", makeId: "harley", types: ["street"], searchTerms: ["Breakout", "FXBRS"] },
  { id: "low-rider-st", name: "Low Rider ST", makeId: "harley", types: ["street"], searchTerms: ["Low Rider ST", "FXLRST"] },
  { id: "pan-america", name: "Pan America", makeId: "harley", types: ["street"], searchTerms: ["Pan America", "RA1250"] },
  // Ducati Street
  { id: "panigale-v4", name: "Panigale V4", makeId: "ducati", types: ["street"], searchTerms: ["Panigale V4"] },
  { id: "streetfighter-v4", name: "Streetfighter V4", makeId: "ducati", types: ["street"], searchTerms: ["Streetfighter V4"] },
  { id: "monster", name: "Monster", makeId: "ducati", types: ["street"], searchTerms: ["Monster", "Ducati Monster"] },
  { id: "diavel-v4", name: "Diavel V4", makeId: "ducati", types: ["street"], searchTerms: ["Diavel V4"] },
  { id: "multistrada-v4", name: "Multistrada V4", makeId: "ducati", types: ["street"], searchTerms: ["Multistrada V4"] },
  { id: "scrambler-800", name: "Scrambler 800", makeId: "ducati", types: ["street"], searchTerms: ["Scrambler 800", "Ducati Scrambler"] },
  { id: "desert-x", name: "DesertX", makeId: "ducati", types: ["street"], searchTerms: ["DesertX", "Desert X"] },
  // BMW Street
  { id: "s1000rr", name: "S 1000 RR", makeId: "bmw", types: ["street"], searchTerms: ["S 1000 RR", "S1000RR"] },
  { id: "m1000rr", name: "M 1000 RR", makeId: "bmw", types: ["street"], searchTerms: ["M 1000 RR", "M1000RR"] },
  { id: "s1000r", name: "S 1000 R", makeId: "bmw", types: ["street"], searchTerms: ["S 1000 R", "S1000R"] },
  { id: "r-nine-t", name: "R nineT", makeId: "bmw", types: ["street"], searchTerms: ["R nineT", "R9T"] },
  // BMW Dual Sport
  { id: "r1250gs", name: "R 1250 GS", makeId: "bmw", types: ["dual_sport"], searchTerms: ["R 1250 GS", "R1250GS"] },
  { id: "r1300gs", name: "R 1300 GS", makeId: "bmw", types: ["dual_sport"], searchTerms: ["R 1300 GS", "R1300GS"] },
  { id: "f850gs", name: "F 850 GS", makeId: "bmw", types: ["dual_sport"], searchTerms: ["F 850 GS", "F850GS"] },
  { id: "f750gs", name: "F 750 GS", makeId: "bmw", types: ["dual_sport"], searchTerms: ["F 750 GS", "F750GS"] },
  { id: "g310gs", name: "G 310 GS", makeId: "bmw", types: ["dual_sport"], searchTerms: ["G 310 GS", "G310GS"] },
  // GasGas Dirt Bikes
  { id: "mc-450f", name: "MC 450F", makeId: "gasgas", types: ["dirt_bike"], searchTerms: ["MC 450F", "GasGas MC450F"] },
  { id: "mc-250f", name: "MC 250F", makeId: "gasgas", types: ["dirt_bike"], searchTerms: ["MC 250F", "GasGas MC250F"] },
  { id: "mc-250", name: "MC 250", makeId: "gasgas", types: ["dirt_bike"], searchTerms: ["MC 250", "GasGas MC250"] },
  { id: "mc-125", name: "MC 125", makeId: "gasgas", types: ["dirt_bike"], searchTerms: ["MC 125", "GasGas MC125"] },
  { id: "ex-450f", name: "EX 450F", makeId: "gasgas", types: ["dirt_bike"], searchTerms: ["EX 450F", "GasGas EX450F"] },
  { id: "ex-350f", name: "EX 350F", makeId: "gasgas", types: ["dirt_bike"], searchTerms: ["EX 350F", "GasGas EX350F"] },
  { id: "ex-300", name: "EX 300", makeId: "gasgas", types: ["dirt_bike"], searchTerms: ["EX 300", "GasGas EX300"] },
  { id: "mc-85", name: "MC 85", makeId: "gasgas", types: ["dirt_bike"], searchTerms: ["MC 85", "GasGas MC85"] },
  { id: "mc-65", name: "MC 65", makeId: "gasgas", types: ["dirt_bike"], searchTerms: ["MC 65", "GasGas MC65"] },
  { id: "mc-50", name: "MC 50", makeId: "gasgas", types: ["dirt_bike"], searchTerms: ["MC 50", "GasGas MC50"] },
  // GasGas Dual Sport
  { id: "es-700", name: "ES 700", makeId: "gasgas", types: ["dual_sport"], searchTerms: ["ES 700", "GasGas ES700"] },
  { id: "sm-700", name: "SM 700", makeId: "gasgas", types: ["dual_sport"], searchTerms: ["SM 700", "GasGas SM700"] },
  // Triumph Street
  { id: "speed-triple-1200", name: "Speed Triple 1200", makeId: "triumph", types: ["street"], searchTerms: ["Speed Triple 1200"] },
  { id: "street-triple-765", name: "Street Triple 765", makeId: "triumph", types: ["street"], searchTerms: ["Street Triple 765"] },
  { id: "trident-660", name: "Trident 660", makeId: "triumph", types: ["street"], searchTerms: ["Trident 660"] },
  { id: "bonneville-t120", name: "Bonneville T120", makeId: "triumph", types: ["street"], searchTerms: ["Bonneville T120"] },
  { id: "rocket-3", name: "Rocket 3", makeId: "triumph", types: ["street"], searchTerms: ["Rocket 3"] },
  { id: "tiger-1200", name: "Tiger 1200", makeId: "triumph", types: ["street"], searchTerms: ["Tiger 1200"] },
  { id: "tiger-900", name: "Tiger 900", makeId: "triumph", types: ["street"], searchTerms: ["Tiger 900"] },
  // Indian Street
  { id: "chieftain", name: "Chieftain", makeId: "indian", types: ["street"], searchTerms: ["Chieftain", "Indian Chieftain"] },
  { id: "challenger", name: "Challenger", makeId: "indian", types: ["street"], searchTerms: ["Challenger", "Indian Challenger"] },
  { id: "scout", name: "Scout", makeId: "indian", types: ["street"], searchTerms: ["Scout", "Indian Scout"] },
  { id: "ftr", name: "FTR", makeId: "indian", types: ["street"], searchTerms: ["FTR", "Indian FTR"] },
  { id: "pursuit", name: "Pursuit", makeId: "indian", types: ["street"], searchTerms: ["Pursuit", "Indian Pursuit"] },
  // Aprilia Street
  { id: "rsv4", name: "RSV4", makeId: "aprilia", types: ["street"], searchTerms: ["RSV4", "Aprilia RSV4"] },
  { id: "tuono-v4", name: "Tuono V4", makeId: "aprilia", types: ["street"], searchTerms: ["Tuono V4"] },
  { id: "rs-660", name: "RS 660", makeId: "aprilia", types: ["street"], searchTerms: ["RS 660", "RS660"] },
  { id: "tuono-660", name: "Tuono 660", makeId: "aprilia", types: ["street"], searchTerms: ["Tuono 660"] },
  // CFMoto
  { id: "cforce-600", name: "CForce 600", makeId: "cfmoto", types: ["atv"], searchTerms: ["CForce 600"] },
  { id: "cforce-800", name: "CForce 800", makeId: "cfmoto", types: ["atv"], searchTerms: ["CForce 800"] },
  { id: "zforce-950", name: "ZForce 950", makeId: "cfmoto", types: ["utv"], searchTerms: ["ZForce 950"] },
  { id: "uforce-1000", name: "UForce 1000", makeId: "cfmoto", types: ["utv"], searchTerms: ["UForce 1000"] },
  { id: "700cl-x", name: "700CL-X", makeId: "cfmoto", types: ["street"], searchTerms: ["700CL-X", "700CLX"] },
  { id: "450ss", name: "450SS", makeId: "cfmoto", types: ["street"], searchTerms: ["450SS", "CFMoto 450SS"] },
  // Arctic Cat / Textron ATVs/UTVs
  { id: "alterra-600", name: "Alterra 600", makeId: "arctic-cat", types: ["atv"], searchTerms: ["Alterra 600"] },
  { id: "alterra-450", name: "Alterra 450", makeId: "arctic-cat", types: ["atv"], searchTerms: ["Alterra 450"] },
  { id: "wildcat-xx", name: "Wildcat XX", makeId: "arctic-cat", types: ["utv"], searchTerms: ["Wildcat XX"] },
  { id: "prowler-pro", name: "Prowler Pro", makeId: "arctic-cat", types: ["utv"], searchTerms: ["Prowler Pro"] },
  // Beta Dirt Bikes
  { id: "rr-300", name: "RR 300", makeId: "beta", types: ["dirt_bike"], searchTerms: ["RR300", "RR 300", "Beta RR", "Beta 300"] },
  { id: "rr-250", name: "RR 250", makeId: "beta", types: ["dirt_bike"], searchTerms: ["RR250", "RR 250", "Beta RR", "Beta 250"] },
  { id: "rr-200", name: "RR 200", makeId: "beta", types: ["dirt_bike"], searchTerms: ["RR200", "RR 200", "Beta RR", "Beta 200"] },
  { id: "rr-430", name: "RR 430", makeId: "beta", types: ["dirt_bike"], searchTerms: ["RR430", "RR 430", "Beta RR", "Beta 430"] },
  { id: "rr-480", name: "RR 480", makeId: "beta", types: ["dirt_bike"], searchTerms: ["RR480", "RR 480", "Beta RR", "Beta 480"] },
  // Beta Dual Sport
  { id: "rr-s-390", name: "RR-S 390", makeId: "beta", types: ["dual_sport"], searchTerms: ["RR-S 390", "Beta RR-S390"] },
  { id: "rr-s-500", name: "RR-S 500", makeId: "beta", types: ["dual_sport"], searchTerms: ["RR-S 500", "Beta RR-S500"] },
  // Sherco Dirt Bikes
  { id: "se-300", name: "SE 300", makeId: "sherco", types: ["dirt_bike"], searchTerms: ["SE 300", "Sherco SE300"] },
  { id: "se-250", name: "SE 250", makeId: "sherco", types: ["dirt_bike"], searchTerms: ["SE 250", "Sherco SE250"] },
  { id: "sef-450", name: "SEF 450", makeId: "sherco", types: ["dirt_bike"], searchTerms: ["SEF 450", "Sherco SEF450"] },
  { id: "sef-300", name: "SEF 300", makeId: "sherco", types: ["dirt_bike"], searchTerms: ["SEF 300", "Sherco SEF300"] },
  // Sherco Dual Sport
  { id: "sef-r-500", name: "SEF-R 500", makeId: "sherco", types: ["dual_sport"], searchTerms: ["SEF-R 500", "Sherco SEFR500"] }
];
function getVehicleTypes() {
  return VEHICLE_TYPES;
}
function getYears() {
  return YEARS;
}
function getMakesByType(typeId) {
  return MAKES.filter((m) => m.types.includes(typeId)).sort((a, b) => a.name.localeCompare(b.name));
}
function getModelsByMakeAndType(makeId, typeId) {
  return MODELS.filter((m) => m.makeId === makeId && m.types.includes(typeId)).sort((a, b) => a.name.localeCompare(b.name));
}

// api/index.ts
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("X-Frame-Options", "");
}
async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  const url = req.url || "";
  const path = url.split("?")[0];
  try {
    if (path === "/api/status") {
      return res.json({ wpsConfigured: isConfigured() });
    }
    if (path === "/api/vehicle-types") {
      return res.json({ data: getVehicleTypes() });
    }
    if (path === "/api/years") {
      return res.json({ data: getYears() });
    }
    if (path === "/api/makes") {
      const typeId = req.query.type;
      if (!typeId) return res.status(400).json({ error: "type query parameter is required" });
      return res.json({ data: getMakesByType(typeId) });
    }
    if (path === "/api/models") {
      const makeId = req.query.make;
      const typeId = req.query.type;
      if (!makeId || !typeId) return res.status(400).json({ error: "make and type query parameters are required" });
      return res.json({ data: getModelsByMakeAndType(makeId, typeId) });
    }
    if (path === "/api/parts/categories") {
      const typeId = req.query.type;
      if (!typeId) return res.status(400).json({ error: "type is required" });
      const categories = PRODUCT_TYPE_CATEGORIES[typeId] || PRODUCT_TYPE_CATEGORIES["dirt_bike"];
      return res.json({ data: categories });
    }
    if (path === "/api/parts/vehicle-search") {
      if (!isConfigured()) return res.status(503).json({ error: "WPS API not configured" });
      const searchTermsParam = req.query.terms;
      if (!searchTermsParam) return res.status(400).json({ error: "terms query parameter is required" });
      const searchTerms = searchTermsParam.split(",").map((t) => t.trim()).filter(Boolean);
      if (searchTerms.length === 0) return res.status(400).json({ error: "at least one search term is required" });
      if (searchTerms.length > 10) return res.status(400).json({ error: "maximum 10 search terms" });
      const makeName = req.query.make;
      const results = await searchItemsByVehicle(searchTerms, makeName);
      return res.json(results);
    }
    if (path === "/api/parts/browse") {
      if (!isConfigured()) return res.status(503).json({ error: "WPS API not configured" });
      const productType = req.query.category;
      const cursor = req.query.cursor;
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const data = await getItems({ page, productType, cursor: cursor || void 0 });
      return res.json(data);
    }
    if (path.startsWith("/api/parts/item/")) {
      if (!isConfigured()) return res.status(503).json({ error: "WPS API not configured" });
      const itemId = parseInt(path.replace("/api/parts/item/", ""));
      const data = await getItemById(itemId);
      return res.json(data);
    }
    if (path === "/api/wps/fitment-check") {
      if (!isConfigured()) return res.status(503).json({ error: "WPS API not configured", fitmentAvailable: false });
      try {
        const data = await getVehicleMakes();
        return res.json({ fitmentAvailable: true, data });
      } catch (error) {
        if (error.message.includes("403")) {
          return res.json({ fitmentAvailable: false, message: "Vehicle fitment data requires additional WPS API permissions." });
        }
        return res.status(500).json({ error: error.message, fitmentAvailable: false });
      }
    }
    if (path.startsWith("/api/wps/vehicle/") && path.endsWith("/items")) {
      if (!isConfigured()) return res.status(503).json({ error: "WPS API not configured" });
      const vehicleId = parseInt(path.replace("/api/wps/vehicle/", "").replace("/items", ""));
      const page = req.query.page ? parseInt(req.query.page) : 1;
      const data = await getVehicleItems(vehicleId, page);
      return res.json(data);
    }
    if (path === "/api/bigcommerce/lookup-skus" && req.method === "POST") {
      if (!isConfigured2()) return res.status(503).json({ error: "BigCommerce not configured" });
      const { skus } = req.body;
      if (!Array.isArray(skus) || skus.length === 0) return res.status(400).json({ error: "skus array is required" });
      if (skus.length > 5) return res.status(400).json({ error: "Maximum 5 SKUs per request" });
      const results = await getProductsBySku(skus);
      const safeResults = {};
      for (const [sku, product] of Object.entries(results)) {
        safeResults[sku] = { id: product.id };
      }
      return res.json({ data: safeResults });
    }
    if (path === "/api/bigcommerce/add-to-cart" && req.method === "POST") {
      if (!isConfigured2()) return res.status(503).json({ error: "BigCommerce not configured" });
      const { productId, quantity = 1 } = req.body;
      if (!productId) return res.status(400).json({ error: "productId is required" });
      const cart = await createCart([{ product_id: productId, quantity }]);
      const redirectUrl = cart?.data?.redirect_urls?.cart_url;
      return res.json({
        success: true,
        cartUrl: redirectUrl || `https://${getStoreDomain()}/cart.php`,
        storeDomain: getStoreDomain()
      });
    }
    return res.status(404).json({ error: "Not found" });
  } catch (error) {
    console.error("API error:", error);
    return res.status(500).json({ error: error.message });
  }
}
