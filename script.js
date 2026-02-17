/* =========================================================
   CONFIG (DISAMBIGUATED)
   ========================================================= */

// Use the exact PubMed term style you shared (works on PubMed)
const PUBMED_AUTHOR_QUERY =
  `(birkneh tilahun tadesse[Author] OR birkneh tilahun[Author] or tadesse bt[Author])`;

// Optional “bad-fit” keywords to exclude (title/abstract)
// (Keep short; too many exclusions can remove valid items)
const EXCLUDE_TITLE_ABSTRACT = [
  `"food safety"[Title/Abstract]`,
  `"foodborne"[Title/Abstract]`
];

// Max pubs to pull from PubMed per refresh
const PUBMED_MAX = 250;

// Local fallback file in your repo
const LOCAL_PUBLICATIONS_JSON = "./publications.json";

// Toggle: auto fetch PubMed on load
const AUTO_FETCH_PUBMED_ON_LOAD = true;

/* =========================================================
   UTIL
   ========================================================= */
function esc(s){
  return String(s ?? "").replace(/[&<>"]/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"
  }[c]));
}

function setStatus(msg){
  const el = document.getElementById("pub-status");
  if(el) el.textContent = msg;
}

function scholarSearchLink(citationOrTitle){
  const q = encodeURIComponent(String(citationOrTitle || "").slice(0, 220));
  return `https://scholar.google.com/scholar?q=${q}`;
}
function pubmedSearchLink(citationOrTitle){
  const q = encodeURIComponent(String(citationOrTitle || "").slice(0, 220));
  return `https://pubmed.ncbi.nlm.nih.gov/?term=${q}`;
}
function crossrefSearchLink(citationOrTitle){
  const q = encodeURIComponent(String(citationOrTitle || "").slice(0, 220));
  return `https://search.crossref.org/?q=${q}`;
}

