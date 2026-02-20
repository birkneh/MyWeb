/* =========================================================
   CONFIG (DISAMBIGUATED)
   ========================================================= */

const PUBMED_AUTHOR_QUERY =
  `(birkneh tilahun tadesse[Author] OR birkneh tilahun[Author] or tadesse bt[Author])`;

const EXCLUDE_TITLE_ABSTRACT = [
  `"food safety"[Title/Abstract]`,
  `"foodborne"[Title/Abstract]`
];

const PUBMED_MAX = 250;
const LOCAL_PUBLICATIONS_JSON = "./publications.json";
const AUTO_FETCH_PUBMED_ON_LOAD = true;

// NCBI eUtils best-practice parameters (helps reliability/compliance)
const NCBI_TOOL = "birkneh-cv-site";
const NCBI_EMAIL = "birknehtilahun@gmail.com";

/* =========================================================
   PUBLICATION REVIEW (ACCEPT/REJECT)
   ========================================================= */

const PUB_REVIEW_STORAGE_KEY = "pub_review_v1";
let PUB_REVIEW = {}; // { key: "accepted" | "rejected" }

function loadPubReview(){
  try{
    PUB_REVIEW = JSON.parse(localStorage.getItem(PUB_REVIEW_STORAGE_KEY) || "{}") || {};
  }catch(e){
    PUB_REVIEW = {};
  }
}
function savePubReview(){
  localStorage.setItem(PUB_REVIEW_STORAGE_KEY, JSON.stringify(PUB_REVIEW));
}
function pubKey(p){
  if(p.doi){
    return `doi:${String(p.doi)
      .toLowerCase()
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i,"")
      .trim()}`;
  }
  if(p.pmid) return `pmid:${String(p.pmid).trim()}`;
  return `t:${String(p.title||p.citation||"")
    .toLowerCase()
    .replace(/\s+/g," ")
    .slice(0,160)}`;
}
function getReviewState(p){
  return PUB_REVIEW[pubKey(p)] || "unreviewed";
}
function setReviewState(p, state){
  const k = pubKey(p);
  if(state === "unreviewed") delete PUB_REVIEW[k];
  else PUB_REVIEW[k] = state;
  savePubReview();
}

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
  const reviewMode = document.getElementById("pub-filter")?.value || "all";

  const filtered = filterPublications(PUBS, search);
  const sortedAll = sortPublications(filtered, sortMode);

  // "all" hides rejected (your intended default)
  const sorted = sortedAll.filter(p=>{
    const st = getReviewState(p);
    if(reviewMode === "accepted") return st === "accepted";
    if(reviewMode === "rejected") return st === "rejected";
    if(reviewMode === "unreviewed") return st === "unreviewed";
    return st !== "rejected";
  });

  listEl.innerHTML = "";

  if(sorted.length === 0){
    listEl.innerHTML = `<div class="muted">No publications found.</div>`;
    setStatus("No publications found.");
    return;
  }

  let nAccepted = 0, nRejected = 0, nUnreviewed = 0;
  for(const p of sortedAll){
    const st = getReviewState(p);
    if(st === "accepted") nAccepted++;
    else if(st === "rejected") nRejected++;
    else nUnreviewed++;
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

    // Review buttons
    const reviewBar = document.createElement("div");
    reviewBar.className = "pub-links";

    const state = getReviewState(p);

    const btnAccept = document.createElement("button");
    btnAccept.type = "button";
    btnAccept.className = "pub-link" + (state === "accepted" ? " accepted" : "");
    btnAccept.innerHTML = `<i class="fa-solid fa-check"></i> Accept`;
    btnAccept.addEventListener("click", ()=>{
      setReviewState(p, "accepted");
      renderPublications();
    });

    const btnReject = document.createElement("button");
    btnReject.type = "button";
    btnReject.className = "pub-link" + (state === "rejected" ? " rejected" : "");
    btnReject.innerHTML = `<i class="fa-solid fa-xmark"></i> Reject`;
    btnReject.addEventListener("click", ()=>{
      setReviewState(p, "rejected");
      renderPublications();
    });

    const btnUndo = document.createElement("button");
    btnUndo.type = "button";
    btnUndo.className = "pub-link";
    btnUndo.innerHTML = `<i class="fa-solid fa-rotate-left"></i> Undo`;
    btnUndo.addEventListener("click", ()=>{
      setReviewState(p, "unreviewed");
      renderPublications();
    });

    reviewBar.appendChild(btnAccept);
    reviewBar.appendChild(btnReject);
    reviewBar.appendChild(btnUndo);

    wrapper.appendChild(top);

    if(p.citation && String(p.citation).trim()){
      const c = document.createElement("div");
      c.className = "pub-meta";
      c.style.marginTop = "6px";
      c.innerHTML = esc(p.citation);
      wrapper.appendChild(c);
    }

    wrapper.appendChild(links);
    wrapper.appendChild(reviewBar);
    listEl.appendChild(wrapper);
  }

  setStatus(`Showing ${sorted.length}. Review: ${nAccepted} accepted • ${nUnreviewed} unreviewed • ${nRejected} rejected.`);
}

