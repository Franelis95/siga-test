/* =====================================================================
   SIGA · couche serveur de la version de TEST (Supabase)
   Remplace le stockage local de la maquette par un serveur partagé :
   connexion par compte, dossiers communs à tous les testeurs, numéros
   officiels attribués par le serveur, journal d'audit chaîné côté serveur,
   mises à jour en temps réel, file d'attente hors connexion.
   Règles gardées : aucun secret en stockage local (session en mémoire),
   aucune décision de circuit hors connexion (ADR-15).
   ===================================================================== */
const SRV = {
  client:null, session:null, profile:null, tenant:null, loaded:false,
  online:navigator.onLine, busy:false, rt:'', err:'', failed:0,
  synced:new Map(),   // clé -> JSON de la dernière version connue du serveur
  rev:new Map(),      // clé -> numéro de version serveur
  tt:new Map(),       // clé -> ordre de création
  queue:new Set(), inflight:new Set(),
  profiles:null, stamp:0, retry:null, pendingRender:false
};
const CFG_KEY = 'siga.server.cfg';           // adresse du serveur et clé publique : pas des secrets
const THEME_KEY = 'siga.theme';
const BUILT = (typeof SIGA_CONFIG==='object' && SIGA_CONFIG) || {};
const ARR = ['missions','requests','entitlements','mail','slips','docs','notifs','audit','interims','delegations','bookings','budget','engagements','backups'];
const DESC = new Set(['notifs','docs','backups','slips']);   // collections affichées du plus récent au plus ancien
const TOKEN_RE = /\{\{N:[A-Z]+:\d{4}:[a-z0-9]+\}\}/g;

function srvCfg(){
  let c = {}; try{ c = JSON.parse(localStorage.getItem(CFG_KEY)||'{}') || {}; }catch(e){}
  return {url:(BUILT.url||c.url||'').trim().replace(/\/+$/,''), key:(BUILT.key||c.key||'').trim(), built:!!(BUILT.url&&BUILT.key)};
}
const rid = () => Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-4);
const isOnline = () => SRV.online && navigator.onLine;
const untok = s => typeof s==='string' ? s.replace(TOKEN_RE, '···') : s;
const hostOf = u => { try{ return new URL(u).host; }catch(e){ return u; } };
const stampNext = () => { const t = Date.now()*1000; SRV.stamp = Math.max(SRV.stamp+1, t); return SRV.stamp; };

/* ---------------- Remplacements de la maquette ---------------- */
// Numéro officiel : un jeton, remplacé par le serveur au moment de l'enregistrement
nextNum = (key, year) => '{{N:'+key+':'+year+':'+rid()+'}}';
// Audit : le serveur attribue le rang et calcule l'empreinte
audit = (action, target, detail, actor) => {
  S.audit.push({id:uid('a'), at:nowIso(), actor:actor||S.me, action, target:target||'', detail:detail||'', acct:SRV.profile?SRV.profile.email:'', seq:'…', hash:''});
};
verifyAudit = () => {
  let prev = '0'.repeat(64);
  for(const r of S.audit.filter(r => typeof r.seq==='number').sort((a,b)=>a.seq-b.seq)){
    const h = sha256(prev+'|'+r.seq+'|'+r.at+'|'+r.actor+'|'+r.action+'|'+r.target+'|'+r.detail);
    if(h!==r.hash) return r.seq; prev = r.hash;
  }
  return null;
};
save = () => { if(!SRV.loaded) return; try{ localStorage.setItem(THEME_KEY, S.theme||''); }catch(e){} scan(); scheduleFlush(); };
const _renderShell = renderShell;
renderShell = () => untok(_renderShell());
const _modal = modal;
modal = (t, b, f, w) => _modal(untok(t), untok(b), untok(f), w);
const _toast = toast;
toast = m => _toast(untok(m));
const _closeModal = closeModal;
closeModal = () => { _closeModal(); if(SRV.pendingRender) scheduleRender(); };

