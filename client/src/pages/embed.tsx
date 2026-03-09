import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, Loader2, Package, ShoppingCart, CheckCircle } from "lucide-react";

interface VehicleType { id: string; name: string; }
interface VehicleMake { id: string; name: string; types: string[]; }
interface VehicleModel { id: string; name: string; makeId: string; types: string[]; searchTerms: string[]; }

interface WpsItem {
  id: number;
  sku: string;
  name: string;
  list_price: string;
  standard_dealer_price: string;
  product_type: string;
  status: string;
  images?: { data: Array<{ domain: string; path: string; filename: string }> };
  product?: { data: { name: string; description: string } };
  inventory?: { data: { total: number } };
}

interface VehicleSearchResult {
  data: WpsItem[];
  grouped: Record<string, WpsItem[]>;
  totalFound: number;
}

function getItemImage(item: WpsItem): string | null {
  if (item.images?.data?.length) {
    const img = item.images.data[0];
    return `https://${img.domain}${img.path}${img.filename}`;
  }
  return null;
}

function getApiBase() {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin;
  if (origin.includes("vercel.app")) {
    return "https://vehicle-parts-finder.replit.app";
  }
  return origin;
}
const API_BASE = getApiBase();

async function apiFetch(path: string) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error("API error");
  return res.json();
}

