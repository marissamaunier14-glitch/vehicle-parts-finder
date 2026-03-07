import { useState, useEffect } from "react";
import { Copy, Check, Code, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

function CopyBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-neutral-400 uppercase tracking-wider font-semibold">{label}</span>
        <Button variant="ghost" size="sm" onClick={handleCopy} className="text-neutral-400 hover:text-white h-7 text-xs" data-testid={`button-copy-${label.toLowerCase().replace(/\s+/g, "-")}`}>
          {copied ? <><Check className="w-3 h-3 mr-1" /> Copied!</> : <><Copy className="w-3 h-3 mr-1" /> Copy</>}
        </Button>
      </div>
      <pre className="bg-neutral-950 border border-neutral-800 rounded-sm p-4 overflow-x-auto text-sm text-green-400 font-mono whitespace-pre-wrap break-all">
        {code}
      </pre>
    </div>
  );
}

export default function EmbedInstructions() {
  const [appUrl, setAppUrl] = useState("");

  useEffect(() => {
    setAppUrl(window.location.origin);
  }, []);

  const iframeCode = `<!-- Parts Finder Widget -->
<div id="motoparts-widget"></div>
<script>
(function() {
  var iframe = document.createElement('iframe');
  iframe.src = '${appUrl}/embed';
  iframe.style.cssText = 'width:100%;height:42px;border:none;overflow:hidden;';
  iframe.title = 'Parts Finder';
  iframe.setAttribute('scrolling', 'no');
  document.getElementById('motoparts-widget').appendChild(iframe);

  function addToCart(productId) {
    return fetch('/api/storefront/carts', { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(carts) {
        var cartId = (carts && carts.length) ? carts[0].id : null;
        var url = cartId
          ? '/api/storefront/carts/' + cartId + '/items'
          : '/api/storefront/carts';
        var body = { lineItems: [{ productId: productId, quantity: 1 }] };
        return fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
      })
      .then(function(r) { return r.ok; });
  }

  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'motoparts-resize') {
      iframe.style.height = e.data.height + 'px';
    }
    if (e.data && e.data.type === 'motoparts-add-to-cart') {
      var productId = e.data.productId;
      var itemId = e.data.itemId;
      if (!productId) {
        iframe.contentWindow.postMessage({ type: 'motoparts-cart-result', itemId: itemId, success: false }, '*');
        return;
      }
      addToCart(productId)
        .then(function(ok) {
          iframe.contentWindow.postMessage({ type: 'motoparts-cart-result', itemId: itemId, success: !!ok }, '*');
          if (ok) {
            var cartCount = document.querySelector('.navUser-item--cart .countPill, .cart-quantity, [data-cart-count]');
            if (cartCount) {
              var n = parseInt(cartCount.textContent) || 0;
              cartCount.textContent = n + 1;
            }
          }
        })
        .catch(function() {
          iframe.contentWindow.postMessage({ type: 'motoparts-cart-result', itemId: itemId, success: false }, '*');
        });
    }
  });
})();
</script>`;

  const scriptCode = iframeCode;

  const bigcommerceSteps = `Steps to add to your BigCommerce store:

1. Log in to your BigCommerce admin panel
2. Go to Storefront > Web Pages
3. Click "Create a Web Page"
4. Set the Page Name (e.g., "Parts Finder")
5. Switch to the HTML editor (click the "</>" icon)
6. Paste the embed code below
7. Save the page

Alternatively, to add it to an existing page:
1. Go to Storefront > Web Pages
2. Edit the page where you want the widget
3. Switch to HTML editor
4. Paste the code where you want it to appear
5. Save`;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans">
      <header className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary flex items-center justify-center rounded-sm skew-x-[-10deg]">
              <span className="font-bold text-white text-lg skew-x-[10deg]">M</span>
            </div>
            <span className="font-bold text-xl tracking-wider text-white uppercase">Moto<span className="text-primary">Parts</span></span>
          </div>
          <a href="/" className="text-sm text-neutral-400 hover:text-white transition-colors" data-testid="link-back-home">← Back to App</a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-10">
          <Badge variant="outline" className="mb-4 border-primary/30 text-primary bg-primary/10 rounded-sm tracking-wider uppercase text-xs">
            <Code className="w-3 h-3 mr-1" /> Embed Guide
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-4 uppercase">
            Add to Your BigCommerce Store
          </h1>
          <p className="text-lg text-neutral-400 max-w-2xl">
            Copy and paste one of these code snippets into your BigCommerce store to embed the parts finder widget.
          </p>
        </div>

        <div className="space-y-8">
          <Card className="bg-neutral-900 border-neutral-800 rounded-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge className="bg-green-600 hover:bg-green-600 text-white rounded-sm text-[10px]">Auto-Resizing</Badge>
                <CardTitle className="text-xl text-white">Embed Code</CardTitle>
              </div>
              <CardDescription className="text-neutral-400">
                Copy and paste this into your BigCommerce page. The widget automatically adjusts its height to fit the content — no giant empty space.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CopyBlock code={iframeCode} label="Widget Code" />
            </CardContent>
          </Card>

          <Separator className="bg-neutral-800" />

          {/* BigCommerce Instructions */}
          <Card className="bg-neutral-900 border-neutral-800 rounded-sm">
            <CardHeader>
              <CardTitle className="text-xl text-white">How to Add to BigCommerce</CardTitle>
              <CardDescription className="text-neutral-400">
                Step-by-step instructions for adding the widget to your store
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-white mb-3">Option A: Create a New Page</h3>
                  <ol className="space-y-3 text-neutral-300 text-sm">
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">1.</span>
                      <span>Log in to your BigCommerce admin panel</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">2.</span>
                      <span>Go to <strong className="text-white">Storefront → Web Pages</strong></span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">3.</span>
                      <span>Click <strong className="text-white">"Create a Web Page"</strong></span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">4.</span>
                      <span>Set the Page Name to something like <strong className="text-white">"Parts Finder"</strong></span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">5.</span>
                      <span>In the page editor, click the <strong className="text-white">HTML button {"</>"}</strong> to switch to the code editor</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">6.</span>
                      <span><strong className="text-white">Paste</strong> either embed code from above</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">7.</span>
                      <span>Click <strong className="text-white">Save</strong> — the widget will appear on your page</span>
                    </li>
                  </ol>
                </div>

                <Separator className="bg-neutral-800" />

                <div>
                  <h3 className="font-semibold text-white mb-3">Option B: Add to an Existing Page</h3>
                  <ol className="space-y-3 text-neutral-300 text-sm">
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">1.</span>
                      <span>Go to <strong className="text-white">Storefront → Web Pages</strong></span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">2.</span>
                      <span>Edit the page where you want to add the parts finder</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">3.</span>
                      <span>Switch to the <strong className="text-white">HTML editor</strong></span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">4.</span>
                      <span>Paste the code where you want the widget to appear</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">5.</span>
                      <span>Save the page</span>
                    </li>
                  </ol>
                </div>

                <Separator className="bg-neutral-800" />

                <div>
                  <h3 className="font-semibold text-white mb-3">Option C: Add to Your Theme Template</h3>
                  <p className="text-neutral-400 text-sm mb-3">For full control, you can add the widget directly to your BigCommerce theme:</p>
                  <ol className="space-y-3 text-neutral-300 text-sm">
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">1.</span>
                      <span>Go to <strong className="text-white">Storefront → My Themes</strong></span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">2.</span>
                      <span>Click <strong className="text-white">Advanced → Edit Theme Files</strong></span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">3.</span>
                      <span>Find the template file where you want the widget (e.g., <code className="bg-neutral-800 px-1 rounded text-xs">templates/pages/custom/page/parts-finder.html</code>)</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">4.</span>
                      <span>Paste either embed code into the template</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-primary font-bold min-w-[24px]">5.</span>
                      <span>Save and publish your theme</span>
                    </li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          <Card className="bg-neutral-900 border-neutral-800 rounded-sm">
            <CardHeader>
              <CardTitle className="text-xl text-white">Live Preview</CardTitle>
              <CardDescription className="text-neutral-400">
                This is exactly what the widget will look like on your store
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border border-neutral-800 rounded-sm overflow-hidden">
                <iframe
                  src="/embed"
                  style={{ width: "100%", minHeight: "700px", border: "none" }}
                  title="Widget Preview"
                />
              </div>
              <div className="mt-4 flex gap-3">
                <a href="/embed" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" data-testid="link-embed-preview">
                  Open embed in new tab <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}