/* ---------------- Correspondance état <-> serveur ---------------- */
function items(){
  const out = [];
  for(const c of ARR){
    const a = S[c] || (S[c] = []); const n = a.length;
    for(let i=0; i<n; i++){ const o = DESC.has(c) ? a[n-1-i] : a[i]; if(!o.id) o.id = uid(c.slice(0,2)); out.push([c, o.id, o]); }
  }
  out.push(['config','settings',{value:S.settings}]);
  out.push(['config','workflows',{value:S.workflows}]);
  for(const id of Object.keys(S.readNotifs||{})) out.push(['reads', id, {}]);
  return out;
}
function scan(){
  for(const [c,id,o] of items()){
    const k = c+'|'+id;
    if(c==='audit' && SRV.synced.has(k)) continue;               // une ligne d'audit envoyée ne se renvoie jamais
    if(SRV.synced.get(k) !== JSON.stringify(o)){ SRV.queue.add(k); if(!SRV.tt.has(k)) SRV.tt.set(k, stampNext()); }
  }
  updateBar();
}
function toData(c, k, o){
  const d = Object.assign({}, o, {_t:SRV.tt.get(k)});
  if(SRV.rev.has(k)) d._rev = SRV.rev.get(k);
  if(c==='audit'){ delete d.seq; delete d.prev; delete d.hash; }
  return d;
}
function findObj(c, id){
  if(c==='config') return id==='settings' ? {value:S.settings} : id==='workflows' ? {value:S.workflows} : null;
  if(c==='reads') return S.readNotifs[id] ? {} : null;
  return (S[c]||[]).find(o => o.id===id) || null;
}
// mode : 'load' (chargement), 'own' (réponse à notre envoi), 'remote' (temps réel), 'force' (après conflit)
function applyRow(row, mode, sent){
  const c = row.collection, id = row.id, k = c+'|'+id;
  if(mode==='remote' && (SRV.inflight.has(k) || (SRV.queue.has(k) && SRV.synced.has(k)))) return false;
  const d = Object.assign({}, row.data);
  const rev = d._rev, t = d._t; delete d._rev; delete d._t;
  const cur = findObj(c, id);
  if(mode==='own' && cur && sent!==undefined && JSON.stringify(cur)!==sent){
    // modifié pendant l'envoi : on garde la saisie locale et on la renverra sur la nouvelle version
    SRV.rev.set(k, rev); SRV.synced.set(k, '~'); SRV.queue.add(k); return false;
  }
  SRV.rev.set(k, rev); if(t) SRV.tt.set(k, t); else if(!SRV.tt.has(k)) SRV.tt.set(k, 0);
  if(c==='config'){
    if(id==='settings') S.settings = Object.assign({}, S.settings, d.value||{});
    else if(id==='workflows' && d.value && Object.keys(d.value).length) S.workflows = d.value;
    SRV.synced.set(k, JSON.stringify(findObj(c,id)));
    return true;
  }
  if(c==='reads'){ S.readNotifs[id] = true; SRV.synced.set(k, '{}'); return true; }
  if(!ARR.includes(c)) return false;
  let o = cur;
  if(o){ for(const x of Object.keys(o)) delete o[x]; Object.assign(o, d); }
  else { o = d; S[c].push(o); }
  SRV.synced.set(k, JSON.stringify(o));
  return true;
}
function sortColl(c){
  const a = S[c]; if(!a) return;
  if(c==='audit'){ a.sort((x,y) => (typeof x.seq==='number'?x.seq:1e15) - (typeof y.seq==='number'?y.seq:1e15)); return; }
  const key = o => SRV.tt.has(c+'|'+o.id) ? SRV.tt.get(c+'|'+o.id) : 1e18;
  a.sort((x,y) => key(x)-key(y)); if(DESC.has(c)) a.reverse();
}

