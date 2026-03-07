import { log } from "./index";

function getConfig() {
  const storeHash = process.env.BIGCOMMERCE_STORE_HASH;
  const accessToken = process.env.BIGCOMMERCE_ACCESS_TOKEN;
  if (!storeHash || !accessToken) {
    throw new Error("BigCommerce credentials not configured");
  }
  return { storeHash, accessToken };
}

async function bcRequest(endpoint: string, method = "GET", body?: any): Promise<any> {
  const { storeHash, accessToken } = getConfig();
  const url = `https://api.bigcommerce.com/stores/${storeHash}/v3${endpoint}`;

  const headers: Record<string, string> = {
    "X-Auth-Token": accessToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    log(`BigCommerce API error ${response.status}: ${errorText}`, "bigcommerce");
    throw new Error(`BigCommerce API error: ${response.status}`);
  }

  return response.json();
}

export async function getProducts(params?: {
  page?: number;
  limit?: number;
  keyword?: string;
  sku?: string;
}): Promise<any> {
  const queryParts: string[] = [];
  if (params?.page) queryParts.push(`page=${params.page}`);
  if (params?.limit) queryParts.push(`limit=${params.limit}`);
  if (params?.keyword) queryParts.push(`keyword=${encodeURIComponent(params.keyword)}`);
  if (params?.sku) queryParts.push(`sku=${encodeURIComponent(params.sku)}`);
  const qs = queryParts.length ? `?${queryParts.join("&")}` : "";
  return bcRequest(`/catalog/products${qs}`);
}

export async function getProduct(productId: number): Promise<any> {
  return bcRequest(`/catalog/products/${productId}?include=images,variants`);
}

export async function createProduct(productData: any): Promise<any> {
  return bcRequest("/catalog/products", "POST", productData);
}

export async function updateProduct(productId: number, productData: any): Promise<any> {
  return bcRequest(`/catalog/products/${productId}`, "PUT", productData);
}

export async function getCategories(): Promise<any> {
  return bcRequest("/catalog/categories");
}

export async function getStoreInfo(): Promise<any> {
  const { storeHash, accessToken } = getConfig();
  const url = `https://api.bigcommerce.com/stores/${storeHash}/v2/store`;
  const response = await fetch(url, {
    headers: {
      "X-Auth-Token": accessToken,
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`BigCommerce API error: ${response.status}`);
  return response.json();
}

export async function getProductBySku(sku: string): Promise<any> {
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

export async function getProductsBySku(skus: string[]): Promise<Record<string, any>> {
  const results: Record<string, any> = {};
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
            url: product.custom_url?.url || `/product/${product.id}`,
          };
        }
      } catch (err: any) {
        log(`SKU lookup failed for ${sku}: ${err.message}`, "bigcommerce");
      }
    });
    await Promise.all(promises);
  }
  return results;
}

export async function createCart(lineItems: { product_id: number; quantity: number }[]): Promise<any> {
  return bcRequest("/carts?include=redirect_urls", "POST", {
    line_items: lineItems.map(item => ({
      product_id: item.product_id,
      quantity: item.quantity,
    })),
  });
}

export function getStoreDomain(): string {
  return "www.fuelpowersportscs.com";
}

export function isConfigured(): boolean {
  return !!process.env.BIGCOMMERCE_STORE_HASH && !!process.env.BIGCOMMERCE_ACCESS_TOKEN;
}