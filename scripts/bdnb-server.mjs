/**
 * Serveur local BDNB Explorer
 * Lance avec : node scripts/bdnb-server.mjs
 * Puis ouvre  : http://localhost:3456
 */

import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const PORT = 3456;
const BDNB_BASE = "api-open.bdnb.io";
const __dir = path.dirname(fileURLToPath(import.meta.url));
const HTML_FILE = path.join(__dir, "bdnb-explore.html");

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ── Proxy BDNB ──────────────────────────────────────────────────────────
  if (url.pathname.startsWith("/bdnb/")) {
    const bdnbPath = url.pathname.replace("/bdnb/", "/v2/") + url.search;
    const options = {
      hostname: BDNB_BASE,
      path: bdnbPath,
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "PROspector-Explorer/1.0" },
    };
    const proxy = https.request(options, (upstream) => {
      res.writeHead(upstream.statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Content-Range": upstream.headers["content-range"] ?? "",
      });
      upstream.pipe(res);
    });
    proxy.on("error", (e) => {
      res.writeHead(502);
      res.end(JSON.stringify({ error: e.message }));
    });
    proxy.end();
    return;
  }

  // ── Sert le fichier HTML ─────────────────────────────────────────────────
  if (url.pathname === "/" || url.pathname === "/index.html") {
    try {
      const html = fs.readFileSync(HTML_FILE, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end("bdnb-explore.html introuvable dans le même dossier.");
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n✅ BDNB Explorer démarré`);
  console.log(`   → Ouvre http://localhost:${PORT} dans ton navigateur\n`);
  console.log(`   Ctrl+C pour arrêter\n`);
});