/* ---------------- Envoi des modifications ---------------- */
function scheduleFlush(){ clearTimeout(SRV._f); SRV._f = setTimeout(flush, 60); }
const isNetErr = e => !e || !e.code && !e.status && /fetch|network|Failed|Load failed|NetworkError|timeout|abort/i.test(String(e.message||e));
function wentOffline(){
  SRV.online = false; updateBar();
  clearTimeout(SRV.retry); SRV.retry = setTimeout(ping, 5000);
}
async function ping(){
  try{
    const {error} = await SRV.client.from('siga_records').select('id', {head:true, count:'exact'}).eq('tenant', SRV.tenant).limit(1);
    if(error && isNetErr(error)) throw error;
    const was = SRV.online; SRV.online = true; updateBar(); if(!was) toast('Connexion rétablie'); flush();
  }catch(e){ SRV.online = false; updateBar(); clearTimeout(SRV.retry); SRV.retry = setTimeout(ping, 8000); }
}
async function flush(){
  if(SRV.busy || !SRV.loaded || !SRV.queue.size) return;
  if(!isOnline()){ updateBar(); return; }
  SRV.busy = true; updateBar();
  let changed = false;
  try{
    const cur = new Map(items().map(x => [x[0]+'|'+x[1], x]));
    const ins = [], upd = [];
    for(const k of [...SRV.queue]){
      const x = cur.get(k); if(!x){ SRV.queue.delete(k); continue; }
      (SRV.synced.has(k) ? upd : ins).push(x);
    }
    // Nouveaux dossiers : par lots, dans l'ordre de création (l'ordre compte pour la chaîne d'audit)
    ins.sort((a,b) => (a[0]==='audit') - (b[0]==='audit') || (SRV.tt.get(a[0]+'|'+a[1])||0) - (SRV.tt.get(b[0]+'|'+b[1])||0));
    for(let i=0; i<ins.length; i+=200){
      const chunk = ins.slice(i, i+200);
      const sent = new Map(), rows = [];
      for(const [c,id,o] of chunk){ const k = c+'|'+id; sent.set(k, JSON.stringify(o)); rows.push({tenant:SRV.tenant, collection:c, id, data:toData(c,k,o)}); SRV.queue.delete(k); SRV.inflight.add(k); }
      const {data, error} = await SRV.client.from('siga_records').insert(rows).select('collection,id,data');
      chunk.forEach(([c,id]) => SRV.inflight.delete(c+'|'+id));
      if(error){ chunk.forEach(([c,id]) => SRV.queue.add(c+'|'+id)); throw error; }
      const got = new Set();
      for(const r of data||[]){ const k = r.collection+'|'+r.id; got.add(k); applyRow(r, 'own', sent.get(k)); changed = true; }
      const missing = chunk.filter(([c,id]) => !got.has(c+'|'+id));
      if(missing.length) changed = (await refetch(missing.map(([c,id]) => [c,id]))) || changed;   // déjà présents (envoi répété)
    }
    // Dossiers modifiés : un par un, avec contrôle de version
    for(const [c,id,o] of upd){
      const k = c+'|'+id, sent = JSON.stringify(o);
      SRV.queue.delete(k); SRV.inflight.add(k);
      const {data, error} = await SRV.client.from('siga_records').update({data:toData(c,k,o)})
        .eq('tenant', SRV.tenant).eq('collection', c).eq('id', id).select('collection,id,data');
      SRV.inflight.delete(k);
      if(error){
        if(error.code==='PT409' || /SIGA_CONFLICT/.test(error.message||'')){
          await refetch([[c,id]]); changed = true;
          toast('Ce dossier venait d’être modifié par un autre utilisateur : la version à jour est affichée, refaites votre action.');
          continue;
        }
        SRV.queue.add(k); throw error;
      }
      if(data && data.length){ applyRow(data[0], 'own', sent); changed = true; }
    }
    SRV.err = ''; SRV.failed = 0;
  }catch(e){
    if(isNetErr(e)) wentOffline();
    else { SRV.err = e.message || String(e); SRV.failed++; toast('Enregistrement refusé par le serveur : '+SRV.err); }
  }finally{
    SRV.busy = false;
    if(changed){ ARR.forEach(sortColl); peekCounters(); scheduleRender(); }
    updateBar();
    if(SRV.queue.size && isOnline() && !SRV.err) scheduleFlush();
  }
}
async function refetch(list){
  let any = false;
  const by = {}; list.forEach(([c,id]) => (by[c] = by[c]||[]).push(id));
  for(const c of Object.keys(by)){
    const {data, error} = await SRV.client.from('siga_records').select('collection,id,data').eq('tenant', SRV.tenant).eq('collection', c).in('id', by[c]);
    if(error) throw error;
    (data||[]).forEach(r => { any = applyRow(r, 'force') || any; });
  }
  return any;
}
async function peekCounters(){
  const {data, error} = await SRV.client.rpc('siga_counters_peek');
  if(!error && data){ S.counters = {}; data.forEach(r => S.counters[r.key+'|'+r.year] = r.last_value); }
}
function scheduleRender(){
  clearTimeout(SRV._r);
  SRV._r = setTimeout(() => {
    const a = document.activeElement;
    if($('#scrim') || (a && a.closest && a.closest('#root') && /INPUT|SELECT|TEXTAREA/.test(a.tagName))){ SRV.pendingRender = true; return; }
    SRV.pendingRender = false; rerender();
  }, 120);
}
document.addEventListener('focusout', () => { if(SRV.pendingRender && !$('#scrim')) setTimeout(scheduleRender, 60); });
window.addEventListener('online', () => { if(SRV.client) ping(); });
window.addEventListener('offline', () => { SRV.online = false; updateBar(); });
window.addEventListener('beforeunload', e => { if(SRV.queue.size || SRV.inflight.size){ e.preventDefault(); e.returnValue = ''; } });

