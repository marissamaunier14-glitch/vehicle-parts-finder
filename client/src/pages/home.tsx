import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, X, Filter, Loader2, AlertCircle, Package, ChevronLeft, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

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

interface WpsResponse {
  data: WpsItem[];
  meta?: { cursor?: { count?: number; next?: string | null; current?: string } };
}

function getItemImage(item: WpsItem): string | null {
  if (item.images?.data?.length) {
    const img = item.images.data[0];
    return `https://${img.domain}${img.path}${img.filename}`;
  }
  return null;
}

export default function Home() {
  const [vehicleType, setVehicleType] = useState("");
  const [year, setYear] = useState("");
  const [makeId, setMakeId] = useState("");
  const [modelId, setModelId] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<{
    type: string; year: string; make: string; makeName: string; model: string; modelName: string;
  } | null>(null);
  const [activeCategory, setActiveCategory] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [currentCursor, setCurrentCursor] = useState<string | undefined>(undefined);

  const { data: statusData } = useQuery<{ wpsConfigured: boolean; bigcommerceConfigured: boolean }>({
    queryKey: ["/api/status"],
  });

  const { data: typesData } = useQuery<{ data: VehicleType[] }>({
    queryKey: ["/api/vehicle-types"],
  });

  const { data: yearsData } = useQuery<{ data: number[] }>({
    queryKey: ["/api/years"],
  });

  const { data: makesData } = useQuery<{ data: VehicleMake[] }>({
    queryKey: ["/api/makes", vehicleType],
    queryFn: async () => {
      const res = await fetch(`/api/makes?type=${vehicleType}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!vehicleType,
  });

  const { data: modelsData } = useQuery<{ data: VehicleModel[] }>({
    queryKey: ["/api/models", makeId, vehicleType],
    queryFn: async () => {
      const res = await fetch(`/api/models?make=${makeId}&type=${vehicleType}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!makeId && !!vehicleType,
  });

  const { data: categoriesData } = useQuery<{ data: string[] }>({
    queryKey: ["/api/parts/categories", selectedVehicle?.type],
    queryFn: async () => {
      const res = await fetch(`/api/parts/categories?type=${selectedVehicle!.type}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedVehicle,
  });

  const { data: partsData, isLoading: partsLoading, error: partsError } = useQuery<WpsResponse>({
    queryKey: ["/api/parts/browse", activeCategory, currentCursor],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeCategory) params.set("category", activeCategory);
      if (currentCursor) params.set("cursor", currentCursor);
      const res = await fetch(`/api/parts/browse?${params}`);
      if (!res.ok) throw new Error("Failed to load parts");
      return res.json();
    },
    enabled: !!selectedVehicle && !!activeCategory,
  });

  useEffect(() => { setMakeId(""); setModelId(""); }, [vehicleType]);
  useEffect(() => { setModelId(""); }, [makeId]);
  useEffect(() => {
    if (partsData?.meta?.cursor?.next) {
      setNextCursor(partsData.meta.cursor.next);
    } else {
      setNextCursor(null);
    }
  }, [partsData]);

  useEffect(() => {
    if (categoriesData?.data?.length && !activeCategory) {
      setActiveCategory(categoriesData.data[0]);
    }
  }, [categoriesData, activeCategory]);

  const handleSearch = () => {
    if (!vehicleType || !year || !makeId || !modelId) return;
    const makeName = makesData?.data?.find(m => m.id === makeId)?.name || makeId;
    const modelName = modelsData?.data?.find(m => m.id === modelId)?.name || modelId;
    setSelectedVehicle({ type: vehicleType, year, make: makeId, makeName, model: modelId, modelName });
    setActiveCategory("");
    setCurrentCursor(undefined);
    setNextCursor(null);
  };

  const clearSelection = () => {
    setSelectedVehicle(null);
    setActiveCategory("");
    setCurrentCursor(undefined);
    setNextCursor(null);
  };

  const handleCategoryChange = (category: string) => {
    setActiveCategory(category);
    setCurrentCursor(undefined);
    setNextCursor(null);
  };

  const handleNextPage = () => {
    if (nextCursor) setCurrentCursor(nextCursor);
  };

  const wpsConfigured = statusData?.wpsConfigured;
  const availableParts = partsData?.data?.filter(item => item.status !== "NLA") || [];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans">
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary flex items-center justify-center rounded-sm skew-x-[-10deg]">
              <span className="font-bold text-white text-lg skew-x-[10deg]">P</span>
            </div>
            <span className="font-bold text-xl tracking-wider text-white uppercase">Part<span className="text-primary">Finder</span></span>
          </div>
          <div className="flex items-center gap-3">
            <a href="/embed-instructions" className="text-xs text-neutral-400 hover:text-primary transition-colors font-medium uppercase tracking-wider" data-testid="link-embed-code">
              Get Embed Code
            </a>
            {statusData && (
              <>
                <Badge variant={wpsConfigured ? "default" : "destructive"} className="text-[10px] rounded-sm" data-testid="status-wps">
                  WPS {wpsConfigured ? "Live" : "Offline"}
                </Badge>
                <Badge variant={statusData.bigcommerceConfigured ? "default" : "destructive"} className="text-[10px] rounded-sm" data-testid="status-bc">
                  BC {statusData.bigcommerceConfigured ? "Live" : "Offline"}
                </Badge>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative pt-16 pb-20 overflow-hidden">
          <div className="absolute inset-0 z-0">
            <div className="absolute inset-0 bg-gradient-to-b from-neutral-900 to-neutral-950"></div>
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}></div>
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="grid lg:grid-cols-2 gap-12 items-start">
              <div className="max-w-2xl pt-8">
                <Badge variant="outline" className="mb-6 border-primary/30 text-primary bg-primary/10 rounded-sm tracking-wider uppercase text-xs" data-testid="badge-guarantee">
                  WPS Catalog
                </Badge>
                <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-6 uppercase leading-[0.95]">
                  Find parts that <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-orange-400">actually fit</span> your machine.
                </h1>
                <p className="text-lg text-neutral-400 mb-8 max-w-xl">
                  Select your vehicle type, year, make, and model. We'll show you relevant parts from the WPS catalog for your ride.
                </p>
                {!wpsConfigured && statusData && (
                  <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-sm flex items-start gap-3" data-testid="alert-wps-offline">
                    <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold text-destructive">WPS API Not Connected</p>
                      <p className="text-sm text-neutral-400 mt-1">Set your WPS_API_KEY environment variable to enable live parts data from Western Power Sports.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:justify-self-end w-full max-w-md">
                <Card className="bg-neutral-900/80 backdrop-blur-xl border-neutral-800 shadow-2xl rounded-sm">
                  <CardHeader className="border-b border-neutral-800 pb-4">
                    <CardTitle className="text-2xl tracking-wider uppercase text-white">Select Your Ride</CardTitle>
                    <CardDescription className="text-neutral-400">Find compatible parts instantly</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-5">
                    <div className="space-y-2">
                      <Label className="text-neutral-300 text-xs uppercase tracking-wider font-semibold">1. Vehicle Type</Label>
                      <Select value={vehicleType} onValueChange={setVehicleType}>
                        <SelectTrigger className="bg-neutral-950 border-neutral-800 text-white focus:ring-primary rounded-sm h-12" data-testid="select-type">
                          <SelectValue placeholder="Select type..." />
                        </SelectTrigger>
                        <SelectContent className="bg-neutral-900 border-neutral-800 text-white rounded-sm">
                          {typesData?.data?.map(t => (
                            <SelectItem key={t.id} value={t.id} className="focus:bg-neutral-800 focus:text-white cursor-pointer">{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-neutral-300 text-xs uppercase tracking-wider font-semibold">2. Year</Label>
                      <Select value={year} onValueChange={setYear} disabled={!vehicleType}>
                        <SelectTrigger className="bg-neutral-950 border-neutral-800 text-white focus:ring-primary rounded-sm h-12" data-testid="select-year">
                          <SelectValue placeholder="Select year..." />
                        </SelectTrigger>
                        <SelectContent className="bg-neutral-900 border-neutral-800 text-white rounded-sm max-h-[300px]">
                          {yearsData?.data?.map(y => (
                            <SelectItem key={y} value={y.toString()} className="focus:bg-neutral-800 focus:text-white cursor-pointer">{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-neutral-300 text-xs uppercase tracking-wider font-semibold">3. Make</Label>
                      <Select value={makeId} onValueChange={setMakeId} disabled={!year}>
                        <SelectTrigger className="bg-neutral-950 border-neutral-800 text-white focus:ring-primary rounded-sm h-12" data-testid="select-make">
                          <SelectValue placeholder="Select make..." />
                        </SelectTrigger>
                        <SelectContent className="bg-neutral-900 border-neutral-800 text-white rounded-sm max-h-[300px]">
                          {makesData?.data?.map(m => (
                            <SelectItem key={m.id} value={m.id} className="focus:bg-neutral-800 focus:text-white cursor-pointer">{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-neutral-300 text-xs uppercase tracking-wider font-semibold">4. Model</Label>
                      <Select value={modelId} onValueChange={setModelId} disabled={!makeId}>
                        <SelectTrigger className="bg-neutral-950 border-neutral-800 text-white focus:ring-primary rounded-sm h-12" data-testid="select-model">
                          <SelectValue placeholder="Select model..." />
                        </SelectTrigger>
                        <SelectContent className="bg-neutral-900 border-neutral-800 text-white rounded-sm max-h-[300px]">
                          {modelsData?.data?.map(m => (
                            <SelectItem key={m.id} value={m.id} className="focus:bg-neutral-800 focus:text-white cursor-pointer">{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-2">
                    <Button
                      className="w-full h-12 text-md uppercase tracking-widest font-bold rounded-sm bg-primary hover:bg-primary/90 text-white"
                      disabled={!vehicleType || !year || !makeId || !modelId}
                      onClick={handleSearch}
                      data-testid="button-find-parts"
                    >
                      Find Parts
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <section className="py-16 bg-neutral-950 min-h-[500px]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {selectedVehicle ? (
              <>
                <div className="mb-8 p-4 border border-primary/20 bg-primary/5 rounded-sm flex flex-col sm:flex-row items-center justify-between gap-4" data-testid="banner-selected-vehicle">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/20 flex items-center justify-center rounded-sm">
                      <Filter className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-neutral-400 uppercase tracking-wider font-semibold mb-0.5">Browsing parts for:</p>
                      <p className="text-lg font-bold text-white uppercase tracking-wide" data-testid="text-vehicle-name">
                        {selectedVehicle.year} {selectedVehicle.makeName} {selectedVehicle.modelName}
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={clearSelection} className="border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white rounded-sm uppercase text-xs tracking-wider" data-testid="button-change-vehicle">
                    <X className="w-3 h-3 mr-2" /> Change Vehicle
                  </Button>
                </div>

                <div className="mb-4 p-3 bg-neutral-900/50 border border-neutral-800 rounded-sm flex items-start gap-2" data-testid="info-fitment">
                  <Info className="w-4 h-4 text-neutral-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-neutral-500">
                    Showing WPS catalog parts by category for your vehicle type. For exact vehicle-specific fitment matching, 
                    contact your WPS sales rep to enable the Vehicle Fitment API on your account.
                  </p>
                </div>

                {/* Category Tabs */}
                <div className="mb-8 overflow-x-auto">
                  <div className="flex gap-2 min-w-max pb-2">
                    {categoriesData?.data?.map(cat => (
                      <button
                        key={cat}
                        onClick={() => handleCategoryChange(cat)}
                        className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors whitespace-nowrap ${
                          activeCategory === cat
                            ? "bg-primary text-white"
                            : "bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800 border border-neutral-800"
                        }`}
                        data-testid={`button-category-${cat.toLowerCase().replace(/\s+/g, "-")}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {partsLoading ? (
                  <div className="flex flex-col items-center justify-center py-20" data-testid="loading-parts">
                    <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                    <p className="text-neutral-400 text-lg">Loading {activeCategory} from WPS...</p>
                  </div>
                ) : partsError ? (
                  <div className="text-center py-20" data-testid="error-parts">
                    <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
                    <h3 className="text-2xl uppercase tracking-wider mb-2">Error Loading Parts</h3>
                    <p className="text-neutral-500 max-w-md mx-auto">There was an issue connecting to WPS. Please try again.</p>
                  </div>
                ) : availableParts.length ? (
                  <div>
                    <div className="flex justify-between items-end mb-6">
                      <h2 className="text-2xl font-bold uppercase tracking-wider" data-testid="text-results-title">{activeCategory}</h2>
                      <span className="text-sm text-neutral-400" data-testid="text-results-count">
                        {partsData?.meta?.cursor?.count !== undefined ? `${partsData.meta.cursor.count} Total` : `${availableParts.length} Shown`}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {availableParts.map((item) => {
                        const imageUrl = getItemImage(item);
                        return (
                          <Card key={item.id} className="bg-neutral-900 border-neutral-800 rounded-sm overflow-hidden group hover:border-neutral-600 transition-colors" data-testid={`card-part-${item.id}`}>
                            <div className="aspect-square bg-neutral-950 relative overflow-hidden">
                              {imageUrl ? (
                                <img
                                  src={imageUrl}
                                  alt={item.name}
                                  className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-30">
                                  <Package className="w-12 h-12 text-neutral-500 mb-2" />
                                  <span className="text-neutral-500 uppercase tracking-widest text-xs">No Image</span>
                                </div>
                              )}
                              <div className="absolute top-3 left-3 flex gap-1">
                                <Badge className="bg-primary hover:bg-primary text-white text-[10px] uppercase tracking-wider rounded-sm font-bold px-2 py-0.5">
                                  WPS
                                </Badge>
                                {item.inventory?.data?.total && item.inventory.data.total > 0 && (
                                  <Badge className="bg-green-600 hover:bg-green-600 text-white text-[10px] uppercase tracking-wider rounded-sm font-bold px-2 py-0.5">
                                    In Stock
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <CardContent className="p-4">
                              <div className="text-xs text-neutral-500 mb-1 font-mono" data-testid={`text-sku-${item.id}`}>{item.sku}</div>
                              <h3 className="font-medium text-white line-clamp-2 min-h-[40px] mb-1" data-testid={`text-name-${item.id}`}>{item.name}</h3>
                              {item.product?.data?.name && item.product.data.name !== item.name && (
                                <p className="text-xs text-neutral-500 line-clamp-1 mb-2">{item.product.data.name}</p>
                              )}
                              <div className="flex items-end justify-between mt-3">
                                <div>
                                  <span className="text-xl font-bold text-white" data-testid={`text-price-${item.id}`}>
                                    ${parseFloat(item.list_price).toFixed(2)}
                                  </span>
                                  {item.standard_dealer_price && (
                                    <span className="text-xs text-neutral-500 ml-2">
                                      Dealer: ${parseFloat(item.standard_dealer_price).toFixed(2)}
                                    </span>
                                  )}
                                </div>
                                <div className="text-primary hover:text-primary-foreground hover:bg-primary w-8 h-8 rounded-sm flex items-center justify-center transition-colors border border-primary/20 cursor-pointer">
                                  <ChevronRight className="w-4 h-4" />
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>

                    {(nextCursor || currentCursor) && (
                      <div className="flex justify-center gap-3 mt-10">
                        {currentCursor && (
                          <Button variant="outline" size="sm" onClick={() => { setCurrentCursor(undefined); }} className="border-neutral-700 text-neutral-300 rounded-sm" data-testid="button-first-page">
                            <ChevronLeft className="w-4 h-4 mr-1" /> First Page
                          </Button>
                        )}
                        {nextCursor && (
                          <Button variant="outline" size="sm" onClick={handleNextPage} className="border-neutral-700 text-neutral-300 rounded-sm" data-testid="button-next-page">
                            Next Page <ChevronRight className="w-4 h-4 ml-1" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-20" data-testid="empty-parts">
                    <div className="w-16 h-16 mx-auto bg-neutral-900 flex items-center justify-center rounded-full mb-4">
                      <Package className="w-6 h-6 text-neutral-500" />
                    </div>
                    <h3 className="text-2xl uppercase tracking-wider mb-2">No {activeCategory} Found</h3>
                    <p className="text-neutral-500 max-w-md mx-auto">
                      No items found in the "{activeCategory}" category. Try another category above.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-20 opacity-50" data-testid="empty-no-vehicle">
                <div className="w-16 h-16 mx-auto bg-neutral-900 flex items-center justify-center rounded-full mb-4">
                  <Filter className="w-6 h-6 text-neutral-500" />
                </div>
                <h3 className="text-2xl uppercase tracking-wider mb-2">Select a vehicle to see parts</h3>
                <p className="text-neutral-500 max-w-md mx-auto">Use the selector above to find exactly what fits your specific machine.</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}