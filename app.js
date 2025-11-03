// ====== State ======
const state = {
  mode: "normal", // 通常 / 参加者
  gachaMode: "count", // 回数 or 価格
  items: [],
  totals: {},
  history: [],
  participants: [],
  selectedParticipantId: null,
  overallParticipantTotals: {},
  lastSession: null,
  profileKey: "emushi_gacha_profiles_v1",
  soundKey: "emushi_gacha_sound_on",
  tabKey: "emushi_gacha_active_tab_v1",
  modeKey: "emushi_gacha_active_mode_v1",
  gachaKey: "emushi_gacha_active_gacha_v1",
  soundOn: true,
  // 価格モード
  pricePerPull: 300,
  bonusRules: [{threshold:3000, bonus:1}],
  carryRemainder: true,
  accumulateInsufficient: true,
  priceScope: "cumulative", // cumulative | session
  pointsTotal: 0, // 全体累計ポイント
  // 端数管理
  remainder: 0,
};

const $ = q=>document.querySelector(q);
const listEl=$("#list"), sumEl=$("#sum-prob"), warnEl=$("#warn-over");
const kpiTotal=$("#kpi-total"), kpiMiss=$("#kpi-miss"), kpiCount=$("#kpi-count");

// ===== ユーティリティ =====
function showToast(msg="コピーしました"){ const t=$("#toast"); t.textContent = msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),1400); }
function uuid(){ return Math.random().toString(36).slice(2,10); }
function fmtPct(v){ return (Math.round(v*10000)/10000) + "%"; }
function clampInt(v,min=0){ return Math.max(min, Math.floor(v||0)); }
function nowStr(){ return new Date().toLocaleString(); }
function escapeHtml(s){return (s??"").replace(/[&<>"']/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}

// ===== オープニング =====
window.addEventListener("load", ()=>{ const intro=$("#intro-screen"); const bg = document.querySelector(".bg-img"); const hide=()=>{ if(!intro.classList.contains("hide")){ intro.classList.add("hide"); if(bg){ setTimeout(()=> bg.classList.add("bg-show"), 120); } setTimeout(()=>{ intro.style.display="none"; }, 420); } }; setTimeout(hide, 2800); intro.addEventListener("click", hide, {once:true}); });

// ===== サウンド =====
const soundToggle = $("#soundToggle"); const soundLabel = $("#soundLabel");
initSound();
soundToggle?.addEventListener("click", ()=>{ state.soundOn=!state.soundOn; localStorage.setItem(state.soundKey, state.soundOn?"1":"0"); applySoundUI(); });
function initSound(){ const saved = localStorage.getItem(state.soundKey); state.soundOn = saved===null ? true : saved==="1"; applySoundUI(); }
function applySoundUI(){ if(!soundToggle) return; soundToggle.dataset.on = state.soundOn ? "true":"false"; soundLabel.textContent = state.soundOn ? "ON" : "OFF"; }
function playSE(id){ if(!state.soundOn) return; const a = document.getElementById(id); if(a){ try{ a.currentTime=0; a.play().catch(()=>{}); }catch{} } }

// ===== タブ =====
function setActiveTab(key){ document.querySelectorAll(".tab-btn").forEach(b=>b.classList.toggle("active", b.dataset.tab===key)); ["settings","draw","storage"].forEach(t=>{ const el = $("#tab-"+t); const show = (t===key); el.style.display = show ? "" : "none"; requestAnimationFrame(()=>{ el.classList.toggle("active", show); }); }); localStorage.setItem(state.tabKey, key); }
document.querySelectorAll(".tab-btn").forEach(btn=>{ btn.addEventListener("click", ()=> setActiveTab(btn.dataset.tab)); });

// ===== モード/ガチャ切替（全カードflip） =====
function applyMode(){ document.body.classList.toggle("mode-participants", state.mode==="participants"); document.querySelectorAll("#modeSwitch button").forEach(bb=>bb.classList.toggle("active", bb.dataset.mode===state.mode)); document.querySelectorAll("#gachaSwitch button").forEach(bb=>bb.classList.toggle("active", bb.dataset.gacha===state.gachaMode)); const cards = document.querySelectorAll(".card"); cards.forEach(card=>{ card.classList.add("mode-flip"); setTimeout(()=>card.classList.remove("mode-flip"), 560); });
  // 表示切替
  $("#p-topbar").style.display = state.mode==="participants"?"flex":"none";
  $("#participant-tabs-wrap").style.display = state.mode==="participants"?"block":"none";
  $("#p-stats-bar").style.display = state.mode==="participants"?"flex":"none";

  $("#count-normal").style.display = state.gachaMode==="count" && state.mode==="normal"?"block":"none";
  $("#count-participants").style.display = state.gachaMode==="count" && state.mode==="participants"?"block":"none";
  $("#price-normal").style.display = state.gachaMode==="price" && state.mode==="normal"?"block":"none";
  $("#price-participants").style.display = state.gachaMode==="price" && state.mode==="participants"?"block":"none";
  updatePointsKPI();
}

$("#modeSwitch")?.addEventListener("click", (e)=>{ const b=e.target.closest('button'); if(!b) return; if(state.mode===b.dataset.mode) return; state.mode=b.dataset.mode; localStorage.setItem(state.modeKey, state.mode); applyMode(); if(state.mode==="participants"){ renderParticipantTabs(); renderParticipantView(); renderParticipantOverall(); } });
$("#gachaSwitch")?.addEventListener("click", (e)=>{ const b=e.target.closest('button'); if(!b) return; if(state.gachaMode===b.dataset.gacha) return; state.gachaMode=b.dataset.gacha; localStorage.setItem(state.gachaKey, state.gachaMode); applyMode(); });

// ===== 商品追加/一覧 =====
$("#btn-add")?.addEventListener("click", async ()=>{ const r=$("#in-rarity").value.trim(); const n=$("#in-name").value.trim(); const p=+$("#in-prob").value; if(!n){ showToast("商品名を入力してください"); return; } if(!(p>=0)){ showToast("確率(%) を入力してください"); return; } const newItem={id:uuid(), rarity:r||"", name:n, prob:+p}; state.items.push(newItem); renderList(); const row = listEl.querySelector(`.tr[data-id="${newItem.id}"]`); if(row) row.classList.add("added"); });
$("#btn-clear")?.addEventListener("click", async ()=>{ state.items=[]; renderList(); showToast("一覧をクリアしました"); });

let dndBound = false;
function renderList(){ listEl.innerHTML = ""; const sum = state.items.reduce((a,b)=>a+(+b.prob||0),0); const over = sum>100.0000001; sumEl.textContent = `（合計: ${fmtPct(sum)}）`; warnEl.textContent = over ? "合計確率が100%を超えています。調整してください。" : ""; warnEl.className = over ? "小 small warn" : "small"; kpiTotal.textContent = fmtPct(sum); kpiMiss.textContent = fmtPct(Math.max(0,100-sum)); kpiCount.textContent = state.items.length;
  state.items.forEach((it)=>{ const row=document.createElement("div"); row.className="tr"; row.draggable=true; row.dataset.id=it.id; const hwrap=document.createElement("div"); hwrap.className="handle-wrap"; const handle=document.createElement("div"); handle.className="handle"; handle.textContent="≡"; const mrow=document.createElement("div"); mrow.className="move-row"; const upBtn=document.createElement("button"); upBtn.className="btn-move-small"; upBtn.textContent="↑"; const downBtn=document.createElement("button"); downBtn.className="btn-move-small"; downBtn.textContent="↓"; upBtn.onclick=()=>moveItem(it.id,-1); downBtn.onclick=()=>moveItem(it.id,1); mrow.appendChild(upBtn); mrow.appendChild(downBtn); hwrap.appendChild(handle); hwrap.appendChild(mrow); row.appendChild(hwrap);
    const rarity=document.createElement("div"); rarity.innerHTML=`<span class="rarity">${it.rarity||"-"}</span><div class="name-small">${escapeHtml(it.name)}</div>`; row.appendChild(rarity);
    const probView=document.createElement("div"); probView.innerHTML=`<span>${fmtPct(+it.prob||0)}</span>`; row.appendChild(probView);
    const editWrap=document.createElement("div"); editWrap.innerHTML=`<label class="small" style="display:block;margin-bottom:3px;">確率%を変更</label><input type="number" step="0.0001" value="${it.prob}" style="width:100%; box-sizing:border-box" />`; editWrap.querySelector("input").addEventListener("change",(e)=>{ it.prob=+e.target.value; renderList();}); row.appendChild(editWrap);
    const del=document.createElement("div"); del.style.textAlign="right"; const btn=document.createElement("button"); btn.className="btn btn-danger"; btn.textContent="削除"; btn.addEventListener("click", ()=>{ state.items=state.items.filter(x=>x.id!==it.id); renderList(); }); del.appendChild(btn); row.appendChild(del); listEl.appendChild(row); }); enableReorder(); }
function moveItem(id,dir){ const idx=state.items.findIndex(x=>x.id===id); if(idx<0)return; const ni=idx+dir; if(ni<0||ni>=state.items.length)return; const [a]=state.items.splice(idx,1); state.items.splice(ni,0,a); renderList(); Array.from(listEl.children).forEach(el=>el.classList.add("reorder-anim")); setTimeout(()=>Array.from(listEl.children).forEach(el=>el.classList.remove("reorder-anim")),260); }
function enableReorder(){ let dragging=null; listEl.querySelectorAll(".tr").forEach(row=>{ row.addEventListener("dragstart",()=>{ dragging=row; row.style.opacity=".6"; }); row.addEventListener("dragend",()=>{ row.style.opacity="1"; }); row.addEventListener("dragover",(e)=>{ e.preventDefault(); if(!dragging || dragging===row) return; const rect=row.getBoundingClientRect(); const before=(e.clientY-rect.top)<rect.height/2; listEl.insertBefore(dragging, before?row:row.nextSibling); }); }); if(!dndBound){ listEl.addEventListener("drop", ()=>{ const orderIds = Array.from(listEl.querySelectorAll(".tr")).map(el=>el.dataset.id); state.items.sort((a,b)=> orderIds.indexOf(a.id) - orderIds.indexOf(b.id)); renderList(); Array.from(listEl.children).forEach(el=>el.classList.add("reorder-anim")); setTimeout(()=>Array.from(listEl.children).forEach(el=>el.classList.remove("reorder-anim")),260); }); dndBound = true; } }

// ===== JSON I/O =====
$("#btn-export")?.addEventListener("click", ()=>{ const data = state.items.map(({rarity,name,prob})=>({rarity,name,prob})); $("#json-area").value = JSON.stringify(data, null, 2); showToast("設定を書き出しました"); });
$("#btn-import")?.addEventListener("click", ()=>{ try{ const arr = JSON.parse($("#json-area").value||"[]"); if(!Array.isArray(arr)) throw 0; state.items = arr.map(o=>({id:uuid(), rarity:o.rarity||"", name:o.name||"", prob:+o.prob||0})); renderList(); showToast("設定を読み込みました"); }catch{ showToast("JSONの形式が不正です"); } });
$("#btn-json-copy")?.addEventListener("click", ()=>{ navigator.clipboard.writeText($("#json-area").value||""); showToast("コピーしました"); });
$("#btn-json-paste")?.addEventListener("click", async ()=>{ try{ const txt = await navigator.clipboard.readText(); $("#json-area").value = txt; showToast("ペーストしました"); }catch{ showToast("クリップボードから読み込めませんでした"); } });

// ===== 抽選ロジック（共通） =====
function calcPools(){ const items=state.items.map(x=>({...x})); const sum=items.reduce((a,b)=>a+(+b.prob||0),0); if(sum>100.0000001){ showToast("合計確率が100%を超えています"); return null; } const miss=Math.max(0,100-sum); const pools=items.map(x=>({id:x.id,name:x.name,rarity:x.rarity,prob:+x.prob})); if(miss>0) pools.push({id:"miss",name:"ハズレ",rarity:"-",prob:miss}); let acc=0; pools.forEach(p=>{acc+=p.prob;p._end=acc}); return {pools,total:acc}; }
function highlightResult(el){ if(!el) return; el.classList.remove("pulse-glow"); void el.offsetWidth; el.classList.add("pulse-glow"); }

function applyBonus(pulls, basePoints){ let bonus=0; for(const r of state.bonusRules){ if(basePoints>=r.threshold) bonus += r.bonus; } return pulls + bonus; }

function drawByPulls(n){ const info=calcPools(); if(!info) return; playSE("sfx-draw"); const {pools,total}=info; const counts={}; state.items.forEach(it=>counts[it.id]=0); if(pools.find(p=>p.id==="miss")) counts.miss=0; const chunkSize=100000; const doChunk=(left)=>{ const m=Math.min(left,chunkSize); for(let i=0;i<m;i++){ const r=Math.random()*total; const hit=pools.find(p=>r<p._end); counts[hit.id]=(counts[hit.id]||0)+1; } const remain=left-m; if(remain>0){ setTimeout(()=>doChunk(remain),0); } else { if(state.mode==="normal"){ for(const k in counts){ state.totals[k]=(state.totals[k]||0)+counts[k]; } renderResult(counts,$("#result")); renderResult(state.totals,$("#total")); appendLog(n,counts); state.history.push({n,counts}); state.lastSession = {n,counts}; highlightResult($("#result")); } else { const p = getSelectedParticipant(); if(!p){ showToast("参加者を選択してください"); return; } for(const k in counts){ p.totals[k]=(p.totals[k]||0)+counts[k]; } for(const k in counts){ state.overallParticipantTotals[k]=(state.overallParticipantTotals[k]||0)+counts[k]; } renderResult(counts,$("#result")); renderResult(p.totals,$("#total")); appendParticipantLog(p,n,counts); p.history.push({n,counts}); p.lastResult = {n,counts}; renderParticipantOverall(); highlightResult($("#result")); } } }; doChunk(n); }

function renderResult(map, el){ const rows=[]; state.items.forEach(it=>{ const c=map[it.id]||0; if(c>0) rows.push(`<span class="pill">${it.rarity||"-"}｜${escapeHtml(it.name)} × <b>${c}</b></span>`); }); if(map.miss>0) rows.push(`<span class="pill">ハズレ × <b>${map.miss}</b></span>`); el.innerHTML = rows.length? rows.join(" "):`<span class="小 small">（結果なし）</span>`; }
function appendLog(n,session){ const parts=[]; state.items.forEach(it=>{ const c=session[it.id]||0; if(c>0) parts.push(`${it.name}×${c}`); }); if(session.miss>0) parts.push(`ハズレ×${session.miss}`); $("#log").insertAdjacentHTML("afterbegin", `<div class="small">[${nowStr()}] ${n}回：${parts.join(" / ")||"（なし）"}</div>`); }

// ===== 回数モード UI =====
const TIMES_PLUS=[1,10,100,1000];
const TIMES_MINUS=[-1,-10,-100,-1000];
function buildStepRow(list, containerId, targetInput){ const wrap=$(containerId); wrap.innerHTML=""; list.forEach(v=>{ const b=document.createElement('button'); b.className='step-btn'; b.textContent=(v>0?`+${v}`:`${v}`); b.addEventListener('click', ()=>{ const el=$(targetInput); if(v==='reset'){ el.value=0; return; } el.value = clampInt((+el.value||0) + v,0); }); wrap.appendChild(b); }); }

buildStepRow(TIMES_PLUS, '#times-plus-row', '#in-times');
buildStepRow(TIMES_MINUS, '#times-minus-row', '#in-times');
buildStepRow(TIMES_PLUS, '#p-times-plus-row', '#p-in-times');
buildStepRow(TIMES_MINUS, '#p-times-minus-row', '#p-in-times');

$("#btn-times-reset")?.addEventListener("click", ()=>{ $("#in-times").value=0; });
$("#p-btn-times-reset")?.addEventListener("click", ()=>{ $("#p-in-times").value=0; });

$("#btn-once")?.addEventListener("click", ()=> drawByPulls(1));
$("#btn-batch")?.addEventListener("click", ()=>{ const n=clampInt(+$("#in-times").value,0); $("#in-times").value=n; if(n>0) drawByPulls(n); });
$("#p-btn-once")?.addEventListener("click", ()=> drawByPulls(1));
$("#p-btn-batch")?.addEventListener("click", ()=>{ const n=clampInt(+$("#p-in-times").value,0); $("#p-in-times").value=n; if(n>0) drawByPulls(n); });

// ===== 価格モード =====
const PRICE_STEPS=[1,5,10,100,200,300,500,700,800,1000,2000,3000,5000,7000,10000,30000];
function buildPriceRows(prefix){ const plusWrap=$(`#${prefix}-plus-row`); const minusWrap=$(`#${prefix}-minus-row`); plusWrap.innerHTML=""; minusWrap.innerHTML=""; PRICE_STEPS.forEach(v=>{ const mk=(sign)=>{ const b=document.createElement('button'); b.className='step-btn'; b.textContent=`${sign}${v}`; return b; }
    const p=mk('+'); p.addEventListener('click', ()=>{ const el=$(`#${prefix.includes('p-')?'p-in-pts':'in-pts'}`); el.value=(+el.value||0)+v; });
    const m=mk('-'); m.addEventListener('click', ()=>{ const el=$(`#${prefix.includes('p-')?'p-in-pts':'in-pts'}`); el.value=Math.max(0,(+el.value||0)-v); });
    plusWrap.appendChild(p); minusWrap.appendChild(m);
  }); }

buildPriceRows('pts');
buildPriceRows('p-pts');

function pointsToPulls(basePoints, remainderStore){ const price = Math.max(1, +state.pricePerPull||300); let points = basePoints; let remainder = remainderStore.val||0;
  if(state.carryRemainder) points += remainder; // 端数を合算
  let pulls = Math.floor(points / price);
  remainder = points % price;
  if(!state.carryRemainder) remainder = 0; // 引き継がない場合は捨てる
  if(!state.accumulateInsufficient && points < price){ remainder = 0; }
  const bonusBase = state.priceScope === 'cumulative' ? (remainderStore.cumu || 0) + basePoints : basePoints;
  pulls = applyBonus(pulls, bonusBase);
  remainderStore.val = remainder; // 端数を保持
  remainderStore.cumu = (remainderStore.cumu||0) + basePoints; // 累積ポイント
  return pulls;
}

function updatePointsKPI(){ $("#kpi-pts-total").textContent = state.pointsTotal|0; $("#kpi-pts-total2").textContent = state.pointsTotal|0; const p=getSelectedParticipant(); $("#kpi-pts-person").textContent = p? (p.pointsTotal|0):0; $("#p-stats-name").textContent=p? p.name:"（未選択）"; $("#kpi-pts-total2_dup").textContent=state.pointsTotal|0; $("#kpi-pts-person_dup").textContent=p? (p.pointsTotal|0):0; }

$("#btn-pts-reset")?.addEventListener("click", ()=>{ $("#in-pts").value=0; });
$("#p-btn-pts-reset")?.addEventListener("click", ()=>{ $("#p-in-pts").value=0; });

$("#btn-pts-draw")?.addEventListener("click", ()=>{ const pts=clampInt(+$("#in-pts").value,0); if(pts<=0) return; state.pointsTotal += pts; const pulls = pointsToPulls(pts, state); $("#in-pts").value=0; updatePointsKPI(); if(pulls>0) drawByPulls(pulls); else showToast("ポイントが不足しています"); });
$("#p-btn-pts-draw")?.addEventListener("click", ()=>{ const p=getSelectedParticipant(); if(!p){ showToast("参加者を選択してください"); return; } const pts=clampInt(+$("#p-in-pts").value,0); if(pts<=0) return; p.pointsTotal = (p.pointsTotal||0) + pts; state.pointsTotal += pts; p._rem = p._rem || {val:0,cumu:0}; const pulls = pointsToPulls(pts, p._rem); $("#p-in-pts").value=0; updatePointsKPI(); if(pulls>0) drawByPulls(pulls); else showToast("ポイントが不足しています"); });

// ===== 戻す =====
$("#btn-undo-global")?.addEventListener("click", async ()=>{ const btn = $("#btn-undo-global"); btn.classList.remove("reset-anim"); void btn.offsetWidth; btn.classList.add("reset-anim"); btn.classList.remove("warp"); void btn.offsetWidth; btn.classList.add("warp"); if(state.mode==="normal"){ const last = state.history.pop(); if(!last){ showToast("戻す対象がありません"); return; } const {counts} = last; for(const k in counts){ state.totals[k] = Math.max(0, (state.totals[k]||0) - counts[k]); } renderResult(state.totals,$("#total")); state.lastSession = null; showToast("直前の抽選を戻しました"); }else{ const p = getSelectedParticipant(); if(!p){ showToast("参加者が選択されていません"); return; } const last = p.history.pop(); if(!last){ showToast("戻す対象がありません"); return; } const {counts} = last; for(const k in counts){ p.totals[k] = Math.max(0, (p.totals[k]||0) - counts[k]); } for(const k in counts){ state.overallParticipantTotals[k] = Math.max(0, (state.overallParticipantTotals[k]||0) - counts[k]); } renderResult(p.totals,$("#total")); renderParticipantOverall(); p.lastResult = null; showToast("直前の抽選を戻しました"); } });

// ===== 参加者 =====
function addParticipant(name){ if(state.participants.length>=50){ showToast("参加者は最大50人までです"); return; } const id=uuid(); state.participants.push({id,name,totals:{},history:[],logs:[],lastResult:null, pointsTotal:0}); state.selectedParticipantId=id; renderParticipantTabs(); renderParticipantView(); renderParticipantOverall(); updatePointsKPI(); }
function getSelectedParticipant(){ return state.participants.find(p=>p.id===state.selectedParticipantId) || null; }
function renderParticipantTabs(){ const bar=$("#p-tab-bar"); bar.innerHTML=""; state.participants.forEach(p=>{ const b=document.createElement("div"); b.className="p-tab" + (p.id===state.selectedParticipantId?" active":""); b.textContent=p.name; b.addEventListener("click", ()=>{ state.selectedParticipantId=p.id; renderParticipantTabs(); renderParticipantView(); b.classList.add("switching"); setTimeout(()=>b.classList.remove("switching"),250); updatePointsKPI(); }); bar.appendChild(b); }); }
function renderParticipantView(){ const p=getSelectedParticipant(); if(!p){ $("#result").innerHTML=`<span class="small">参加者を追加してください</span>`; $("#total").innerHTML=``; $("#log").innerHTML=``; $("#p-stats-name").textContent="（未選択）"; return; } if(p.lastResult){ renderResult(p.lastResult.counts, $("#result")); } else { $("#result").innerHTML=`<span class="small">（まだ結果なし）</span>`; } renderResult(p.totals||{}, $("#total")); const logEl=$("#log"); if(logEl){ logEl.innerHTML=""; (p.logs||[]).forEach(html=>logEl.insertAdjacentHTML("beforeend", html)); }
  $("#p-stats-name").textContent=p? p.name:"（未選択）";
}
function appendParticipantLog(p,n,session){ const parts=[]; state.items.forEach(it=>{ const c=session[it.id]||0; if(c>0) parts.push(`${it.name}×${c}`); }); if(session.miss>0) parts.push(`ハズレ×${session.miss}`); const line = `<div class="small">[${nowStr()}] ${n}回：${parts.join(" / ")||"（なし）"}</div>`; p.logs = p.logs || []; p.logs.unshift(line); const el=$("#log"); if(el) el.insertAdjacentHTML("afterbegin", line); }
function renderParticipantOverall(){ const el=$("#p-overall"); if(!el) return; const map=state.overallParticipantTotals||{}; const rows=[]; state.items.forEach(it=>{ const c=map[it.id]||0; if(c>0) rows.push(`<span class=\"pill\">${it.rarity||"-"}｜${escapeHtml(it.name)} × <b>${c}</b></span>`); }); if(map.miss>0) rows.push(`<span class=\"pill\">ハズレ × <b>${map.miss}</b></span>`); el.innerHTML = `<div class=\"subcard\" style=\"background:#0b1231; margin-top:4px;\"><h4 style=\"margin:0 0 6px 0;\">全体累計</h4>${rows.length? rows.join(" "):`<span class=\"small\">（まだありません）</span>`}</div>`; }

// 参加者追加モーダル
const pModal=$("#p-modal");
$("#p-new-open")?.addEventListener("click", ()=>{ $("#p-new-input").value=""; pModal.style.display='flex'; setTimeout(()=>$("#p-new-input").focus(),10); });
$("#p-new-cancel")?.addEventListener("click", ()=>{ pModal.style.display='none'; });
$("#p-modal .p-modal-bg")?.addEventListener("click", ()=>{ pModal.style.display='none'; });
$("#p-new-add")?.addEventListener("click", ()=>{ const name=$("#p-new-input").value.trim(); if(!name) return; addParticipant(name); pModal.style.display='none'; });

// 参加者名変更（右側）
$("#p-rename-apply")?.addEventListener("click", ()=>{ const p=getSelectedParticipant(); if(!p){ showToast("参加者を選択してください"); return; } const name=$("#p-rename-input").value.trim(); if(!name||name===p.name) return; p.name=name; renderParticipantTabs(); renderParticipantView(); updatePointsKPI(); });

// 選択中参加者を削除
$("#p-btn-delete")?.addEventListener("click", ()=>{ const p=getSelectedParticipant(); if(!p) return; state.participants = state.participants.filter(x=>x.id!==p.id); state.selectedParticipantId = state.participants[0]?.id || null; renderParticipantTabs(); renderParticipantView(); renderParticipantOverall(); updatePointsKPI(); showToast("参加者を削除しました"); });

// ===== 価格設定 UI =====
function renderBonusList(){ const el=$("#bonus-list"); if(!el) return; if(!state.bonusRules.length){ el.innerHTML = '<div class="small">（ボーナスなし）</div>'; return; } el.innerHTML = state.bonusRules.map((r,i)=>`<div class=\"row\" style=\"align-items:center; gap:8px; margin:4px 0;\"><span class=\"pill\">${r.threshold}pt → +${r.bonus}回</span><button class=\"btn-move-small\" data-bdel=${i}>削除</button></div>`).join(""); el.querySelectorAll('[data-bdel]').forEach(b=>b.addEventListener('click', ()=>{ const idx=+b.dataset.bdel; state.bonusRules.splice(idx,1); renderBonusList(); })); }
$("#btn-bonus-add")?.addEventListener("click", ()=>{ const th = Math.max(1, +$("#bonus-th").value||0); const bn = Math.max(1, +$("#bonus-pulls").value||0); state.bonusRules.push({threshold:th, bonus:bn}); renderBonusList(); });
$("#btn-bonus-clear")?.addEventListener("click", ()=>{ state.bonusRules=[]; renderBonusList(); });

$("#price-per-pull")?.addEventListener("change", (e)=>{ state.pricePerPull = Math.max(1, +e.target.value||300); });
$("#opt-carry-rem")?.addEventListener("change", (e)=>{ state.carryRemainder = e.target.value==="1"; });
$("#opt-accum-ins")?.addEventListener("change", (e)=>{ state.accumulateInsufficient = e.target.value==="1"; });
$("#opt-scope")?.addEventListener("change", (e)=>{ state.priceScope = e.target.value; });

// ===== コピー =====
function buildCopyString(n,counts){ const parts=[]; state.items.forEach(it=>{ const c=counts[it.id]||0; if(c>0) parts.push(`[${it.rarity||"-"}]${it.name}×${c}`); }); if(counts.miss>0) parts.push(`ハズレ×${counts.miss}`); return `${n}連：` + parts.join(" / "); }
$("#btn-copy-current")?.addEventListener("click", ()=>{ const s = state.lastSession; if(!s){ showToast("コピーする結果がありません"); return; } const txt = buildCopyString(s.n, s.counts); navigator.clipboard.writeText(txt); showToast("コピーしました"); });
$("#btn-copy-total")?.addEventListener("click", ()=>{ const map = state.totals; const parts=[]; state.items.forEach(it=>{ const c=map[it.id]||0; if(c>0) parts.push(`[${it.rarity||"-"}]${it.name}×${c}`); }); if(map.miss>0) parts.push(`ハズレ×${map.miss}`); const txt = `累計：` + (parts.join(" / ")||"なし"); navigator.clipboard.writeText(txt); showToast("コピーしました"); });

// ===== 星 =====
(function starfield(){ const c=$("#starfield"), ctx=c.getContext("2d",{alpha:true}); function resize(){ c.width=innerWidth; c.height=innerHeight; } resize(); addEventListener("resize", resize); const STAR_MAX = Math.min(140, Math.floor((innerWidth*innerHeight)/18000)); const stars = Array.from({length:STAR_MAX}).map(()=>({ x:Math.random()*c.width, y:Math.random()*c.height, r:Math.random()*1.6+0.4, s:Math.random()*0.6+0.2, a:Math.random()*0.4+0.2 })); function tick(){ ctx.clearRect(0,0,c.width,c.height); for(const st of stars){ st.x += st.s; st.y -= st.s*0.15; if(st.x>c.width+10) st.x=-10; if(st.y<-10) st.y=c.height+10; ctx.globalAlpha = st.a; ctx.beginPath(); ctx.arc(st.x,st.y,st.r,0,Math.PI*2); ctx.fillStyle = "#8bd5ff"; ctx.fill(); } requestAnimationFrame(tick); } tick(); })();

// ===== 初期化 =====
renderList(); renderBonusList();
(function restoreUI(){ const savedTab = localStorage.getItem(state.tabKey) || "draw"; const savedMode = localStorage.getItem(state.modeKey) || "normal"; const savedG = localStorage.getItem(state.gachaKey) || "count"; state.mode = savedMode; state.gachaMode = savedG; setActiveTab(savedTab); applyMode(); if(state.mode==="participants"){ renderParticipantTabs(); renderParticipantView(); renderParticipantOverall(); } updatePointsKPI(); })();

document.addEventListener("keydown", (e)=>{ if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==="z"){ e.preventDefault(); document.getElementById("btn-undo-global").click(); } });