/* ---------------- Barre d'état ---------------- */
function barHtml(){
  const n = SRV.queue.size + SRV.inflight.size;
  let st, cls;
  if(!isOnline()){ st = 'Hors connexion' + (n ? ' · '+n+' modification'+(n>1?'s':'')+' en attente' : '') + ' · consultation et brouillons seulement'; cls = 't-warn'; }
  else if(SRV.err){ st = 'Erreur d’enregistrement'; cls = 't-bad'; }
  else if(SRV.busy || n){ st = 'Enregistrement…'; cls = 't-info'; }
  else { st = 'En ligne · à jour' + (SRV.rt==='SUBSCRIBED' ? ' · temps réel' : ''); cls = 't-ok'; }
  const p = SRV.profile || {};
  return `<span><b>Version de test.</b> Serveur ${esc(hostOf(srvCfg().url))} · compte ${esc(p.email||'')}</span>
    <span class="tag ${cls}" role="status">${esc(st)}</span>${SRV.err?`<button class="btn sm ghost" data-a="srvRetry">Réessayer</button>`:''}`;
}
function serverBanner(){ return `<div class="demo no-print" id="srvbar">${barHtml()}</div>`; }
function updateBar(){ const b = document.getElementById('srvbar'); if(b) b.innerHTML = barHtml(); }
ACT.srvRetry = () => { SRV.err = ''; flush(); };

/* ---------------- Décisions interdites hors connexion (ADR-15) ---------------- */
const OFFLINE_BLOCK = /^(om(Submit|Resubmit|Approve|ApproveModal|Signed|ReturnDo|RejectDo|AssignDo|FundDo|EditDo|Consent)|req(Submit|Withdraw|Act|ActDo)|mail(Scan|Transmit|Impute|ImputeDo|Distrib|DistribDo|Out|Close|CloseDo)|slip(NewDo|AckDo)|interimDo|delegDo|delegRevoke|entDo|wfNature|setParam|restoreTest)$/;
const OFFLINE_MSG = 'Hors connexion : les décisions et transmissions attendent le retour du réseau. Consultation et brouillons restent possibles.';
function guardActions(){
  for(const k of Object.keys(ACT)){
    if(!OFFLINE_BLOCK.test(k)) continue;
    const f = ACT[k]; ACT[k] = (...a) => isOnline() ? f(...a) : toast(OFFLINE_MSG);
  }
  const rc = ACT.reqCreate;
  ACT.reqCreate = (x, ...a) => (/\|submit$/.test(x||'') && !isOnline()) ? toast(OFFLINE_MSG) : rc(x, ...a);
}

