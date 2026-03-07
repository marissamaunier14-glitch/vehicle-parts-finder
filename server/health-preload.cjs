var http = require("http");
var port = parseInt(process.env.PORT || "5000", 10);

var server = http.createServer(function(req, res) {
  res.writeHead(200, {"Content-Type": "text/html"});
  res.end("<html><body>Loading...</body></html>");
});

server.listen(port, "0.0.0.0", function() {
  console.log("healthcheck server ready on port " + port);
});

global.__healthServer = server;
