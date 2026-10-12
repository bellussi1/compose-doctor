import { createServer } from "node:http";
createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"status":"ok"}');
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(3000, "0.0.0.0");