/* ---------------- Mon compte et « Voir en tant que » ---------------- */
function accountHtml(){
  const p = SRV.profile, me = p.agent_mat ? AGENT[p.agent_mat] : null;
  return `<div class="panel" style="margin-top:14px"><div class="panel-h">Mon compte</div><div class="kv pad" style="padding:12px 16px">
    <div><span>Compte</span><b>${esc(p.email)}</b></div>
    <div><span>Agent</span><b>${me?esc(me.name)+' · '+esc(me.mat):'Compte technique'}</b></div>
    <div><span>Serveur</span><b class="mono">${esc(hostOf(srvCfg().url))}</b></div></div>
    <div class="pad" style="padding:0 16px 14px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn" data-a="srvPwd">Changer mon mot de passe</button>
      <button class="btn dng" data-a="srvLogout">Se déconnecter</button></div></div>`;
}
function wrapSwitch(){
  const sw = ACT.switchUser;
  ACT.switchUser = () => {
    if(SRV.profile.can_impersonate){
      sw();
      const b = document.querySelector('#scrim .modal-b');
      if(b){ b.insertAdjacentHTML('afterbegin', `<p class="note" style="margin:0">Vous voyez SIGA avec le profil choisi, mais vos actions restent tracées au nom de votre compte sur le serveur.</p>`); b.insertAdjacentHTML('beforeend', accountHtml()); }
    } else {
      modal('Mon compte', accountHtml(), `<button class="btn" data-a="closeModal">Fermer</button>`);
    }
  };
  const su = ACT.setUser;
  ACT.setUser = id => { if(!SRV.profile.can_impersonate) return; su(id); };
}
ACT.srvLogout = async () => {
  if(SRV.queue.size || SRV.inflight.size){ if(!confirmLeave()) return; }
  try{ await SRV.client.auth.signOut(); }catch(e){}
  location.reload();
};
function confirmLeave(){ toast('Des modifications ne sont pas encore enregistrées sur le serveur. Reconnectez-vous au réseau puis réessayez.'); return false; }
ACT.srvPwd = () => modal('Changer mon mot de passe',
  `<label class="f" for="np1">Nouveau mot de passe<input class="inp" id="np1" type="password" autocomplete="new-password"></label>
   <label class="f" for="np2">Confirmer<input class="inp" id="np2" type="password" autocomplete="new-password"></label>
   <p class="muted" style="margin:0">Au moins 8 caractères.</p>`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn pri" data-a="srvPwdDo">Enregistrer</button>`);
ACT.srvPwdDo = async () => {
  const a = $('#np1').value, b = $('#np2').value;
  if(a.length < 8) return toast('Au moins 8 caractères.');
  if(a !== b) return toast('Les deux saisies diffèrent.');
  const {error} = await SRV.client.auth.updateUser({password:a});
  if(error) return toast('Refusé : '+error.message);
  closeModal(); toast('Mot de passe changé');
};

/* ---------------- Module d'administration des comptes de test ---------------- */
async function loadProfiles(){
  const {data, error} = await SRV.client.from('siga_profiles').select('user_id,email,agent_mat,is_admin,can_impersonate,created_at').order('created_at');
  SRV.profiles = error ? [] : data; scheduleRender();
}
mod('comptes', {group:'Système', label:'Comptes de test', icon:'lock', visible:()=>!!(SRV.profile && SRV.profile.is_admin), render(){
  if(!SRV.profiles){ loadProfiles(); }
  const P = SRV.profiles || [];
  const empty = !S.missions.length && !S.requests.length && !S.mail.length;
  const rows = P.map(p => ({...p, ag:p.agent_mat ? AGENT[p.agent_mat] : null}));
  return pageHead('Système', 'Comptes de test', 'Rattachez chaque compte de test à un agent de la liste du personnel. Le compte agit alors avec les droits de cet agent.')
  + `<div class="grid g21"><div class="panel"><div class="panel-h">Comptes rattachés <span class="muted" style="font-weight:400">${P.length}</span></div>
      ${table([{h:'Compte',f:p=>esc(p.email)},{h:'Agent',f:p=>p.ag?esc(p.ag.name)+' <span class="mono muted">'+esc(p.ag.mat)+'</span>':'<span class="muted">Compte technique</span>'},
        {h:'Rôle',f:p=>p.ag?esc(ROLE_LABEL[mainRole(p.ag.id)]||''):'—'},{h:'Droits de test',f:p=>(p.is_admin?tag('Administrateur','t-gold'):'')+' '+(p.can_impersonate?tag('Voir en tant que','t-info'):'')},
        {h:'',f:p=>`<button class="btn sm" data-a="srvEditUser" data-x="${esc(p.email)}">Modifier</button>`}], rows, {emptyTitle:SRV.profiles?'Aucun compte':'Chargement…'})}</div>
    <div>
      <div class="panel"><div class="panel-h">Rattacher un compte</div><div style="padding:14px 16px;display:grid;gap:12px">
        <p class="muted" style="margin:0">1. Créez le compte dans Supabase : Authentication › Users › Add user (cochez « Auto Confirm User »). 2. Rattachez-le ici.</p>
        <label class="f" for="lk_e">Adresse du compte<input class="inp" id="lk_e" type="email" autocomplete="off"></label>
        <label class="f" for="lk_q">Agent<input class="inp" id="lk_q" placeholder="Nom ou matricule ; vide = compte technique" data-in="srvAgentQ" autocomplete="off"></label>
        <input type="hidden" id="lk_m"><div id="lk_r" class="list"></div>
        <label class="chk"><input type="checkbox" id="lk_a"> Administrateur de test</label>
        <label class="chk"><input type="checkbox" id="lk_i"> Peut « Voir en tant que » un autre agent</label>
        <div><button class="btn pri" data-a="srvLink">Rattacher</button></div></div></div>
      <div class="panel" style="margin-top:16px"><div class="panel-h">Données de test</div><div style="padding:14px 16px;display:grid;gap:10px">
        <p class="muted" style="margin:0">${empty?'La base est vide. Vous pouvez charger les dossiers d’exemple (marqués « Exemple ») ou commencer directement.':'Les dossiers restent partagés par tous les testeurs.'}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${empty?`<button class="btn" data-a="srvSeed">Charger les exemples</button>`:''}
          <button class="btn" data-a="srvVerify">Vérifier le journal sur le serveur</button>
          <button class="btn dng" data-a="srvReset">Vider la base de test</button></div></div></div>
    </div></div>`;
}});
INP.srvAgentQ = v => {
  $('#lk_m').value = '';
  const q = v.toLowerCase().trim(); const r = q.length<2 ? [] : AG.filter(a => !a.driver && (a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q.replace(/\s/g,'')))).slice(0,6);
  $('#lk_r').innerHTML = r.map(a => `<div class="li clk" data-a="srvPick" data-x="${a.id}"><span class="av">${esc(initials(a.name))}</span><div class="bd"><b>${esc(a.name)}</b><span>${esc(a.fn)} · ${esc(unitShort(a.unit))}</span></div><span class="rt mono">${esc(a.mat)}</span></div>`).join('');
};
ACT.srvPick = id => { $('#lk_m').value = id; $('#lk_q').value = nm(id)+' · '+AGENT[id].mat; $('#lk_r').innerHTML = ''; };
ACT.srvEditUser = email => {
  const p = (SRV.profiles||[]).find(x => x.email===email); if(!p) return;
  go('comptes');
  setTimeout(() => { $('#lk_e').value = p.email; $('#lk_m').value = p.agent_mat||''; $('#lk_q').value = p.agent_mat ? nm(p.agent_mat)+' · '+AGENT[p.agent_mat].mat : ''; $('#lk_a').checked = p.is_admin; $('#lk_i').checked = p.can_impersonate; $('#lk_e').focus(); }, 30);
};
ACT.srvLink = async () => {
  if(!isOnline()) return toast(OFFLINE_MSG);
  const email = val('lk_e'), mat = $('#lk_m').value;
  if(!email) return toast('Indiquez l’adresse du compte.');
  if(val('lk_q') && !mat) return toast('Choisissez l’agent dans la liste.');
  const {error} = await SRV.client.rpc('siga_link_user', {p_email:email, p_mat:mat, p_admin:$('#lk_a').checked, p_impersonate:$('#lk_i').checked});
  if(error) return toast(error.message);
  audit('TEST_ACCOUNT_LINKED', email, mat||'compte technique'); save();
  toast('Compte rattaché'); loadProfiles();
};
ACT.srvSeed = () => {
  if(!isOnline()) return toast(OFFLINE_MSG);
  const me = S.me; seedExamples(); S.me = me;
  commit('Exemples chargés : envoi au serveur…');
};
ACT.srvVerify = async () => {
  const {data, error} = await SRV.client.rpc('siga_verify_audit');
  if(error) return toast(error.message);
  toast(data==null ? 'Journal intègre sur le serveur' : 'Chaîne rompue sur le serveur à la ligne '+data);
};
ACT.srvReset = () => modal('Vider la base de test',
  `<p style="margin:0">Tous les dossiers, numéros et lignes du journal de la base de test seront effacés pour tous les testeurs. Les comptes restent. Cette action ne s’annule pas.</p>`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn dng" data-a="srvResetDo">Vider la base</button>`);
ACT.srvResetDo = async () => {
  const {data, error} = await SRV.client.rpc('siga_reset_test_data');
  if(error) return toast(error.message);
  closeModal(); toast(data); setTimeout(() => location.reload(), 800);
};
ACT.resetDemo = () => SRV.profile && SRV.profile.is_admin ? go('comptes') : toast('Réservé à l’administrateur de test');

/* ---------------- Connexion ---------------- */
function loginHtml(msg){
  const c = srvCfg();
  return `<div class="login"><form class="login-card" id="lgf" autocomplete="on">
    <div class="login-brand"><img src="${LOGO}" alt="Logo SIGA"><div><b>SIGA</b><span>Système Intégré de Gestion Administrative · DGREH</span></div></div>
    <p class="note" style="margin:0">Version de test : les dossiers saisis ici servent aux essais et sont partagés entre testeurs.</p>
    ${msg?`<p class="login-err" role="alert">${esc(msg)}</p>`:''}
    ${c.built?'':`<details ${c.url?'':'open'}><summary>Serveur ${c.url?esc(hostOf(c.url)):'à configurer'}</summary>
      <label class="f" for="lg_u">Adresse du projet Supabase<input class="inp" id="lg_u" placeholder="https://xxxx.supabase.co" value="${esc(c.url)}"></label>
      <label class="f" for="lg_k">Clé publique (anon)<input class="inp" id="lg_k" value="${esc(c.key)}"></label></details>`}
    <label class="f" for="lg_e">Adresse e-mail<input class="inp" id="lg_e" type="email" autocomplete="username"></label>
    <label class="f" for="lg_p">Mot de passe<input class="inp" id="lg_p" type="password" autocomplete="current-password"></label>
    <button class="btn pri" type="submit" id="lg_b">Se connecter</button>
    <p class="muted" style="margin:0;font-size:12px">La session n’est pas conservée sur l’appareil : reconnectez-vous à chaque ouverture.</p>
  </form></div>`;
}
function showLogin(msg){
  document.getElementById('root').innerHTML = loginHtml(msg);
  document.title = 'SIGA · Connexion';
  const f = $('#lgf'); f.addEventListener('submit', doLogin);
  setTimeout(() => { const e = $('#lg_e'); if(e) e.focus(); }, 30);
}
// Une requête bloquée (réseau instable) est abandonnée après 20 s, puis rejouée
function timedFetch(u, o={}){
  const c = new AbortController(), t = setTimeout(() => c.abort(), 20000);
  if(o.signal) o.signal.addEventListener('abort', () => c.abort());
  return fetch(u, Object.assign({}, o, {signal:c.signal})).finally(() => clearTimeout(t));
}
function makeClient(){
  const c = srvCfg();
  if(!c.url || !c.key) return null;
  if(!/^https?:\/\//.test(c.url)) return null;
  return window.supabase.createClient(c.url, c.key, {
    auth:{persistSession:false, autoRefreshToken:true, detectSessionInUrl:false},
    realtime:{params:{eventsPerSecond:20}},
    global:{fetch:timedFetch}
  });
}
async function doLogin(e){
  e.preventDefault();
  if($('#lg_u')){
    const url = $('#lg_u').value.trim(), key = $('#lg_k').value.trim();
    try{ localStorage.setItem(CFG_KEY, JSON.stringify({url, key})); }catch(x){}
  }
  const c0 = srvCfg();
  if(!SRV.client || SRV._cfg !== c0.url+'|'+c0.key){ SRV.client = makeClient(); SRV._cfg = c0.url+'|'+c0.key; }
  if(!SRV.client) return showLogin('Indiquez l’adresse du serveur (https://…supabase.co) et sa clé publique.');
  const b = $('#lg_b'); b.disabled = true; b.textContent = 'Connexion…';
  const email = $('#lg_e').value.trim(), password = $('#lg_p').value;
  let r;
  try{ r = await SRV.client.auth.signInWithPassword({email, password}); }
  catch(x){ return showLogin('Serveur injoignable. Vérifiez la connexion et l’adresse du serveur.'); }
  if(r.error){
    const m = /Invalid login/i.test(r.error.message) ? 'Adresse ou mot de passe incorrect.' : isNetErr(r.error) ? 'Serveur injoignable. Vérifiez la connexion.' : r.error.message;
    return showLogin(m);
  }
  SRV.session = r.data.session;
  try{ await startApp(r.data.user); }
  catch(x){ showLogin(isNetErr(x) ? 'Connexion perdue pendant le chargement. Réessayez.' : 'Chargement impossible : '+(x.message||x)); }
}
async function startApp(user){
  const {data:prof, error} = await SRV.client.from('siga_profiles').select('*').eq('user_id', user.id).maybeSingle();
  if(error) throw error;
  if(!prof){ await SRV.client.auth.signOut(); return showLogin('Ce compte n’est rattaché à aucun agent. Demandez à l’administrateur de test de le rattacher (module « Comptes de test »).'); }
  if(prof.agent_mat && !AGENT[prof.agent_mat]){ await SRV.client.auth.signOut(); return showLogin('Le matricule rattaché à ce compte ('+prof.agent_mat+') n’existe pas dans la liste du personnel.'); }
  SRV.profile = prof; SRV.tenant = prof.tenant;
  UID_PFX = rid().slice(0,4);                 // identifiants uniques entre appareils
  document.getElementById('root').innerHTML = `<div class="login"><div class="login-card"><b>Chargement des dossiers…</b></div></div>`;
  // Chargement complet, par pages
  const rows = [];
  for(let from=0;; from+=1000){
    const {data, error} = await SRV.client.from('siga_records').select('collection,id,data').eq('tenant', SRV.tenant).order('collection').order('id').range(from, from+999);
    if(error) throw error;
    rows.push(...data); if(data.length < 1000) break;
  }
  S = freshState();
  S.me = prof.agent_mat || 'ADMIN';
  try{ S.theme = localStorage.getItem(THEME_KEY) || ''; }catch(x){}
  rows.forEach(r => applyRow(r, 'load'));
  ARR.forEach(sortColl);
  await peekCounters();
  SRV.loaded = true;
  guardActions(); wrapSwitch();
  if(S.theme) document.documentElement.setAttribute('data-theme', S.theme);
  render();
  scan(); flush();                              // paramètres et circuits par défaut si la base est neuve
  // Temps réel
  SRV.client.channel('siga-'+SRV.tenant)
    .on('postgres_changes', {event:'*', schema:'public', table:'siga_records', filter:'tenant=eq.'+SRV.tenant}, p => {
      if(p.eventType==='DELETE'){ return; }
      const row = p.new; if(!row || !row.id) return;
      if(applyRow(row, 'remote')){ sortColl(row.collection); clearTimeout(SRV._pc); SRV._pc = setTimeout(peekCounters, 800); scheduleRender(); }
    })
    .subscribe(st => { SRV.rt = st; updateBar(); });
  SRV.client.auth.onAuthStateChange(ev => { if(ev==='SIGNED_OUT' && SRV.loaded){ SRV.loaded = false; showLogin('Session terminée. Reconnectez-vous.'); } });
}

/* ---------------- Démarrage ---------------- */
window.SIGA_SERVER_READY = true;
if(!window.supabase){ document.getElementById('root').innerHTML = '<p style="padding:24px">Bibliothèque de connexion absente : reconstruisez l’application.</p>'; }
else showLogin('');