export default function Embed() {
  const [vehicleType, setVehicleType] = useState("");
  const [year, setYear] = useState("");
  const [makeId, setMakeId] = useState("");
  const [modelId, setModelId] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<{
    type: string; year: string; make: string; makeName: string; model: string; modelName: string; searchTerms: string[];
  } | null>(() => {
    try {
      const saved = localStorage.getItem("motoparts-vehicle");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [activeCategory, setActiveCategory] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const [addingItem, setAddingItem] = useState<number | null>(null);
  const [addedItem, setAddedItem] = useState<number | null>(null);
  const [cartError, setCartError] = useState<number | null>(null);

  useEffect(() => {
    const sendHeight = () => {
      if (rootRef.current) {
        const height = rootRef.current.scrollHeight;
        window.parent.postMessage({ type: "motoparts-resize", height }, "*");
      }
    };
    sendHeight();
    const observer = new MutationObserver(sendHeight);
    if (rootRef.current) {
      observer.observe(rootRef.current, { childList: true, subtree: true, attributes: true });
    }
    window.addEventListener("resize", sendHeight);
    const interval = setInterval(sendHeight, 500);
    return () => { observer.disconnect(); window.removeEventListener("resize", sendHeight); clearInterval(interval); };
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "motoparts-cart-result") {
        if (e.data.success) {
          setAddedItem(e.data.itemId);
          setAddingItem(null);
          setTimeout(() => setAddedItem(null), 2000);
        } else {
          setCartError(e.data.itemId);
          setAddingItem(null);
          setTimeout(() => setCartError(null), 3000);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const { data: typesData } = useQuery<{ data: VehicleType[] }>({
    queryKey: ["/api/vehicle-types"],
    queryFn: () => apiFetch("/api/vehicle-types"),
  });
  const { data: yearsData } = useQuery<{ data: number[] }>({
    queryKey: ["/api/years"],
    queryFn: () => apiFetch("/api/years"),
  });

  const { data: makesData } = useQuery<{ data: VehicleMake[] }>({
    queryKey: ["/api/makes", vehicleType],
    queryFn: () => apiFetch(`/api/makes?type=${vehicleType}`),
    enabled: !!vehicleType,
  });

  const { data: modelsData } = useQuery<{ data: VehicleModel[] }>({
    queryKey: ["/api/models", makeId, vehicleType],
    queryFn: () => apiFetch(`/api/models?make=${makeId}&type=${vehicleType}`),
    enabled: !!makeId && !!vehicleType,
  });

  const { data: searchResults, isLoading: searchLoading } = useQuery<VehicleSearchResult>({
    queryKey: ["/api/parts/vehicle-search", selectedVehicle?.searchTerms, selectedVehicle?.makeName],
    queryFn: () => {
      const terms = selectedVehicle!.searchTerms.join(",");
      const makeParam = selectedVehicle!.makeName ? `&make=${encodeURIComponent(selectedVehicle!.makeName)}` : "";
      return apiFetch(`/api/parts/vehicle-search?terms=${encodeURIComponent(terms)}${makeParam}`);
    },
    enabled: !!selectedVehicle,
    staleTime: 5 * 60 * 1000,
  });

  const categories = searchResults?.grouped ? Object.keys(searchResults.grouped) : [];
  const activeParts = activeCategory && searchResults?.grouped?.[activeCategory] ? searchResults.grouped[activeCategory] : [];

  useEffect(() => { setMakeId(""); setModelId(""); }, [vehicleType]);
  useEffect(() => { setModelId(""); }, [makeId]);
  useEffect(() => {
    if (categories.length && activeCategory && !categories.includes(activeCategory)) setActiveCategory("");
  }, [categories.join(",")]);

  const handleSearch = () => {
    if (!vehicleType || !year || !makeId || !modelId) return;
    const makeName = makesData?.data?.find(m => m.id === makeId)?.name || makeId;
    const model = modelsData?.data?.find(m => m.id === modelId);
    const modelName = model?.name || modelId;
    const searchTerms = model?.searchTerms || [modelName];
    const vehicle = { type: vehicleType, year, make: makeId, makeName, model: modelId, modelName, searchTerms };
    setSelectedVehicle(vehicle);
    setActiveCategory("");
    try { localStorage.setItem("motoparts-vehicle", JSON.stringify(vehicle)); } catch {}
  };

  const clearSelection = () => {
    setSelectedVehicle(null);
    setActiveCategory("");
    try { localStorage.removeItem("motoparts-vehicle"); } catch {}
  };

  const handleAddToCart = async (item: WpsItem) => {
    setAddingItem(item.id);
    setCartError(null);
    try {
      const res = await fetch(`${API_BASE}/api/bigcommerce/lookup-skus`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus: [item.sku] }),
      });
      const data = await res.json();
      const match = data?.data?.[item.sku];
      if (match && match.id) {
        window.parent.postMessage({
          type: "motoparts-add-to-cart",
          itemId: item.id,
          productId: match.id,
          sku: item.sku,
          name: item.name,
          price: item.list_price,
        }, "*");
      } else {
        setCartError(item.id);
        setAddingItem(null);
        setTimeout(() => setCartError(null), 3000);
      }
    } catch {
      setCartError(item.id);
      setAddingItem(null);
      setTimeout(() => setCartError(null), 3000);
    }
  };

  const renderPartCard = (item: WpsItem) => {
    const imageUrl = getItemImage(item);
    const isAdding = addingItem === item.id;
    const isAdded = addedItem === item.id;
    const hasError = cartError === item.id;
    return (
      <div key={item.id} className="ymm-card" style={{ display: "flex", flexDirection: "column" }} data-testid={`embed-part-${item.id}`}>
        <div style={{ aspectRatio: "1", background: "#0a0a0a", position: "relative", overflow: "hidden" }}>
          {imageUrl ? (
            <img src={imageUrl} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 16 }} loading="lazy" />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: 0.3 }}>
              <Package style={{ width: 40, height: 40, color: "#525252" }} />
            </div>
          )}
          <div style={{ position: "absolute", top: 8, left: 8, display: "flex", gap: 4 }}>
            <span className="badge badge-wps">WPS</span>
            {item.inventory?.data?.total && item.inventory.data.total > 0 && <span className="badge badge-stock">In Stock</span>}
          </div>
        </div>
        <div style={{ padding: 14, display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 11, color: "#525252", fontFamily: "monospace", marginBottom: 4 }}>{item.sku}</div>
          <h4 style={{ fontSize: 13, fontWeight: 500, color: "#fff", marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 36 }}>{item.name}</h4>
          {item.product?.data?.name && (
            <div style={{ fontSize: 11, color: "#737373", marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.product.data.name}</div>
          )}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>${parseFloat(item.list_price).toFixed(2)}</span>
            <span className="badge" style={{ background: "#262626", color: "#a3a3a3", fontSize: 9 }}>{item.product_type}</span>
          </div>
          <div style={{ marginTop: "auto" }}>
            {hasError ? (
              <a
                href={`https://www.fuelpowersportscs.com/search.php?search_query=${encodeURIComponent(item.sku)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="cart-btn"
                style={{ textDecoration: "none", background: "#525252" }}
                data-testid={`cart-search-${item.id}`}
              >
                Search in Store
              </a>
            ) : (
              <button
                className={`cart-btn ${isAdded ? "added" : ""}`}
                onClick={() => handleAddToCart(item)}
                disabled={isAdding}
                data-testid={`cart-add-${item.id}`}
              >
                {isAdding ? (
                  <><Loader2 style={{ width: 14, height: 14, animation: "spin 0.8s linear infinite" }} /> Adding...</>
                ) : isAdded ? (
                  <><CheckCircle style={{ width: 14, height: 14 }} /> Added to Cart!</>
                ) : (
                  <><ShoppingCart style={{ width: 14, height: 14 }} /> Add to Cart</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div ref={rootRef} id="motoparts-embed-root" style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#e5e5e5", background: "transparent", margin: 0, padding: 0 }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body, html { background: transparent !important; }
        .ymm-select { width: 100%; padding: 5px 6px; background: #0a0a0a; border: 1px solid #262626; color: #fff; border-radius: 2px; font-size: 12px; appearance: auto; cursor: pointer; }
        .ymm-select:disabled { opacity: 0.5; cursor: not-allowed; }
        .ymm-select:focus { outline: none; border-color: hsl(15, 90%, 55%); }
        .ymm-btn { padding: 6px 14px; background: hsl(15, 90%, 55%); color: #fff; border: none; border-radius: 2px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; transition: background 0.2s; white-space: nowrap; }
        .ymm-btn:hover { background: hsl(15, 90%, 48%); }
        .ymm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .selector-row { display: flex; align-items: center; gap: 6px; background: #171717; border: 1px solid #262626; border-radius: 2px; padding: 6px 10px; }
        .selector-row > div { flex: 1; min-width: 0; }
        .selector-row > button { flex: 0 0 auto; }
        @media (max-width: 640px) {
          .selector-row { flex-wrap: wrap; }
          .selector-row > div { flex: 1 1 calc(50% - 3px); min-width: calc(50% - 3px); }
          .selector-row > button { width: 100%; }
        }
        .ymm-card { background: #171717; border: 1px solid #262626; border-radius: 2px; overflow: hidden; transition: border-color 0.2s; }
        .ymm-card:hover { border-color: #525252; }
        .cat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin-bottom: 16px; }
        @media (min-width: 768px) { .cat-grid { grid-template-columns: repeat(4, 1fr); } }
        @media (min-width: 1024px) { .cat-grid { grid-template-columns: repeat(5, 1fr); } }
        .cat-tile { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; border: 1px solid #262626; background: #171717; color: #a3a3a3; cursor: pointer; transition: all 0.2s; text-align: center; min-height: 60px; }
        .cat-tile:hover { color: #fff; background: #262626; border-color: #404040; }
        .cat-tile.active { background: hsl(15, 90%, 55%); color: #fff; border-color: hsl(15, 90%, 55%); }
        .cat-tile-count { font-size: 10px; opacity: 0.7; margin-top: 4px; }
        .parts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
        @media (min-width: 768px) { .parts-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (min-width: 1024px) { .parts-grid { grid-template-columns: repeat(4, 1fr); } }
        .back-to-cats { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; background: transparent; border: 1px solid #404040; color: #a3a3a3; border-radius: 2px; font-size: 12px; cursor: pointer; transition: all 0.2s; margin-bottom: 12px; }
        .back-to-cats:hover { color: #fff; border-color: #737373; }
        .badge { display: inline-block; padding: 2px 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; border-radius: 2px; }
        .badge-wps { background: hsl(15, 90%, 55%); color: #fff; }
        .badge-stock { background: #16a34a; color: #fff; }
        .cart-btn { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 8px 12px; background: hsl(15, 90%, 55%); color: #fff; border: none; border-radius: 2px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer; transition: background 0.2s; }
        .cart-btn:hover { background: hsl(15, 90%, 48%); }
        .cart-btn:disabled { opacity: 0.6; cursor: wait; }
        .cart-btn.added { background: #16a34a; }
        .cart-btn.error { background: #525252; }
        .spinner { width: 40px; height: 40px; border: 3px solid #262626; border-top-color: hsl(15, 90%, 55%); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "4px 8px" }}>
        {!selectedVehicle ? (
          <div>
            <div className="selector-row">
              <div>
                <select className="ymm-select" value={vehicleType} onChange={e => setVehicleType(e.target.value)} data-testid="embed-select-type">
                  <option value="">Select type...</option>
                  {typesData?.data?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <select className="ymm-select" value={year} onChange={e => setYear(e.target.value)} disabled={!vehicleType} data-testid="embed-select-year">
                  <option value="">Select year...</option>
                  {yearsData?.data?.map(y => <option key={y} value={y.toString()}>{y}</option>)}
                </select>
              </div>
              <div>
                <select className="ymm-select" value={makeId} onChange={e => setMakeId(e.target.value)} disabled={!year} data-testid="embed-select-make">
                  <option value="">Select make...</option>
                  {makesData?.data?.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <select className="ymm-select" value={modelId} onChange={e => setModelId(e.target.value)} disabled={!makeId} data-testid="embed-select-model">
                  <option value="">Select model...</option>
                  {modelsData?.data?.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <button className="ymm-btn" disabled={!vehicleType || !year || !makeId || !modelId} onClick={handleSearch} data-testid="embed-button-find">
                Find Parts
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "5px 10px", border: "1px solid rgba(234,88,12,0.2)", background: "rgba(234,88,12,0.05)", borderRadius: 2, marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Filter style={{ width: 14, height: 14, color: "hsl(15,90%,55%)", flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", textTransform: "uppercase" }} data-testid="embed-vehicle-name">
                  {selectedVehicle.year} {selectedVehicle.makeName} {selectedVehicle.modelName}
                </span>
                {searchResults && (
                  <span style={{ fontSize: 11, color: "#737373" }}>
                    ({searchResults.totalFound} parts)
                  </span>
                )}
              </div>
              <button onClick={clearSelection} style={{ padding: "4px 10px", border: "1px solid #404040", background: "transparent", color: "#a3a3a3", borderRadius: 2, fontSize: 11, cursor: "pointer", textTransform: "uppercase", whiteSpace: "nowrap" }} data-testid="embed-button-change">
                Change
              </button>
            </div>

            {searchLoading ? (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <div className="spinner"></div>
                <p style={{ color: "#737373", fontSize: 14 }}>Searching for parts that fit your {selectedVehicle.modelName}...</p>
              </div>
            ) : categories.length > 0 ? (
              <div>
                {!activeCategory ? (
                  <div>
                    <p style={{ fontSize: 13, color: "#737373", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
                      Select a category ({searchResults!.totalFound} parts available)
                    </p>
                    <div className="cat-grid">
                      {categories.map(cat => (
                        <button
                          key={cat}
                          className="cat-tile"
                          onClick={() => setActiveCategory(cat)}
                          data-testid={`embed-cat-${cat.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          {cat}
                          <span className="cat-tile-count">{searchResults!.grouped[cat].length} parts</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <button className="back-to-cats" onClick={() => setActiveCategory("")} data-testid="embed-button-back-categories">
                      &larr; All Categories
                    </button>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#fff" }}>{activeCategory}</h3>
                      <span style={{ fontSize: 12, color: "#737373" }}>{activeParts.length} parts</span>
                    </div>
                    <div className="parts-grid">
                      {activeParts.map(renderPartCard)}
                    </div>
                    <div style={{ marginTop: 16, textAlign: "center" }}>
                      <button className="back-to-cats" onClick={() => setActiveCategory("")} data-testid="embed-button-back-categories-bottom">
                        &larr; Back to All Categories
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <Package style={{ width: 48, height: 48, color: "#525252", margin: "0 auto 12px" }} />
                <h3 style={{ fontSize: 16, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, color: "#a3a3a3" }}>No Parts Found</h3>
                <p style={{ color: "#525252", maxWidth: 400, margin: "0 auto", fontSize: 13 }}>
                  No parts matched your {selectedVehicle.year} {selectedVehicle.makeName} {selectedVehicle.modelName}. Try a different vehicle or check back later.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
