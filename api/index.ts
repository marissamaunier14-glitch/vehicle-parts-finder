import express from "express";
import * as wps from "../server/wps-api";
import * as bigcommerce from "../server/bigcommerce-api";
import * as vehicleData from "../server/vehicle-data";

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use((_req, res, next) => {
  res.removeHeader("X-Frame-Options");
  next();
});

app.get("/api/status", (_req, res) => {
  res.json({ wpsConfigured: wps.isConfigured() });
});

app.get("/api/vehicle-types", (_req, res) => {
  res.json({ data: vehicleData.getVehicleTypes() });
});

app.get("/api/years", (_req, res) => {
  res.json({ data: vehicleData.getYears() });
});

app.get("/api/makes", (req, res) => {
  const typeId = req.query.type as string;
  if (!typeId) return res.status(400).json({ error: "type query parameter is required" });
  res.json({ data: vehicleData.getMakesByType(typeId) });
});

app.get("/api/models", (req, res) => {
  const makeId = req.query.make as string;
  const typeId = req.query.type as string;
  if (!makeId || !typeId) return res.status(400).json({ error: "make and type query parameters are required" });
  res.json({ data: vehicleData.getModelsByMakeAndType(makeId, typeId) });
});

app.get("/api/parts/categories", (req, res) => {
  const typeId = req.query.type as string;
  if (!typeId) return res.status(400).json({ error: "type is required" });
  const categories = wps.PRODUCT_TYPE_CATEGORIES[typeId] || wps.PRODUCT_TYPE_CATEGORIES["dirt_bike"];
  res.json({ data: categories });
});

app.get("/api/parts/vehicle-search", async (req, res) => {
  try {
    if (!wps.isConfigured()) return res.status(503).json({ error: "WPS API not configured" });
    const searchTermsParam = req.query.terms as string;
    if (!searchTermsParam) return res.status(400).json({ error: "terms query parameter is required" });
    const searchTerms = searchTermsParam.split(",").map(t => t.trim()).filter(Boolean);
    if (searchTerms.length === 0) return res.status(400).json({ error: "at least one search term is required" });
    if (searchTerms.length > 10) return res.status(400).json({ error: "maximum 10 search terms" });
    const makeName = req.query.make as string | undefined;
    const results = await wps.searchItemsByVehicle(searchTerms, makeName);
    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/parts/browse", async (req, res) => {
  try {
    if (!wps.isConfigured()) return res.status(503).json({ error: "WPS API not configured" });
    const productType = req.query.category as string | undefined;
    const cursor = req.query.cursor as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const data = await wps.getItems({ page, productType, cursor: cursor || undefined });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/parts/item/:itemId", async (req, res) => {
  try {
    if (!wps.isConfigured()) return res.status(503).json({ error: "WPS API not configured" });
    const itemId = parseInt(req.params.itemId);
    const data = await wps.getItemById(itemId);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/wps/fitment-check", async (_req, res) => {
  try {
    if (!wps.isConfigured()) return res.status(503).json({ error: "WPS API not configured", fitmentAvailable: false });
    const data = await wps.getVehicleMakes();
    res.json({ fitmentAvailable: true, data });
  } catch (error: any) {
    if (error.message.includes("403")) {
      return res.json({ fitmentAvailable: false, message: "Vehicle fitment data requires additional WPS API permissions." });
    }
    res.status(500).json({ error: error.message, fitmentAvailable: false });
  }
});

app.get("/api/wps/vehicle/:vehicleId/items", async (req, res) => {
  try {
    if (!wps.isConfigured()) return res.status(503).json({ error: "WPS API not configured" });
    const vehicleId = parseInt(req.params.vehicleId);
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const data = await wps.getVehicleItems(vehicleId, page);
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/bigcommerce/lookup-skus", async (req, res) => {
  try {
    if (!bigcommerce.isConfigured()) return res.status(503).json({ error: "BigCommerce not configured" });
    const { skus } = req.body;
    if (!Array.isArray(skus) || skus.length === 0) return res.status(400).json({ error: "skus array is required" });
    if (skus.length > 5) return res.status(400).json({ error: "Maximum 5 SKUs per request" });
    const results = await bigcommerce.getProductsBySku(skus);
    const safeResults: Record<string, { id: number }> = {};
    for (const [sku, product] of Object.entries(results)) {
      safeResults[sku] = { id: (product as any).id };
    }
    res.json({ data: safeResults });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/bigcommerce/add-to-cart", async (req, res) => {
  try {
    if (!bigcommerce.isConfigured()) return res.status(503).json({ error: "BigCommerce not configured" });
    const { productId, quantity = 1 } = req.body;
    if (!productId) return res.status(400).json({ error: "productId is required" });
    const cart = await bigcommerce.createCart([{ product_id: productId, quantity }]);
    const redirectUrl = cart?.data?.redirect_urls?.cart_url;
    res.json({
      success: true,
      cartUrl: redirectUrl || `https://${bigcommerce.getStoreDomain()}/cart.php`,
      storeDomain: bigcommerce.getStoreDomain(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default app;
