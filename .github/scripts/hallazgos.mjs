// Genera assets/hallazgos.svg, la lamina de la seccion V del README.
// Sin dependencias, solo fetch nativo.
//
// Las cifras salen de la API de GitHub y la lamina queda commiteada en el
// repo, asi que el README no depende de ningun servicio externo para pintarla.

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ORO = "#D4AF37";
const ORO_CLARO = "#F3D77A";
const ARENA = "#F5E6C8";
const CARBON = "#0d1117";
const SERIF = "Georgia, 'Times New Roman', 'Liberation Serif', serif";

function escapar(valor) {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function numero(valor) {
  return new Intl.NumberFormat("es-ES").format(valor);
}

// --- Consulta --------------------------------------------------------------

async function graphql(token, query, variables) {
  const respuesta = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `bearer ${token}`,
      "content-type": "application/json",
      "user-agent": "lamina-hallazgos",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!respuesta.ok) {
    throw new Error(`GraphQL respondio ${respuesta.status}: ${await respuesta.text()}`);
  }
  const cuerpo = await respuesta.json();
  if (cuerpo.errors) {
    throw new Error(`GraphQL devolvio errores: ${JSON.stringify(cuerpo.errors)}`);
  }
  return cuerpo.data;
}

const CONSULTA = `
query($login: String!) {
  user(login: $login) {
    createdAt
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
      totalCount
      nodes { stargazerCount primaryLanguage { name } }
    }
  }
}`;

export async function recoger(login, token) {
  const { user } = await graphql(token, CONSULTA, { login });
  if (!user) throw new Error(`La API no devolvio datos para el usuario ${login}`);

  const lenguajes = {};
  let estrellas = 0;
  for (const repo of user.repositories.nodes) {
    estrellas += repo.stargazerCount;
    const nombre = repo.primaryLanguage?.name;
    if (nombre) lenguajes[nombre] = (lenguajes[nombre] || 0) + 1;
  }
  const principal = Object.entries(lenguajes).sort((a, b) => b[1] - a[1])[0];

  return {
    alta: new Date(user.createdAt),
    commits: user.contributionsCollection.totalCommitContributions,
    pullRequests: user.contributionsCollection.totalPullRequestContributions,
    repositorios: user.repositories.totalCount,
    estrellas,
    lenguaje: principal ? principal[0] : "—",
  };
}

// --- Piezas de dibujo ------------------------------------------------------

function cifra(x, y, valor, tamano) {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${SERIF}" ` +
    `font-size="${tamano}" fill="${ORO_CLARO}">${escapar(valor)}</text>`;
}

function rotulo(x, y, texto) {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${SERIF}" ` +
    `font-size="14" letter-spacing="4" fill="${ARENA}" opacity="0.65">${escapar(texto)}</text>`;
}

function apunte(x, y, texto) {
  return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${SERIF}" ` +
    `font-size="11.5" letter-spacing="1.5" fill="${ARENA}" opacity="0.42">${escapar(texto)}</text>`;
}

function hairline(x, y1, y2) {
  return `<path d="M${x} ${y1} L${x} ${y2}" stroke="${ORO}" stroke-width="0.8" opacity="0.22"/>`;
}

// --- Lamina ----------------------------------------------------------------

export function laminaHallazgos(datos) {
  const anos = (Date.now() - datos.alta.getTime()) / (365.25 * 24 * 3600 * 1000);
  const antiguedad = anos < 1
    ? `${Math.max(1, Math.round(anos * 12))} meses`
    : `${anos.toFixed(1).replace(".", ",")} años`;

  const piezas = [
    { valor: numero(datos.repositorios), rotulo: "REPOSITORIOS", apunte: "propios, públicos" },
    { valor: numero(datos.commits), rotulo: "COMMITS", apunte: "últimos doce meses" },
    { valor: numero(datos.pullRequests), rotulo: "PULL REQUESTS", apunte: "últimos doce meses" },
    { valor: numero(datos.estrellas), rotulo: "ESTRELLAS", apunte: "recibidas" },
    { valor: datos.lenguaje, rotulo: "LENGUAJE", apunte: "el más repetido", tamano: 30 },
    { valor: String(datos.alta.getUTCFullYear()), rotulo: "EN GITHUB", apunte: antiguedad },
  ];

  const cuerpo = piezas.map((pieza, i) => {
    const x = 150 + i * 180;
    return cifra(x, 108, pieza.valor, pieza.tamano ?? 42) +
      "\n  " + rotulo(x, 145, pieza.rotulo) +
      "\n  " + apunte(x, 167, pieza.apunte);
  }).join("\n  ");

  const separadores = [240, 420, 600, 780, 960]
    .map((x) => hairline(x, 62, 180)).join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 230" width="1200" height="230" role="img" aria-label="Hallazgos: ${escapar(datos.repositorios)} repositorios propios, ${escapar(datos.commits)} commits y ${escapar(datos.pullRequests)} pull requests en los últimos doce meses, ${escapar(datos.estrellas)} estrellas, lenguaje más repetido ${escapar(datos.lenguaje)}, en GitHub desde ${escapar(datos.alta.getUTCFullYear())}">

  <rect width="1200" height="230" fill="${CARBON}"/>

  <g stroke="${ORO}" stroke-linecap="round">
    <path d="M60 30 L1140 30" stroke-width="1.1" opacity="0.5"/>
    <path d="M60 35 L1140 35" stroke-width="0.6" opacity="0.25"/>
  </g>

  ${cuerpo}

  ${separadores}

  <g stroke="${ORO}" stroke-linecap="round">
    <path d="M60 200 L1140 200" stroke-width="0.8" opacity="0.35"/>
  </g>

</svg>
`;
}

// --- Entrada ---------------------------------------------------------------

async function principal() {
  const login = process.env.PERFIL_LOGIN;
  const token = process.env.GITHUB_TOKEN;
  if (!login) throw new Error("Falta la variable de entorno PERFIL_LOGIN");
  if (!token) throw new Error("Falta la variable de entorno GITHUB_TOKEN");

  const datos = await recoger(login, token);
  mkdirSync("assets", { recursive: true });
  writeFileSync("assets/hallazgos.svg", laminaHallazgos(datos), "utf8");

  console.log(`Repositorios: ${datos.repositorios} / estrellas: ${datos.estrellas}`);
  console.log(`Commits: ${datos.commits} / PR: ${datos.pullRequests} / ${datos.lenguaje}`);
  console.log("Lamina escrita en assets/hallazgos.svg");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  principal().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