function bestPrimaryLink(p){
  if (p.url && String(p.url).trim()) return String(p.url).trim();
  if (p.doi && String(p.doi).trim()){
    const doi = String(p.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim();
    return `https://doi.org/${doi}`;
  }
  if (p.pmid && String(p.pmid).trim()){
    return `https://pubmed.ncbi.nlm.nih.gov/${String(p.pmid).trim()}/`;
  }
  return scholarSearchLink(p.title || p.citation || "");
}

function sortPublications(list, mode){
  const arr = [...list];
  if(mode === "year_asc"){
    arr.sort((a,b)=> (a.year||0) - (b.year||0) || (a.title||"").localeCompare(b.title||""));
    return arr;
  }
  if(mode === "title_asc"){
    arr.sort((a,b)=> (a.title||"").localeCompare(b.title||""));
    return arr;
  }
  arr.sort((a,b)=> (b.year||0) - (a.year||0) || (a.title||"").localeCompare(b.title||""));
  return arr;
}

function filterPublications(list, q){
  const query = String(q||"").trim().toLowerCase();
  if(!query) return list;
  return list.filter(p=>{
    const blob = [
      p.title, p.journal, p.citation, p.authors, p.year, p.doi, p.pmid
    ].join(" ").toLowerCase();
    return blob.includes(query);
  });
}

/* =========================================================
   RENDER
   ========================================================= */
let PUBS = [];

function renderPublications(){
  const listEl = document.getElementById("pub-list");
  if(!listEl) return;

  const search = document.getElementById("pub-search")?.value || "";
  const sortMode = document.getElementById("pub-sort")?.value || "year_desc";

  const filtered = filterPublications(PUBS, search);
  const sorted = sortPublications(filtered, sortMode);

  listEl.innerHTML = "";

  if(sorted.length === 0){
    listEl.innerHTML = `<div class="muted">No publications found.</div>`;
    setStatus("No publications found.");
    return;
  }

  for(const p of sorted){
    const year = p.year ? String(p.year) : "—";
    const title = p.title || p.citation || "Untitled";
    const journal = p.journal || p.source || "";
    const authors = p.authors || "";

    const wrapper = document.createElement("div");
    wrapper.className = "pub";

    const top = document.createElement("div");
    top.className = "pub-top";

    const left = document.createElement("div");
    left.style.flex = "1 1 auto";

    const h = document.createElement("div");
    h.className = "pub-title";
    h.innerHTML = esc(title);
    left.appendChild(h);

    const meta = document.createElement("div");
    meta.className = "pub-meta";
    meta.innerHTML = `${esc(authors)}${authors ? " • " : ""}${esc(journal)}${journal ? " • " : ""}${esc(year)}`;
    left.appendChild(meta);

    const open = document.createElement("a");
    open.className = "pub-open";
    open.href = bestPrimaryLink(p);
    open.target = "_blank";
    open.rel = "noreferrer";
    open.innerHTML = `<i class="fa-solid fa-up-right-from-square"></i> Open`;

    top.appendChild(left);
    top.appendChild(open);

    const links = document.createElement("div");
    links.className = "pub-links";

    if(p.doi){
      const a = document.createElement("a");
      a.className = "pub-link";
      a.href = `https://doi.org/${String(p.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim()}`;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.innerHTML = `<i class="fa-solid fa-link"></i> DOI`;
      links.appendChild(a);
    }

    if(p.pmid){
      const a = document.createElement("a");
      a.className = "pub-link";
      a.href = `https://pubmed.ncbi.nlm.nih.gov/${String(p.pmid).trim()}/`;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.innerHTML = `<i class="fa-solid fa-database"></i> PubMed`;
      links.appendChild(a);
    }

    if(p.url){
      const a = document.createElement("a");
      a.className = "pub-link";
      a.href = String(p.url).trim();
      a.target = "_blank";
      a.rel = "noreferrer";
      a.innerHTML = `<i class="fa-solid fa-arrow-up-right-from-square"></i> Publisher`;
      links.appendChild(a);
    }

    const aScholar = document.createElement("a");
    aScholar.className = "pub-link";
    aScholar.href = scholarSearchLink(title);
    aScholar.target = "_blank";
    aScholar.rel = "noreferrer";
    aScholar.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> Scholar`;
    links.appendChild(aScholar);

    const aPM = document.createElement("a");
    aPM.className = "pub-link";
    aPM.href = pubmedSearchLink(title);
    aPM.target = "_blank";
    aPM.rel = "noreferrer";
    aPM.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> PubMed search`;
    links.appendChild(aPM);

    const aCR = document.createElement("a");
    aCR.className = "pub-link";
    aCR.href = crossrefSearchLink(title);
    aCR.target = "_blank";
    aCR.rel = "noreferrer";
    aCR.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> Crossref`;
    links.appendChild(aCR);

    wrapper.appendChild(top);

    if(p.citation && p.citation.trim()){
      const c = document.createElement("div");
      c.className = "pub-meta";
      c.style.marginTop = "6px";
      c.innerHTML = esc(p.citation);
      wrapper.appendChild(c);
    }

    wrapper.appendChild(links);
    listEl.appendChild(wrapper);
  }

  setStatus(`Showing ${sorted.length} publication(s).`);
}

/* =========================================================
   LOADING: LOCAL FALLBACK
   ========================================================= */
async function loadLocalPublications(){
  try{
    const res = await fetch(LOCAL_PUBLICATIONS_JSON, { cache: "no-store" });
    if(!res.ok) throw new Error(`Local publications.json not found (${res.status})`);
    const data = await res.json();
    if(!Array.isArray(data)) throw new Error("publications.json must be an array");
    return data;
  }catch(e){
    console.warn("Local publications load failed:", e);
    return [];
  }
}

/* =========================================================
   LOADING: PUBMED (ONLINE)
   ========================================================= */
function buildPubMedQuery(){
  const exclPart = EXCLUDE_TITLE_ABSTRACT.length
    ? ` NOT (${EXCLUDE_TITLE_ABSTRACT.join(" OR ")})`
    : "";
  return `${PUBMED_AUTHOR_QUERY}${exclPart}`.trim();
}

async function fetchPubMed(){
  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const term = encodeURIComponent(buildPubMedQuery());

  const esearchURL = `${base}/esearch.fcgi?db=pubmed&retmode=json&retmax=${PUBMED_MAX}&sort=date&term=${term}`;
  const sRes = await fetch(esearchURL, { cache: "no-store" });
  if(!sRes.ok) throw new Error(`PubMed esearch failed: ${sRes.status}`);
  const sJson = await sRes.json();
  const ids = (sJson?.esearchresult?.idlist || []).slice(0, PUBMED_MAX);
  if(ids.length === 0) return [];

  const idStr = ids.join(",");
  const esummaryURL = `${base}/esummary.fcgi?db=pubmed&retmode=json&id=${idStr}`;
  const sumRes = await fetch(esummaryURL, { cache: "no-store" });
  if(!sumRes.ok) throw new Error(`PubMed esummary failed: ${sumRes.status}`);
  const sumJson = await sumRes.json();

  const result = sumJson?.result || {};
  const uids = result?.uids || [];

  const pubs = [];
  for(const pmid of uids){
    const it = result[pmid];
    if(!it) continue;

    const title = (it.title || "").replace(/\s+/g, " ").trim();
    const journal = (it.fulljournalname || it.source || "").trim();
    const pubdate = (it.pubdate || "").trim();
    const yearMatch = pubdate.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : null;

    const authors = Array.isArray(it.authors)
      ? it.authors.map(a=>a.name).filter(Boolean).join(", ")
      : "";

    let doi = null;
    if(Array.isArray(it.articleids)){
      const doiObj = it.articleids.find(x => x.idtype === "doi" && x.value);
      if(doiObj) doi = doiObj.value;
    }

    pubs.push({
      pmid: String(pmid),
      title,
      authors,
      journal,
      year,
      doi,
      url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      citation: ""
    });
  }

  return pubs;
}

/* =========================================================
   MERGE & DEDUPE
   ========================================================= */
function dedupePubs(pubs){
  const seen = new Set();
  const out = [];
  for(const p of pubs){
    const key = (p.doi ? `doi:${String(p.doi).toLowerCase()}` :
                p.pmid ? `pmid:${String(p.pmid)}` :
                `t:${String(p.title||p.citation||"").toLowerCase().slice(0,160)}`);
    if(seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function mergePreferLocal(online, local){
  const byKey = new Map();
  function keyOf(p){
    if(p.doi) return `doi:${String(p.doi).toLowerCase()}`;
    if(p.pmid) return `pmid:${String(p.pmid)}`;
    return `t:${String(p.title||p.citation||"").toLowerCase().slice(0,160)}`;
  }

  for(const p of online) byKey.set(keyOf(p), {...p});

  for(const lp of local){
    const k = keyOf(lp);
    if(byKey.has(k)){
      const merged = { ...byKey.get(k), ...lp };
      if(lp.citation) merged.citation = lp.citation;
      if(lp.url) merged.url = lp.url;
      byKey.set(k, merged);
    }else{
      byKey.set(k, {...lp});
    }
  }
  return Array.from(byKey.values());
}

async function loadPublications({preferPubMed=true}={}){
  setStatus("Loading publications…");
  const local = await loadLocalPublications();

  if(preferPubMed){
    try{
      setStatus("Fetching latest publications from PubMed…");
      const online = await fetchPubMed();
      const merged = mergePreferLocal(online, local);
      const final = dedupePubs(merged);
      setStatus(`Loaded ${final.length} publications (PubMed + local fallback).`);
      return final;
    }catch(e){
      console.warn("PubMed fetch failed:", e);
      const final = dedupePubs(local);
      setStatus(`PubMed fetch failed; loaded ${final.length} publications from local file.`);
      return final;
    }
  }

  const final = dedupePubs(local);
  setStatus(`Loaded ${final.length} publications from local file.`);
  return final;
}

/* =========================================================
   THEME + PHOTO PLACEHOLDER
   ========================================================= */
function initTheme(){
  const btn = document.getElementById("btn-theme");
  if(!btn) return;

  const saved = localStorage.getItem("theme");
  if(saved === "dark") document.body.classList.add("dark");

  btn.addEventListener("click", ()=>{
    document.body.classList.toggle("dark");
    localStorage.setItem("theme", document.body.classList.contains("dark") ? "dark" : "light");
  });
}

function initPhoto(){
  const img = document.getElementById("profile-photo");
  const fallback = document.querySelector(".photo-fallback");
  if(!img || !fallback) return;

  // Put your photo here (example)
  // img.src = "./assets/profile.jpg";

  if(img.src && img.src.trim() && !img.src.endsWith("/")){
    img.style.display = "block";
    fallback.style.display = "none";
  } else {
    img.style.display = "none";
    fallback.style.display = "flex";
  }
}

function openPublicationsIfHash(){
  const hash = (location.hash || "").replace("#", "").toLowerCase();
  if(hash === "publications" || hash === "pubs"){
    // Activate the Publications tab
    const pubsTab = document.querySelector('.tab[data-tab="pubs"]');
    if(pubsTab) pubsTab.click();

    // Scroll to the publications card
    requestAnimationFrame(() => {
      document.getElementById("publications")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

// --- Fix top navigation so it always opens the correct panel ---
function bindTopNavFix(){
  const navLinks = document.querySelectorAll(".navlink");
  const clickTab = (name) => document.querySelector(`.tab[data-tab="${name}"]`)?.click();

  navLinks.forEach(a => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href") || "";
      if(!href.startsWith("#")) return;

      const id = href.slice(1);

      if (id === "publications" || id === "pubs") {
        e.preventDefault();
        clickTab("pubs");
        history.replaceState(null, "", "#publications");
        requestAnimationFrame(() => {
          document.getElementById("publications")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        return;
      }

      if (["summary", "experience", "education", "grants", "top"].includes(id)) {
        e.preventDefault();
        clickTab("cv");
        history.replaceState(null, "", `#${id}`);
        requestAnimationFrame(() => {
          const el = document.getElementById(id);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          else window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }
    });
  });
}

/* =========================================================
   BOOT
   ========================================================= */
window.addEventListener("DOMContentLoaded", async ()=>{
  document.getElementById("year-now").textContent = new Date().getFullYear();
  document.getElementById("last-updated").textContent = new Date().toLocaleDateString();

  initTheme();
  initPhoto();

  // Fix top navigation + direct hash loads
  bindTopNavFix();

  // initial load
  PUBS = await loadPublications({ preferPubMed: AUTO_FETCH_PUBMED_ON_LOAD });
  renderPublications();

  // open pubs panel if URL has #publications
  openPublicationsIfHash();

  document.getElementById("pub-search")?.addEventListener("input", renderPublications);
  document.getElementById("pub-sort")?.addEventListener("change", renderPublications);

  // refresh button: fetch from PubMed again
  document.getElementById("btn-refresh")?.addEventListener("click", async ()=>{
    setStatus("Refreshing from PubMed…");
    PUBS = await loadPublications({ preferPubMed: true });
    document.getElementById("last-updated").textContent = new Date().toLocaleString();
    renderPublications();
  });
});
