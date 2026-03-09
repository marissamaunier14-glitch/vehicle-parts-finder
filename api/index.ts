import type { IncomingMessage, ServerResponse } from "http";
import * as wps from "../server/wps-api";
import * as bigcommerce from "../server/bigcommerce-api";
import * as vehicleData from "../server/vehicle-data";

interface VercelRequest extends IncomingMessage {
  query: Record<string, string | string[]>;
  body: any;
}

interface VercelResponse extends ServerResponse {
  status(code: number): VercelResponse;
  json(data: any): VercelResponse;
  setHeader(name: string, value: string): this;
  end(): this;
}

function setCorsHeaders(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("X-Frame-Options", "");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const url = req.url || "";
  const path = url.split("?")[0];

  try {
    if (path === "/api/status") {
      return res.json({ wpsConfigured: wps.isConfigured() });
    }

    if (path === "/api/vehicle-types") {
      return res.json({ data: vehicleData.getVehicleTypes() });
    }

    if (path === "/api/years") {
      return res.json({ data: vehicleData.getYears() });
    }

    if (path === "/api/makes") {
      const typeId = req.query.type as string;
      if (!typeId) return res.status(400).json({ error: "type query parameter is required" });
      return res.json({ data: vehicleData.getMakesByType(typeId) });
    }

    if (path === "/api/models") {
      const makeId = req.query.make as string;
      const typeId = req.query.type as string;
      if (!makeId || !typeId) return res.status(400).json({ error: "make and type query parameters are required" });
      return res.json({ data: vehicleData.getModelsByMakeAndType(makeId, typeId) });
    }

    if (path === "/api/parts/categories") {
      const typeId = req.query.type as string;
      if (!typeId) return res.status(400).json({ error: "type is required" });
      const categories = wps.PRODUCT_TYPE_CATEGORIES[typeId] || wps.PRODUCT_TYPE_CATEGORIES["dirt_bike"];
      return res.json({ data: categories });
    }

    if (path === "/api/parts/vehicle-search") {
      if (!wps.isConfigured()) return res.status(503).json({ error: "WPS API not configured" });
      const searchTermsParam = req.query.terms as string;
      if (!searchTermsParam) return res.status(400).json({ error: "terms query parameter is required" });
      const searchTerms = searchTermsParam.split(",").map(t => t.trim()).filter(Boolean);
      if (searchTerms.length === 0) return res.status(400).json({ error: "at least one search term is required" });
      if (searchTerms.length > 10) return res.status(400).json({ error: "maximum 10 search terms" });
      const makeName = req.query.make as string | undefined;
      const results = await wps.searchItemsByVehicle(searchTerms, makeName);
      return res.json(results);
    }

    if (path === "/api/parts/browse") {
      if (!wps.isConfigured()) return res.status(503).json({ error: "WPS API not configured" });
      const productType = req.query.category as string | undefined;
      const cursor = req.query.cursor as string | undefined;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const data = await wps.getItems({ page, productType, cursor: cursor || undefined });
      return res.json(data);
    }

    if (path.startsWith("/api/parts/item/")) {
      if (!wps.isConfigured()) return res.status(503).json({ error: "WPS API not configured" });
      const itemId = parseInt(path.replace("/api/parts/item/", ""));
      const data = await wps.getItemById(itemId);
      return res.json(data);
    }

    if (path === "/api/wps/fitment-check") {
      if (!wps.isConfigured()) return res.status(503).json({ error: "WPS API not configured", fitmentAvailable: false });
      try {
        const data = await wps.getVehicleMakes();
        return res.json({ fitmentAvailable: true, data });
      } catch (error: any) {
        if (error.message.includes("403")) {
          return res.json({ fitmentAvailable: false, message: "Vehicle fitment data requires additional WPS API permissions." });
        }
        return res.status(500).json({ error: error.message, fitmentAvailable: false });
      }
    }

    if (path.startsWith("/api/wps/vehicle/") && path.endsWith("/items")) {
      if (!wps.isConfigured()) return res.status(503).json({ error: "WPS API not configured" });
      const vehicleId = parseInt(path.replace("/api/wps/vehicle/", "").replace("/items", ""));
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const data = await wps.getVehicleItems(vehicleId, page);
      return res.json(data);
    }

    if (path === "/api/bigcommerce/lookup-skus" && req.method === "POST") {
      if (!bigcommerce.isConfigured()) return res.status(503).json({ error: "BigCommerce not configured" });
      const { skus } = req.body;
      if (!Array.isArray(skus) || skus.length === 0) return res.status(400).json({ error: "skus array is required" });
      if (skus.length > 5) return res.status(400).json({ error: "Maximum 5 SKUs per request" });
      const results = await bigcommerce.getProductsBySku(skus);
      const safeResults: Record<string, { id: number }> = {};
      for (const [sku, product] of Object.entries(results)) {
        safeResults[sku] = { id: (product as any).id };
      }
      return res.json({ data: safeResults });
    }

    if (path === "/api/bigcommerce/add-to-cart" && req.method === "POST") {
      if (!bigcommerce.isConfigured()) return res.status(503).json({ error: "BigCommerce not configured" });
      const { productId, quantity = 1 } = req.body;
      if (!productId) return res.status(400).json({ error: "productId is required" });
      const cart = await bigcommerce.createCart([{ product_id: productId, quantity }]);
      const redirectUrl = cart?.data?.redirect_urls?.cart_url;
      return res.json({
        success: true,
        cartUrl: redirectUrl || `https://${bigcommerce.getStoreDomain()}/cart.php`,
        storeDomain: bigcommerce.getStoreDomain(),
      });
    }

    return res.status(404).json({ error: "Not found" });
  } catch (error: any) {
    console.error("API error:", error);
    return res.status(500).json({ error: error.message });
  }
}
