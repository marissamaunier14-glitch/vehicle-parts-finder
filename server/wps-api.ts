import { log } from "./log";

const WPS_BASE_URL = "https://api.wps-inc.com";

const searchCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000;

function getApiKey(): string {
  const key = process.env.WPS_API_KEY;
  if (!key) throw new Error("WPS_API_KEY is not configured");
  return key;
}

async function wpsRequest(endpoint: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${WPS_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  log(`WPS Request: ${url.toString()}`, "wps");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    log(`WPS API error ${response.status}: ${errorText}`, "wps");
    throw new Error(`WPS API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function getItems(params: {
  page?: number;
  productType?: string;
  cursor?: string;
}): Promise<any> {
  const queryParams: Record<string, string> = {
    "page[size]": "48",
    include: "images,product",
  };
  if (params.page && params.page > 1) queryParams["page[cursor]"] = params.cursor || "";
  if (params.productType) queryParams["filter[product_type]"] = params.productType;

  return wpsRequest("/items", queryParams);
}

const EXCLUDED_PRODUCT_TYPES = new Set([
  "Shirts", "Sweaters", "Jackets", "Headgear", "Gloves", "Pants",
  "Jerseys", "Socks", "Boots", "Goggles", "Helmets", "Helmet Accessories",
  "Promotional", "Guards/Braces", "Chest/Back Protectors",
  "Knee/Shin Protection", "Elbow/Wrist Protection", "Neck Support",
  "Base Layers", "Rain Gear", "Casual Wear", "Underwear",
  "Bags/Luggage/Cases", "Gifts/Novelties",
]);

const EXCLUDED_NAME_PATTERNS = /\b(REPLICA|SCALE|DIE.?CAST|T-SHIRT|SWEATSHIRT|JERSEY|HOODIE|SNAPBACK|HAT|BEANIE|JACKET|GLOVE|BOOT|GOGGLE|HELMET|PANT\b|SOCK\b)/i;

export async function searchItemsByVehicle(searchTerms: string[], makeName?: string): Promise<{
  data: any[];
  grouped: Record<string, any[]>;
  totalFound: number;
}> {
  const cacheKey = `search:${searchTerms.sort().join("|")}:${makeName || ""}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    log(`Cache hit for "${cacheKey}" (${cached.data.totalFound} parts)`, "wps");
    return cached.data;
  }

  const allItems = new Map<number, any>();

  const allTermsSet = new Set<string>();
  for (const term of searchTerms) {
    allTermsSet.add(term);
  }
  if (makeName) {
    allTermsSet.add(makeName);
    for (const term of searchTerms) {
      const parts = term.split(/[\s-]+/).filter(p => p.length >= 2 && p.toLowerCase() !== makeName?.toLowerCase());
      for (const part of parts) {
        allTermsSet.add(`${makeName} ${part}`);
      }
    }
  }

  const uniqueTerms = Array.from(allTermsSet).slice(0, 8);
  log(`Vehicle search terms: ${JSON.stringify(uniqueTerms)} (make: ${makeName})`, "wps");

  const itemSearches = uniqueTerms.map(term =>
    wpsRequest("/items", {
      "page[size]": "200",
      "filter[name][like]": `%${term}%`,
      "filter[status]": "STK",
      include: "images,product,inventory",
    }).catch(err => {
      log(`Item search failed for "${term}": ${err.message}`, "wps");
      return { data: [] };
    })
  );

  const productSearches = uniqueTerms.map(term =>
    wpsRequest("/products", {
      "page[size]": "200",
      "filter[name][like]": `%${term}%`,
      include: "items.images,items",
    }).catch(err => {
      log(`Product search failed for "${term}": ${err.message}`, "wps");
      return { data: [] };
    })
  );

  const [itemResults, productResults] = await Promise.all([
    Promise.all(itemSearches),
    Promise.all(productSearches),
  ]);

  function isRelevantPart(item: any): boolean {
    if (!item.product_type) return false;
    if (EXCLUDED_PRODUCT_TYPES.has(item.product_type)) return false;
    if (EXCLUDED_NAME_PATTERNS.test(item.name || "")) return false;
    const price = parseFloat(item.list_price);
    if (isNaN(price) || price <= 0) return false;
    return true;
  }

  for (const result of itemResults) {
    if (result.data) {
      for (const item of result.data) {
        if (!allItems.has(item.id) && isRelevantPart(item)) {
          allItems.set(item.id, item);
        }
      }
    }
  }

  for (const result of productResults) {
    if (result.data) {
      for (const product of result.data) {
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
  const grouped: Record<string, any[]> = {};
  for (const item of items) {
    const type = item.product_type || "Other";
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(item);
  }

  const partsCategoryOrder = [
    "Engine", "Piston kits & Components", "Gaskets/Seals", "Clutch",
    "Exhaust", "Air Filters", "Oil Filters", "Intake/Carb/Fuel System",
    "Brakes", "Suspension", "Sprockets", "Chains", "Drive",
    "Handlebars", "Foot Controls", "Cable/Hydraulic Control Lines",
    "Electrical", "Switches", "Illumination", "Body", "Graphics/Decals",
    "Rims", "Tires", "Hardware/Fasteners/Fittings", "Tools",
    "Chemicals", "Accessories",
  ];

  const sortedGrouped: Record<string, any[]> = {};
  for (const cat of partsCategoryOrder) {
    if (grouped[cat]) {
      grouped[cat].sort((a: any, b: any) => parseFloat(a.list_price) - parseFloat(b.list_price));
      sortedGrouped[cat] = grouped[cat];
    }
  }
  for (const type of Object.keys(grouped)) {
    if (!sortedGrouped[type]) {
      grouped[type].sort((a: any, b: any) => parseFloat(a.list_price) - parseFloat(b.list_price));
      sortedGrouped[type] = grouped[type];
    }
  }

  const result = { data: items, grouped: sortedGrouped, totalFound: items.length };
  searchCache.set(cacheKey, { data: result, timestamp: Date.now() });

  if (searchCache.size > 200) {
    const oldest = Array.from(searchCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, 50);
    for (const [key] of oldest) searchCache.delete(key);
  }

  return result;
}

export async function getItemsBySku(sku: string): Promise<any> {
  return wpsRequest(`/items/crutch/${sku}`, {
    include: "images,product,inventory,features",
  });
}

export async function getItemById(itemId: number): Promise<any> {
  return wpsRequest(`/items/${itemId}`, {
    include: "images,product,inventory,features",
  });
}

export async function getVehicleMakes(): Promise<any> {
  return wpsRequest("/vehiclemakes", { "page[size]": "200" });
}

export async function getVehicleModelsByMake(makeId: number): Promise<any> {
  return wpsRequest(`/vehiclemakes/${makeId}/vehiclemodels`, { "page[size]": "200" });
}

export async function getVehicleYears(): Promise<any> {
  return wpsRequest("/vehicleyears", { "page[size]": "100" });
}

export async function getVehicles(params: {
  yearId?: number;
  makeId?: number;
  modelId?: number;
  page?: number;
}): Promise<any> {
  const queryParams: Record<string, string> = {
    "page[size]": "50",
    include: "vehiclemodel.vehiclemake,vehicleyear",
  };
  if (params.yearId) queryParams["filter[year]"] = params.yearId.toString();
  if (params.makeId) queryParams["filter[make]"] = params.makeId.toString();
  if (params.modelId) queryParams["filter[model]"] = params.modelId.toString();
  if (params.page) queryParams["page[number]"] = params.page.toString();

  return wpsRequest("/vehicles", queryParams);
}

export async function getVehicleItems(vehicleId: number, page = 1): Promise<any> {
  return wpsRequest(`/vehicles/${vehicleId}/items`, {
    "page[size]": "50",
    "page[number]": page.toString(),
    include: "images,product",
  });
}

export async function getTaxonomyTerms(): Promise<any> {
  return wpsRequest("/taxonomyterms", { "page[size]": "200" });
}

export async function getProductTypes(): Promise<string[]> {
  try {
    const data = await wpsRequest("/items", { "page[size]": "1" });
    return [];
  } catch {
    return [];
  }
}

export function isConfigured(): boolean {
  return !!process.env.WPS_API_KEY;
}

export const PRODUCT_TYPE_CATEGORIES: Record<string, string[]> = {
  dirt_bike: [
    "Engine", "Pistons", "Cylinders", "Gaskets", "Cranks", "Valves", "Camshafts",
    "Exhaust", "Air Filters", "Oil Filters", "Brake Pads", "Brake Rotors",
    "Chains", "Sprockets", "Handlebars", "Grips", "Levers",
    "Plastics", "Graphics", "Tires", "Tubes", "Suspension",
    "Clutch", "Bearings", "Cables",
    "Footpegs", "Radiator", "Skid Plates", "Bars & Clamps"
  ],
  atv: [
    "Engine", "Pistons", "Cylinders", "Gaskets", "Cranks", "Valves",
    "Exhaust", "Air Filters", "Oil Filters", "Brake Pads", "Brake Rotors",
    "Tires", "A-Arms", "Bumpers", "Winches", "Axles",
    "CV Joints", "Tie Rods", "Ball Joints", "Wheel Bearings",
    "Clutch", "Belts", "Radiator", "Skid Plates"
  ],
  utv: [
    "Engine", "Pistons", "Gaskets", "Clutch", "Belts",
    "Exhaust", "Air Filters", "Oil Filters", "Brake Pads", "Brake Rotors",
    "Tires", "Windshields", "Roofs", "Doors", "Bumpers",
    "Winches", "Axles", "Radiator", "Light Bars",
    "Harnesses", "Seats"
  ],
  street: [
    "Engine", "Pistons", "Cylinders", "Gaskets", "Valves", "Camshafts",
    "Exhaust", "Air Filters", "Oil Filters", "Brake Pads", "Brake Rotors",
    "Chains", "Sprockets", "Handlebars", "Grips", "Levers",
    "Fairings", "Mirrors", "Tires", "Suspension", "Seats",
    "Windshields", "Frame Sliders", "Tail Lights"
  ],
  dual_sport: [
    "Engine", "Pistons", "Cylinders", "Gaskets", "Valves",
    "Exhaust", "Air Filters", "Oil Filters", "Brake Pads", "Brake Rotors",
    "Chains", "Sprockets", "Handlebars", "Grips", "Levers",
    "Hand Guards", "Tires", "Tubes", "Suspension", "Skid Plates",
    "Luggage", "Panniers", "Crash Bars"
  ],
};