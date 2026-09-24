/* =====================================================================
   Module ORDRES DE MISSION
   ===================================================================== */
const OM_STATUS = {
  DRAFT:['Brouillon','t-n'], IN_APPROVAL:['En circuit','t-info'], PENDING_CORRECTION:['À corriger','t-warn'], PENDING_CONSENT:['Accord du demandeur attendu','t-gold'],
  APPROVED_DG:['Validé par le DG','t-ok'], PENDING_SG_SIGNATURE:['En signature SG','t-gold'], SIGNED:['Signé','t-ok'],
  REJECTED:['Rejeté','t-bad'], CANCELLED:['Annulé','t-bad'], WITHDRAWN:['Retiré','t-n']
};
const omTag = m => tag(...(OM_STATUS[m.status]||[m.status,'t-n']));
const FUNDING = [['BE','Budget de l’État 2026'],['PROJ','Projet (financement extérieur)'],['PART','Partenaire technique et financier'],['PROP','Ressources propres']];
const fundLabel = c => (FUNDING.find(f=>f[0]===c)||[,'—'])[1];

function createMission(p){
  const n = nextNum('DEM', 2026);
  const m = Object.assign({id:uid('m'), ref:'DEM-2026-'+pad(n,6), status:'DRAFT', steps:[], history:[], participants:[],
    vehicle:null, driver:null, funding:'', number:null, createdAt:nowIso(), ex:false}, p);
  if(!m.participants.includes(m.initiator)) m.participants.unshift(m.initiator);
  S.missions.push(m);
  audit('MISSION_CREATED', m.ref, m.subject, m.initiator);
  return m;
}
function missionHistory(m, who, what){ m.history.push({at:nowIso(), who, what}); }
function submitMission(m, by){
  m.steps = planCircuit('MISSION_ORDER', m.initiator, {needsVehicle:m.needsVehicle});
  m.status = 'IN_APPROVAL'; m.submittedAt = nowIso();
  missionHistory(m, by, 'Soumission au circuit');
  audit('MISSION_SUBMITTED', m.ref, '', by);
  advanceMission(m);
}
function advanceMission(m){
  const s = activateNext(m.steps);
  if(!s){ return; }
  if(s.status==='AWAITING'){ notify('ADMIN','Acteur à désigner : '+m.ref, s.label+' : '+s.reason, 'om', 'ESCALATION'); return; }
  notify(s.actor, 'OM à traiter : '+m.ref, s.label+' · '+m.subject, 'om');
}
function missionConflicts(m){
  if(!m.vehicle && !m.driver) return [];
  const live = S.missions.filter(x => x.id!==m.id && ['IN_APPROVAL','APPROVED_DG','PENDING_SG_SIGNATURE','SIGNED'].includes(x.status));
  const out = [];
  live.forEach(x => {
    if(x.from > m.to || x.to < m.from) return;
    if(m.vehicle && x.vehicle===m.vehicle) out.push({kind:'Véhicule', res:m.vehicle, other:x});
    if(m.driver && x.driver===m.driver) out.push({kind:'Chauffeur', res:nm(m.driver), other:x});
  });
  return out;
}
function unavailableParticipants(m){
  return m.participants.map(p => ({p, u:S.requests.find(r => r.requester===p && r.status==='APPROVED' && r.startsOn<=m.to && r.endsOn>=m.from)}))
    .filter(x => x.u);
}
function missionAct(m, action, opt, by=S.me){
  const s = activeStep(m);
  if(action==='APPROVE'){
    if(s.code==='BCMS' && !(m.vehicle && m.driver)) return toast('Affectez un véhicule et un chauffeur avant de valider.');
    if(s.code==='SAF' && !m.funding) return toast('Confirmez la source de financement avant de valider.');
    s.status='APPROVED'; s.at=nowIso(); s.by=by; s.comment=opt&&opt.comment||'';
    missionHistory(m, by, 'Validation : '+s.label);
    audit('STEP_APPROVED', m.ref, s.code, by);
    if(s.code==='DG'){
      m.status='PENDING_SG_SIGNATURE';
      const n = nextNum('OM', 2026); m.number = 'OM/2026/DGREH/'+pad(n,4);
      const body = [m.number, m.subject, m.dest, m.from, m.to, m.participants.join(',')].join('|');
      S.docs.unshift({id:uid('d'), type:'Ordre de mission', number:m.number, title:m.subject, subject:m.id, kind:'OM', at:nowIso(),
        version:1, status:'En signature', hash:sha256(body), code:'VRF-'+sha256(body).slice(0,6).toUpperCase(), ex:m.ex});
      audit('OFFICIAL_NUMBER_ASSIGNED', m.ref, m.number, 'SYSTEM');
      missionHistory(m, 'SYSTEM', 'Numéro officiel attribué : '+m.number+' ; acte généré');
      notify(m.initiator, 'OM validé par le DG : '+m.number, m.subject, 'om', 'INFORMATION');
    }
    if(s.code==='SG_SIGNATURE'){
      m.status='SIGNED'; m.signedAt=nowIso();
      const d = S.docs.find(x => x.subject===m.id && x.kind==='OM'); if(d){ d.version=2; d.status='Signé'; }
      missionHistory(m, by, 'Dépôt de l’OM signé par le SG');
      m.participants.forEach(p => notify(p, 'OM signé : '+m.number, m.subject+' · '+m.dest, 'om', 'INFORMATION'));
      audit('SIGNED_DOCUMENT_UPLOADED', m.ref, m.number, by);
    }
    advanceMission(m);
  } else if(action==='RETURN'){
    s.status='RETURNED'; s.at=nowIso(); s.by=by; s.comment=opt.comment;
    m.status='PENDING_CORRECTION'; missionHistory(m, by, 'Retour pour correction : '+opt.comment);
    notify(m.initiator, 'OM à corriger : '+m.ref, opt.comment, 'om'); audit('CORRECTION_REQUESTED', m.ref, opt.comment, by);
  } else if(action==='REJECT'){
    s.status='REJECTED'; s.at=nowIso(); s.by=by; s.comment=opt.comment;
    m.status='REJECTED'; missionHistory(m, by, 'Rejet : '+opt.comment);
    notify(m.initiator, 'OM rejeté : '+m.ref, opt.comment, 'om'); audit('MISSION_REJECTED', m.ref, opt.comment, by);
  }
}
function resubmitMission(m, by){
  const s = m.steps.find(x => x.status==='RETURNED');
  if(s){ s.status='ACTIVE'; s.comment=''; }
  m.status='IN_APPROVAL'; missionHistory(m, by, 'Correction soumise : retour direct à l’étape « '+(s?s.label:'')+' »');
  if(s) notify(s.actor, 'OM corrigé : '+m.ref, m.subject, 'om');
}