/* =========================================================
   LOADING
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

function buildPubMedQuery(){
  const exclPart = EXCLUDE_TITLE_ABSTRACT.length
    ? ` NOT (${EXCLUDE_TITLE_ABSTRACT.join(" OR ")})`
    : "";
  return `${PUBMED_AUTHOR_QUERY}${exclPart}`.trim();
}

async function fetchPubMed(){
  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const term = encodeURIComponent(buildPubMedQuery());
  const common = `&tool=${encodeURIComponent(NCBI_TOOL)}&email=${encodeURIComponent(NCBI_EMAIL)}`;

  const esearchURL =
    `${base}/esearch.fcgi?db=pubmed&retmode=json&retmax=${PUBMED_MAX}&sort=date&term=${term}${common}`;

  const sRes = await fetch(esearchURL, { cache: "no-store" });
  if(!sRes.ok) throw new Error(`PubMed esearch failed: ${sRes.status}`);
  const sJson = await sRes.json();
  const ids = (sJson?.esearchresult?.idlist || []).slice(0, PUBMED_MAX);
  if(ids.length === 0) return [];

  const idStr = ids.join(",");
  const esummaryURL =
    `${base}/esummary.fcgi?db=pubmed&retmode=json&id=${idStr}${common}`;

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

function dedupePubs(pubs){
  const seen = new Set();
  const out = [];
  for(const p of pubs){
    const key =
      p.doi ? `doi:${String(p.doi).toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//i,"").trim()}` :
      p.pmid ? `pmid:${String(p.pmid).trim()}` :
      `t:${String(p.title||p.citation||"").toLowerCase().slice(0,160)}`;

    if(seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function mergePreferLocal(online, local){
  const byKey = new Map();

  function keyOf(p){
    if(p.doi) return `doi:${String(p.doi).toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//i,"").trim()}`;
    if(p.pmid) return `pmid:${String(p.pmid).trim()}`;
    return `t:${String(p.title||p.citation||"").toLowerCase().slice(0,160)}`;
  }

  for(const p of online) byKey.set(keyOf(p), { ...p });

  for(const lp of local){
    const k = keyOf(lp);
    if(byKey.has(k)){
      const merged = { ...byKey.get(k), ...lp };
      if(lp.citation) merged.citation = lp.citation;
      if(lp.url) merged.url = lp.url;
      byKey.set(k, merged);
    }else{
      byKey.set(k, { ...lp });
    }
  }

  return Array.from(byKey.values());
}

async function loadPublications({preferPubMed=true} = {}){
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
   THEME + PHOTO
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

  img.addEventListener("error", ()=>{
    img.style.display = "none";
    fallback.style.display = "flex";
  });

  if(img.src && img.src.trim()){
    img.style.display = "block";
    fallback.style.display = "none";
  } else {
    img.style.display = "none";
    fallback.style.display = "flex";
  }
}

/* =========================================================
   FEATURED LINKEDIN INTERACTION
   ========================================================= */

function initFeaturedLinkedIn(){
  const toggle = document.getElementById("btn-li-toggle");
  const body = document.getElementById("li-body");
  const copyBtn = document.getElementById("btn-li-copy");
  const status = document.getElementById("li-status");
  const card = document.getElementById("li-card");
  const jumpBtn = document.getElementById("btn-scroll-featured");

  if(toggle && body){
    toggle.addEventListener("click", ()=>{
      const isHidden = body.hasAttribute("hidden");
      if(isHidden){
        body.removeAttribute("hidden");
        toggle.innerHTML = `<i class="fa-solid fa-chevron-up"></i> Collapse`;
      }else{
        body.setAttribute("hidden", "");
        toggle.innerHTML = `<i class="fa-solid fa-chevron-down"></i> Expand`;
      }
    });
  }

  // Make the whole card clickable (but don't hijack button/link clicks inside it)
  if(card){
    card.style.cursor = "pointer";
    card.addEventListener("click", (e)=>{
      const t = e.target;
      const isInteractive =
        t?.closest?.("a") || t?.closest?.("button") || t?.closest?.("input") || t?.closest?.("select");
      if(isInteractive) return;

      const url = card.getAttribute("data-url") || "";
      if(url) window.open(url, "_blank", "noreferrer");
    });
  }

  if(copyBtn && card){
    copyBtn.addEventListener("click", async ()=>{
      const url = card.getAttribute("data-url") || "";
      try{
        await navigator.clipboard.writeText(url);
        if(status) status.textContent = "Copied.";
        setTimeout(()=>{ if(status) status.textContent = ""; }, 1200);
      }catch(e){
        if(status) status.textContent = "Copy failed (browser blocked).";
        setTimeout(()=>{ if(status) status.textContent = ""; }, 1800);
      }
    });
  }

  // Your "Jump to Featured" button lives in Blogs; make it actually jump to Featured
  if(jumpBtn){
    jumpBtn.addEventListener("click", ()=>{
      const target = document.getElementById("li-card") || document.querySelector(".featured");
      if(target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

/* =========================================================
   BOOT
   ========================================================= */

window.addEventListener("DOMContentLoaded", async ()=>{
  document.getElementById("year-now")?.textContent = new Date().getFullYear();
  document.getElementById("last-updated")?.textContent = new Date().toLocaleDateString();

  initTheme();
  initPhoto();
  initFeaturedLinkedIn();

  loadPubReview();

  PUBS = await loadPublications({ preferPubMed: AUTO_FETCH_PUBMED_ON_LOAD });
  renderPublications();

  document.getElementById("pub-search")?.addEventListener("input", renderPublications);
  document.getElementById("pub-sort")?.addEventListener("change", renderPublications);
  document.getElementById("pub-filter")?.addEventListener("change", renderPublications);

  document.getElementById("btn-refresh")?.addEventListener("click", async ()=>{
    setStatus("Refreshing from PubMed…");
    PUBS = await loadPublications({ preferPubMed: true });
    document.getElementById("last-updated")?.textContent = new Date().toLocaleString();
    renderPublications();
  });

  document.getElementById("btn-clear-review")?.addEventListener("click", ()=>{
    const ok = confirm("Clear all Accept/Reject decisions?");
    if(!ok) return;
    PUB_REVIEW = {};
    savePubReview();
    renderPublications();
  });
});
