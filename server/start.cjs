const http = require("http");

const port = parseInt(process.env.PORT || "5000", 10);
let appHandler = null;

const server = http.createServer((req, res) => {
  if (appHandler) {
    return appHandler(req, res);
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end("<!DOCTYPE html><html><body style='background:#000;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center'><p>Loading Part Finder...</p><p style='color:#666;font-size:14px'>Please wait a moment</p></div></body></html>");
});

server.listen(port, "0.0.0.0", () => {
  const t = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  console.log(t + " [express] serving on port " + port);

  setImmediate(() => {
    const { initApp } = require("./index.cjs");
    initApp(server).then((app) => {
      appHandler = app;
    }).catch((err) => {
      console.error("Failed to initialize:", err);
      process.exit(1);
    });
  });
});