/* ---------------- Vues ---------------- */
function omVisible(m){
  if(can('MISSION_CANCEL_SIGNED') || can('BCMS_READ') || can('SAF_READ') || can('ADMIN')) return true;
  if(m.initiator===S.me || m.participants.includes(S.me)) return true;
  if(m.steps.some(s => s.actor===S.me)) return true;
  if(can('UNIT_READ')){ const me = person(S.me); const ini = AGENT[m.initiator]; return ini && ancestors(ini.unit).some(u => u.code===me.unit); }
  if(rolesOf(S.me).includes('SECRETARIAT')) return true;
  return false;
}
mod('om', {group:'Processus', label:'Ordres de mission', icon:'mission', render(){
  if(UI.sel.om) return omDetail(S.missions.find(m=>m.id===UI.sel.om));
  const tab = UI.tab.om || 'todo';
  const all = S.missions.filter(omVisible);
  const lists = {
    todo: all.filter(m => canActOnStep(activeStep(m)) || (m.status==='PENDING_CORRECTION' && m.initiator===S.me)),
    mine: all.filter(m => m.initiator===S.me || m.participants.includes(S.me)),
    run: all.filter(m => ['IN_APPROVAL','PENDING_CORRECTION','PENDING_SG_SIGNATURE'].includes(m.status)),
    all
  };
  const rows = lists[tab].slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  return pageHead('Processus', 'Ordres de mission',
    'Circuit : chef de service, directeur, BCMS, service financier, DG, puis dépôt de l’acte signé par le SG. Une même personne n’est sollicitée qu’une fois.',
    can('MISSION_CREATE')?`<button class="btn pri" data-a="omNew">${ico('plus')}Nouvelle demande d’OM</button>`:'')
  + `<div class="kpis">${kpi('À traiter par moi', lists.todo.length, 'étapes actives à mon nom', lists.todo.length?'warn':'')}
     ${kpi('En circuit', lists.run.length, 'toutes structures confondues')}
     ${kpi('Signés en 2026', all.filter(m=>m.status==='SIGNED').length, 'numéros sans discontinuité', 'good')}
     ${kpi('Conflits de ressources', all.filter(m=>missionConflicts(m).length).length, 'soumis au BCMS, jamais réaffectés d’office', all.some(m=>missionConflicts(m).length)?'bad':'')}</div>
  <div class="panel"><div class="tabs" role="tablist">${[['todo','À traiter',lists.todo.length],['mine','Mes missions',lists.mine.length],['run','En cours',lists.run.length],['all','Tous',all.length]]
    .map(([k,l,n])=>`<button class="${tab===k?'on':''}" data-a="tab" data-x="om:${k}">${l} <span class="cnt-b">${n}</span></button>`).join('')}</div>
  ${table([
    {h:'Référence', f:m=>`<b class="mono">${esc(m.number||m.ref)}</b>${EX(m)}<span class="sub mono">${m.number?esc(m.ref):''}</span>`},
    {h:'Objet', f:m=>`${esc(m.subject)}<span class="sub">${esc(m.dest)} · ${dfr(m.from)} au ${dfr(m.to)}</span>`},
    {h:'Initiateur', f:m=>`${esc(nm(m.initiator))}<span class="sub">${esc(unitShort(AGENT[m.initiator].unit))}</span>`},
    {h:'Étape en cours', f:m=>{ const s=activeStep(m); return s?`${esc(s.label)}<span class="sub">${esc(nm(s.actor))}</span>`:'<span class="muted">—</span>'; }},
    {h:'Statut', f:m=>omTag(m)+(missionConflicts(m).length?' '+tag('Conflit','t-bad'):'')}
  ], rows, {click:'omOpen', emptyTitle:'Aucun ordre de mission', empty:' dans cette vue.'})}</div>`;
}});
ACT.tab = x => { const [k,v] = x.split(':'); UI.tab[k]=v; rerender(); };
ACT.omOpen = id => { UI.sel.om = id; render(); window.scrollTo(0,0); };
ACT.omBack = () => { UI.sel.om = null; render(); };

