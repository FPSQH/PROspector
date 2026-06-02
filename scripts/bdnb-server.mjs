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
    const bdnbPath = url.pathname.replace("/bdnb/", "/") + url.search;
    console.log(`[BDNB] → https://${BDNB_BASE}${bdnbPath}`);

    const options = {
      hostname: BDNB_BASE,
      path: bdnbPath,
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "PROspector-Explorer/1.0",
        Prefer: "count=exact",
      },
    };

    const proxy = https.request(options, (upstream) => {
      console.log(`[BDNB] ← ${upstream.statusCode} (content-range: ${upstream.headers["content-range"] ?? "—"})`);

      // En cas d'erreur BDNB, loguer le body pour diagnostic
      if (upstream.statusCode >= 400) {
        let body = "";
        upstream.on("data", (d) => body += d);
        upstream.on("end", () => {
          console.error(`[BDNB] Erreur body: ${body}`);
          res.writeHead(upstream.statusCode, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(body);
        });
        return;
      }

      res.writeHead(upstream.statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Content-Range": upstream.headers["content-range"] ?? "",
      });
      upstream.pipe(res);
    });

    proxy.on("error", (e) => {
      console.error(`[BDNB] Erreur réseau: ${e.message}`);
      res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ error: e.message }));
    });

    proxy.end();
    return;
  }

  // ── Debug : teste plusieurs chemins BDNB ────────────────────────────────
  if (url.pathname === "/debug") {
    const candidates = [
      { host: "api.bdnb.io", path: "/bdnb/batiment_groupe?limit=1" },
      { host: "api.bdnb.io", path: "/open/batiment_groupe?limit=1" },
      { host: "api.bdnb.io", path: "/bdnb-open/batiment_groupe?limit=1" },
      { host: "api.bdnb.io", path: "/v1/batiment_groupe?limit=1" },
      { host: "api.bdnb.io", path: "/v2/batiment_groupe?limit=1" },
      { host: "api.bdnb.io", path: "/batiment_groupe?limit=1" },
      { host: "api.bdnb.io", path: "/donnees/batiment_groupe?limit=1" },
      { host: "api.bdnb.io", path: "/open-data/batiment_groupe?limit=1" },
      { host: "api.bdnb.io", path: "/api/batiment_groupe?limit=1" },
      { host: "api.bdnb.io", path: "/bdnb/" },
      { host: "api.bdnb.io", path: "/open/" },
    ];
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" });
    res.write("Test des chemins BDNB Open API\n" + "=".repeat(50) + "\n\n");

    let done = 0;
    const results = new Array(candidates.length).fill("");

    candidates.forEach(({ host, path: p }, i) => {
      const req2 = https.request(
        { hostname: host, path: p, method: "GET", headers: { Accept: "application/json" } },
        (up) => {
          let body = "";
          up.on("data", (d) => body += d);
          up.on("end", () => {
            results[i] = `[${up.statusCode}] https://${host}${p}\n    ${body.slice(0, 300)}\n`;
            if (++done === candidates.length) res.end(results.join("\n"));
          });
        }
      );
      req2.on("error", (e) => {
        results[i] = `[ERR] https://${host}${p} → ${e.message}\n`;
        if (++done === candidates.length) res.end(results.join("\n"));
      });
      req2.end();
    });
    return;
  }

  // ── Sert le fichier HTML ─────────────────────────────────────────────────
  if (url.pathname === "/" || url.pathname === "/index.html") {
    try {
      const html = fs.readFileSync(HTML_FILE, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(500);
      res.end(`Fichier introuvable : ${HTML_FILE}`);
    }
    return;
  }

  console.log(`[404] ${req.url}`);
  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`\n✅ BDNB Explorer démarré`);
  console.log(`   → Ouvre http://localhost:${PORT} dans ton navigateur`);
  console.log(`   Ctrl+C pour arrêter\n`);
});