function omDetail(m){
  if(!m) { UI.sel.om=null; return MODS.om.render(); }
  const s = activeStep(m); const mine = canActOnStep(s) && m.status==='IN_APPROVAL';
  const conf = missionConflicts(m), un = unavailableParticipants(m);
  let actions = '';
  if(m.status==='DRAFT' && m.initiator===S.me) actions += `<button class="btn pri" data-a="omSubmit" data-x="${m.id}">${ico('send')}Soumettre</button>`;
  if(m.status==='PENDING_CONSENT' && m.initiator===S.me) actions += `<button class="btn pri" data-a="omConsent" data-x="${m.id}:1">Accepter les modifications</button><button class="btn dng" data-a="omConsent" data-x="${m.id}:0">Refuser</button>`;
  if(m.status==='PENDING_CORRECTION' && m.initiator===S.me) actions += `<button class="btn pri" data-a="omResubmit" data-x="${m.id}">Soumettre la correction</button>`;
  if(mine){
    if(s.code==='BCMS') actions += `<button class="btn" data-a="omAssign" data-x="${m.id}">${ico('car')}Affecter véhicule et chauffeur</button>`;
    if(s.code==='SAF') actions += `<button class="btn" data-a="omFund" data-x="${m.id}">${ico('coins')}Confirmer le financement</button>`;
    if(s.code==='SG_SIGNATURE') actions += `<button class="btn pri" data-a="omSigned" data-x="${m.id}">${ico('down')}Déposer l’OM signé</button>`;
    else actions += `<button class="btn pri" data-a="omApprove" data-x="${m.id}">${ico('check')}Valider</button>`;
    actions += `<button class="btn" data-a="omEdit" data-x="${m.id}">Modifier</button><button class="btn" data-a="omReturn" data-x="${m.id}">Retourner pour correction</button><button class="btn dng" data-a="omReject" data-x="${m.id}">Rejeter</button>`;
  }
  if(m.number) actions += `<button class="btn" data-a="omDoc" data-x="${m.id}">${ico('doc')}Voir l’acte</button>`;
  return `<div><button class="btn ghost sm" data-a="omBack">← Ordres de mission</button></div>`
  + pageHead('Ordre de mission · '+(m.number||m.ref), m.subject, `${esc(m.dest)} · du ${dfr(m.from)} au ${dfr(m.to)} (${days(m.from,m.to)+1} jours) · ${omTag(m)} ${EX(m)}`, actions)
  + (m.pending?`<div class="note warn"><b>Modification proposée par ${esc(nm(m.pending.by))}, en attente de l’accord du demandeur.</b> ${m.pending.changes.map(c=>`${esc(c.label)} : ${esc(c.before)} → <b>${esc(c.after)}</b>`).join(' ; ')}${m.pending.comment?` · « ${esc(m.pending.comment)} »`:''}</div>`:'')
  + (conf.length?`<div class="note warn"><b>Conflit de ressources.</b> ${conf.map(c=>`${esc(c.kind)} ${esc(c.res)} déjà réservé pour ${esc(c.other.number||c.other.ref)} (${dfr(c.other.from)} au ${dfr(c.other.to)})`).join(' ; ')}. Le BCMS décide : maintenir, changer de ressource ou demander une correction. Rien n’est réaffecté automatiquement.</div>`:'')
  + (un.length?`<div class="note warn"><b>Participant indisponible.</b> ${un.map(x=>`${esc(nm(x.p))} est en ${x.u.type==='LEAVE'?'congé':'absence'} accordé du ${dfr(x.u.startsOn)} au ${dfr(x.u.endsOn)}`).join(' ; ')}.</div>`:'')
  + `<div class="grid g21"><div class="grid">
    <div class="panel"><h2>Dossier</h2><div class="pad kv">
      <div><span>Initiateur</span><b>${esc(nm(m.initiator))}</b></div>
      <div><span>Unité du circuit</span><b>${esc(unitName(AGENT[m.initiator].unit))}</b></div>
      <div><span>Structure organisatrice</span><b>${esc(m.orgEntity||'—')}</b></div>
      <div><span>Moyen de transport</span><b>${m.needsVehicle?'Véhicule administratif':esc(m.transport||'Sans véhicule')}</b></div>
      <div><span>Véhicule</span><b class="mono">${esc(m.vehicle||'—')}</b></div>
      <div><span>Chauffeur</span><b>${esc(m.driver?nm(m.driver):'—')}</b></div>
      <div><span>Financement</span><b>${esc(fundLabel(m.funding))}</b></div>
      <div><span>TDR</span><b>${m.tdr?'Joint · '+esc(m.tdr):'Non joint'}</b></div>
    </div></div>
    <div class="panel"><div class="panel-h">Participants <span class="cnt-b">${m.participants.length}</span></div>
      ${table([{h:'Agent',f:p=>`${esc(nm(p))}${p===m.chief?' '+tag('Chef de mission','t-info'):''}`},{h:'Fonction',f:p=>esc(AGENT[p].fn)},{h:'Structure',f:p=>esc(unitShort(AGENT[p].unit))}], m.participants.map(p=>({id:p})).map(o=>o.id))}
    </div>
    <div class="panel"><div class="panel-h">Historique</div><div class="list">${m.history.slice().reverse().map(h=>`<div class="li"><div class="bd"><b>${esc(h.what)}</b><span>${esc(h.who==='SYSTEM'?'Système':nm(h.who))}</span></div><span class="rt">${dtfr(h.at)}</span></div>`).join('')||'<div class="empty">Aucun événement</div>'}</div></div>
  </div>
  <div class="panel"><div class="panel-h">Circuit de validation</div><div class="pad">${m.steps.length?circuitHtml(m.steps):circuitHtml(planCircuit('MISSION_ORDER', m.initiator, {needsVehicle:m.needsVehicle}))+'<p class="muted" style="margin:12px 0 0">Aperçu : le circuit sera figé à la soumission.</p>'}</div></div>
  </div>`;
}
ACT.omSubmit = id => { const m = S.missions.find(x=>x.id===id); submitMission(m, S.me); commit('OM soumis : '+m.ref); };
ACT.omResubmit = id => { const m = S.missions.find(x=>x.id===id); resubmitMission(m, S.me); commit('Correction soumise'); };
ACT.omApprove = id => { const m = S.missions.find(x=>x.id===id); missionAct(m,'APPROVE',{}); commit('Étape validée'); };
ACT.omSigned = id => modal('Déposer l’OM signé', `<p style="margin:0">Le PDF signé est versé à la GED avec son empreinte. Les participants et le BCMS sont notifiés ; les réservations passent à « confirmées ».</p>
  <label class="f" for="sgf">Fichier signé<input class="inp" type="file" id="sgf" accept="application/pdf"><small>Dans la maquette, le fichier n’est pas conservé.</small></label>`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn pri" data-a="omApproveModal" data-x="${id}">Déposer</button>`);
ACT.omApproveModal = id => { closeModal(); ACT.omApprove(id); };
const commentModal = (title, act, id, label) => modal(title, `<label class="f" for="cmt">${label}<textarea class="inp" id="cmt" rows="3" required></textarea><small>Obligatoire : il est transmis au demandeur et figure dans la chronologie.</small></label>`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn pri" data-a="${act}" data-x="${id}">Confirmer</button>`);
ACT.omReturn = id => commentModal('Retourner pour correction','omReturnDo',id,'Ce qui doit être corrigé');
ACT.omReject = id => commentModal('Rejeter l’ordre de mission','omRejectDo',id,'Motif du rejet');
ACT.omReturnDo = id => { const c=val('cmt'); if(!c) return toast('Indiquez le motif.'); missionAct(S.missions.find(x=>x.id===id),'RETURN',{comment:c}); closeModal(); commit('Dossier retourné au demandeur'); };
ACT.omRejectDo = id => { const c=val('cmt'); if(!c) return toast('Indiquez le motif.'); missionAct(S.missions.find(x=>x.id===id),'REJECT',{comment:c}); closeModal(); commit('Ordre de mission rejeté'); };
function vehicleOk(v){ return v.situation!=='A_REFORMER' && v.situation!=='GARAGE' && v.situation!=='EN_REPARATION' && v.situation!=='REPARABLE' && v.cond!=='PANNE'; }
ACT.omAssign = id => {
  const m = S.missions.find(x=>x.id===id);
  const busy = p => S.missions.filter(x => x.id!==m.id && ['IN_APPROVAL','PENDING_SG_SIGNATURE','SIGNED'].includes(x.status) && !(x.from>m.to||x.to<m.from));
  const vb = new Set(busy().map(x=>x.vehicle)), db = new Set(busy().map(x=>x.driver));
  const vs = VEH.filter(vehicleOk), ds = AG.filter(a=>a.driver);
  modal('Affecter véhicule et chauffeur · '+m.ref, `
    <p class="muted" style="margin:0">Période : ${dfr(m.from)} au ${dfr(m.to)}. Les ressources déjà réservées sur la période restent proposées, marquées : le BCMS peut maintenir en connaissance de cause.</p>
    <div class="fg"><label class="f" for="av">Véhicule<select class="inp" id="av">${vs.map(v=>`<option value="${esc(v.plate)}" ${v.plate===m.vehicle?'selected':''}>${esc(v.plate)} · ${esc(v.label)}${vb.has(v.plate)?' · déjà réservé':''}</option>`).join('')}</select></label>
    <label class="f" for="ad">Chauffeur<select class="inp" id="ad">${ds.map(d=>`<option value="${d.id}" ${d.id===m.driver?'selected':''}>${esc(d.name)}${db.has(d.id)?' · déjà réservé':''}</option>`).join('')}</select></label></div>`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn pri" data-a="omAssignDo" data-x="${id}">Pré-réserver</button>`);
};
ACT.omAssignDo = id => { const m=S.missions.find(x=>x.id===id); m.vehicle=val('av'); m.driver=val('ad');
  missionHistory(m, S.me, 'Pré-réservation : '+m.vehicle+' avec '+nm(m.driver)); audit('BOOKING_PRE_RESERVED', m.ref, m.vehicle); closeModal();
  const c = missionConflicts(m); commit(c.length?'Pré-réservé, avec un conflit signalé':'Véhicule et chauffeur pré-réservés'); };
ACT.omFund = id => { const m=S.missions.find(x=>x.id===id); modal('Confirmer le financement · '+m.ref,
  `<label class="f" for="fs">Source de financement<select class="inp" id="fs">${FUNDING.map(f=>`<option value="${f[0]}" ${f[0]===m.funding?'selected':''}>${esc(f[1])}</option>`).join('')}</select></label>
   <div class="note">Frais de mission : le calcul appliquera le barème du décret n° 2012-735 dès que ses taux seront saisis dans le module Finances.</div>`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn pri" data-a="omFundDo" data-x="${id}">Confirmer</button>`); };
ACT.omFundDo = id => { const m=S.missions.find(x=>x.id===id); m.funding=val('fs'); missionHistory(m,S.me,'Financement confirmé : '+fundLabel(m.funding));
  S.engagements.push({id:uid('e'), mission:m.id, line:'MISSION', amount:null, at:TODAY, ex:m.ex}); audit('FUNDING_CONFIRMED', m.ref, m.funding); closeModal(); commit('Financement confirmé'); };

ACT.omNew = () => {
  const me = AGENT[S.me];
  modal('Nouvelle demande d’ordre de mission', `
  <div class="fg">
    <label class="f full" for="os">Objet de la mission<input class="inp" id="os" placeholder="Ex. Suivi des travaux de réalisation de forages"></label>
    <label class="f" for="od">Destination<input class="inp" id="od" placeholder="Ex. Banfora"></label>
    <label class="f" for="oo">Structure organisatrice<input class="inp" id="oo" value="${esc(unitName(me.unit))}"><small>Texte libre : peut être externe (TDR reçu).</small></label>
    <label class="f" for="of">Départ<input class="inp" type="date" id="of" value="${addDays(TODAY,7)}"></label>
    <label class="f" for="ot">Retour<input class="inp" type="date" id="ot" value="${addDays(TODAY,9)}"></label>
    <label class="f full" for="op">Autres participants<select class="inp" id="op" multiple size="5">${AG.filter(a=>!a.driver && a.id!==me.id).sort((a,b)=>a.unit===me.unit?-1:1).map(a=>`<option value="${a.id}">${esc(a.name)} · ${esc(a.unit)}</option>`).join('')}</select><small>Ctrl ou Cmd pour en choisir plusieurs.</small></label>
    <label class="chk full" for="ov"><input type="checkbox" id="ov" checked> Besoin d’un véhicule administratif</label>
    <label class="f full" for="otdr">Termes de référence (facultatif)<input class="inp" type="file" id="otdr"></label>
  </div>
  <div class="panel"><div class="panel-h">Circuit prévu pour vous</div><div class="pad">${circuitHtml(planCircuit('MISSION_ORDER', S.me, {needsVehicle:true}))}</div></div>`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn" data-a="omCreate" data-x="draft">Enregistrer le brouillon</button><button class="btn pri" data-a="omCreate" data-x="submit">Soumettre</button>`, true);
};
ACT.omCreate = mode => {
  const subject = val('os'), dest = val('od'), from = val('of'), to = val('ot');
  if(!subject || !dest) return toast('Objet et destination sont obligatoires.');
  if(to < from) return toast('La date de retour précède la date de départ.');
  const parts = [...document.getElementById('op').selectedOptions].map(o=>o.value);
  const f = document.getElementById('otdr').files[0];
  const m = createMission({subject, dest, from, to, orgEntity:val('oo'), initiator:S.me, chief:S.me, participants:[S.me,...parts], needsVehicle:val('ov'), tdr:f?f.name:''});
  missionHistory(m, S.me, 'Création');
  if(mode==='submit') submitMission(m, S.me);
  closeModal(); UI.sel.om = m.id; commit(mode==='submit'?'OM soumis : '+m.ref:'Brouillon enregistré');
};
ACT.omDoc = id => {
  const m = S.missions.find(x=>x.id===id); const d = S.docs.find(x=>x.subject===m.id && x.kind==='OM');
  modal('Acte · '+m.number, `<div class="doc">${officialHeader('')}
    <p style="text-align:right;margin-top:14px">N° <b>${esc(m.number)}</b></p>
    <h4>Ordre de mission</h4>
    <p>Le Directeur Général des Ressources en Eau et de l’Hydraulique ordonne aux agents ci-après désignés de se rendre en mission à <b>${esc(m.dest)}</b> du <b>${dfr(m.from)}</b> au <b>${dfr(m.to)}</b>.</p>
    <p><b>Objet :</b> ${esc(m.subject)}</p>
    <table><tr><th>Nom et prénom(s)</th><th>Matricule</th><th>Fonction</th></tr>${m.participants.map(p=>`<tr><td>${esc(nm(p))}</td><td>${esc(AGENT[p].mat)}</td><td>${esc(AGENT[p].fn)}</td></tr>`).join('')}</table>
    <p><b>Moyen de transport :</b> ${m.vehicle?'véhicule '+esc(m.vehicle)+', conduit par '+esc(nm(m.driver)):'—'}<br><b>Financement :</b> ${esc(fundLabel(m.funding))}</p>
    <p class="foot">Empreinte SHA-256 : ${esc(d?d.hash.slice(0,32)+'…':'')} · Code de vérification : ${esc(d?d.code:'')}</p></div>
    <p class="muted" style="margin:0">Rendu du gabarit DOCX « OM standard » (ADR-13). Le logo SIGA n’apparaît pas sur les actes.</p>`, '', true);
};

/* ---------------- Modification par le validateur (ADR-11 : mineur / substantiel) ---------------- */
const OM_FIELDS = [['subject','Objet','MINOR'],['dest','Destination','SUBSTANTIAL'],['from','Départ','SUBSTANTIAL'],['to','Retour','SUBSTANTIAL'],['orgEntity','Structure organisatrice','MINOR']];
ACT.omEdit = id => { const m = S.missions.find(x=>x.id===id);
  modal('Modifier le dossier · '+(m.number||m.ref), `
  <div class="note">Une correction mineure (objet, structure organisatrice) s’applique aussitôt, l’ancienne version reste consultable. Un changement de destination ou de dates exige l’accord du demandeur avant que le dossier reprenne son circuit.</div>
  <div class="fg">
    <label class="f full" for="e_subject">Objet<input class="inp" id="e_subject" value="${esc(m.subject)}"></label>
    <label class="f" for="e_dest">Destination<input class="inp" id="e_dest" value="${esc(m.dest)}"></label>
    <label class="f" for="e_orgEntity">Structure organisatrice<input class="inp" id="e_orgEntity" value="${esc(m.orgEntity||'')}"></label>
    <label class="f" for="e_from">Départ<input class="inp" type="date" id="e_from" value="${m.from}"></label>
    <label class="f" for="e_to">Retour<input class="inp" type="date" id="e_to" value="${m.to}"></label>
    <label class="f full" for="e_cmt">Motif de la modification<input class="inp" id="e_cmt" placeholder="Transmis au demandeur"></label>
  </div>`, `<button class="btn" data-a="closeModal">Annuler</button><button class="btn pri" data-a="omEditDo" data-x="${id}">Enregistrer</button>`, true); };
ACT.omEditDo = id => { const m = S.missions.find(x=>x.id===id);
  const changes = OM_FIELDS.map(([k,l,lvl]) => ({k, label:l, lvl, before:m[k]||'', after:val('e_'+k)})).filter(c => c.after!==c.before);
  if(!changes.length) return toast('Aucune modification.');
  if(val('e_to') < val('e_from')) return toast('La date de retour précède la date de départ.');
  const cmt = val('e_cmt');
  m.versions = m.versions || []; m.versions.push({at:nowIso(), by:S.me, snapshot:{subject:m.subject, dest:m.dest, from:m.from, to:m.to, orgEntity:m.orgEntity}});
  const minor = changes.filter(c=>c.lvl==='MINOR'), subst = changes.filter(c=>c.lvl==='SUBSTANTIAL');
  minor.forEach(c => { m[c.k] = c.after; });
  if(minor.length) missionHistory(m, S.me, 'Correction mineure : '+minor.map(c=>c.label+' « '+c.after+' »').join(', ')+(cmt?' ('+cmt+')':''));
  if(subst.length){
    m.pending = {changes:subst, by:S.me, at:nowIso(), comment:cmt}; m.status='PENDING_CONSENT';
    missionHistory(m, S.me, 'Modification proposée : '+subst.map(c=>c.label).join(', ')+' · accord du demandeur attendu');
    notify(m.initiator, 'Accord demandé sur votre OM '+(m.number||m.ref), subst.map(c=>c.label+' : '+c.after).join(' ; '), 'om');
  }
  audit(subst.length?'CONSENT_REQUESTED':'MINOR_CORRECTION', m.ref, changes.map(c=>c.k).join(','));
  closeModal(); commit(subst.length?'Modification envoyée au demandeur pour accord':'Correction enregistrée'); };
ACT.omConsent = x => { const [id, ok] = x.split(':'); const m = S.missions.find(q=>q.id===id); const p = m.pending;
  if(ok==='1'){ p.changes.forEach(c => { m[c.k] = c.after; }); missionHistory(m, S.me, 'Modifications acceptées : le dossier reprend à l’étape en cours');
    audit('CONSENT_ACCEPTED', m.ref, ''); }
  else { missionHistory(m, S.me, 'Modifications refusées : le dossier reprend sans elles'); audit('CONSENT_REFUSED', m.ref, ''); }
  notify(p.by, 'Réponse du demandeur · '+(m.number||m.ref), ok==='1'?'Modifications acceptées':'Modifications refusées', 'om', 'INFORMATION');
  m.pending = null; m.status = 'IN_APPROVAL'; commit(ok==='1'?'Modifications acceptées':'Modifications refusées'); };
