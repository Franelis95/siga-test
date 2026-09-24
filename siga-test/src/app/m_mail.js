/* =====================================================================
   Module SECRÉTARIAT ET COURRIER
   ===================================================================== */
const MAIL_ST = {REGISTERED:['Enregistré','t-n'], AWAITING_IMPUTATION:['À imputer','t-gold'], IMPUTED:['Imputé','t-info'],
  IN_PROGRESS:['En traitement','t-info'], ANSWERED:['Répondu','t-ok'], CLOSED:['Classé','t-n'], ARCHIVED:['Archivé','t-n'],
  DRAFT:['Brouillon','t-n'], AWAITING_SIGNATURE:['À la signature','t-gold'], SIGNED:['Signé','t-info'], OUT_REGISTERED:['Enregistré au départ','t-ok'], SENT:['Expédié','t-ok']};
const mailTag = m => tag(...(MAIL_ST[m.status]||[m.status,'t-n']));
const INSTR = {ATTRIBUTION:'Pour attribution', SUITE:'Pour suite à donner', AVIS:'Pour avis', EXPLOITATION:'Pour exploitation',
  INFORMATION:'Pour information', DIFFUSION:'Pour diffusion', CLASSEMENT:'Pour classement', ENTRETIEN:'M’en parler'};
const CATS = {ORDINAIRE:'Ordinaire', INVITATION:'Invitation', FACTURE:'Facture', INTERNE:'Interne', AUTRE:'Autre'};
const REG_FMT = {ARRIVEE:n=>pad(n,4)+'/2026', DEPART:n=>pad(n,4)+'/DGREH/2026', BORDEREAU:n=>'BE-'+pad(n,4)+'/2026'};

function registerMail(p){
  const m = Object.assign({id:uid('c'), targets:[], assignments:[], history:[], ex:false, conf:false, cat:'ORDINAIRE', scan:false}, p);
  if(m.dir==='IN'){ const n = nextNum('ARRIVEE',2026); m.num = REG_FMT.ARRIVEE(n); m.status='REGISTERED'; m.registeredAt = m.registeredAt||nowIso(); }
  else { m.status = m.status||'DRAFT'; }
  S.mail.push(m); mailLog(m, p.by||S.me, m.dir==='IN'?'Enregistrement n° '+m.num:'Préparation du départ');
  audit(m.dir==='IN'?'MAIL_REGISTERED':'MAIL_DRAFTED', m.num||m.id, m.conf?'(confidentiel)':m.subject, p.by||S.me);
  return m;
}
function mailLog(m, who, what){ m.history.push({at:nowIso(), who, what}); }
/* Distribution hiérarchique : le chef compétent d'un agent est le chef de son unité (ou de la première unité ascendante qui en a un) */
const competentHead = agentId => { const u = ancestors(AGENT[agentId].unit).find(x=>x.head); return u ? u.code : null; };
function mailConcerned(m, me=S.me, headsOnly=false){
  if(m.imputedBy===me) return true;
  if(m.assignments.some(a=>a.to===me && a.status!=='CANCELLED')) return true;
  return m.targets.some(t => t.status!=='CANCELLED' && (canActForUnit(me, t.unit, 'MAIL_ASSIGN') || (!headsOnly && AGENT[me] && AGENT[me].unit===t.unit)));
}
function canReadMail(m, me=S.me){
  if(m.conf) return can('MAIL_READ_CONFIDENTIAL', me) || mailConcerned(m, me, true);
  return can('MAIL_READ_ALL', me) || can('MAIL_REGISTER', me) || mailConcerned(m, me) || (m.dir==='OUT' && AGENT[me] && m.unit===AGENT[me].unit);
}
const canSeeLine = m => canReadMail(m) || can('MAIL_REGISTER');
const subj = m => canReadMail(m) ? esc(m.subject) : '<i class="muted">Courrier confidentiel</i>';
function dueOf(m){ const a = m.assignments.find(x=>x.status==='OPEN'); const t = m.targets.find(x=>x.role==='LEAD' && x.status==='OPEN'); return (a&&a.due)||(t&&t.due)||m.due||null; }
const overdue = m => ['IMPUTED','IN_PROGRESS'].includes(m.status) && dueOf(m) && dueOf(m) < TODAY;

mod('courrier', {group:'Processus', label:'Courrier et secrétariat', icon:'mail', render(){
  if(UI.sel.mail) return mailDetail(S.mail.find(m=>m.id===UI.sel.mail));
  const tab = UI.tab.mail || 'IN';
  const lines = S.mail.filter(canSeeLine);
  const ins = lines.filter(m=>m.dir==='IN'), outs = lines.filter(m=>m.dir==='OUT');
  const toImpute = ins.filter(m=>m.status==='AWAITING_IMPUTATION');
  const toDistrib = ins.filter(m=>m.targets.some(t=>t.status==='OPEN' && canActForUnit(S.me,t.unit,'MAIL_ASSIGN') && !m.assignments.some(a=>a.target===t.id) && !m.targets.some(c=>c.parent===t.id)));
  const mineA = ins.filter(m=>m.assignments.some(a=>a.to===S.me && a.status==='OPEN'));
  let body = '';
  if(tab==='IN' || tab==='OUT'){
    const rows = (tab==='IN'?ins:outs).slice().sort((a,b)=>(b.num||'').localeCompare(a.num||''));
    body = `<div class="toolbar"><input class="inp" id="mq" placeholder="Filtrer par numéro, correspondant, objet" value="${esc(UI.q.mail||'')}" data-in="mailFilter" style="flex:1;max-width:360px">
      <span class="sp"></span>${can('MAIL_REGISTER')?(tab==='IN'?`<button class="btn pri" data-a="mailNew" data-x="IN">${ico('plus')}Enregistrer une arrivée</button>`:`<button class="btn pri" data-a="mailNew" data-x="OUT">${ico('plus')}Préparer un départ</button>`):''}</div>
    ${table([
      {h:'N°', f:m=>`<b class="mono">${esc(m.num||'—')}</b>${EX(m)}`},
      {h:tab==='IN'?'Reçu le':'Date', f:m=>dfr(m.received||m.sentOn||m.date)},
      {h:tab==='IN'?'Expéditeur':'Destinataire', f:m=>esc(m.corr)+(m.ref?`<span class="sub mono">${esc(m.ref)}</span>`:'')},
      {h:'Objet', f:m=>subj(m)+(m.conf?' '+tag('Confidentiel','t-bad'):'')},
      {h:'Suivi', f:m=>{ const t=m.targets.find(x=>x.role==='LEAD'&&x.status!=='CANCELLED'); const d=dueOf(m);
         return (t?esc(t.unit):'—')+(d?`<span class="sub">échéance ${dfr(d)}</span>`:''); }},
      {h:'Statut', f:m=>mailTag(m)+(overdue(m)?' '+tag('En retard','t-bad'):'')}
    ], rows.filter(m => !UI.q.mail || (m.num+' '+m.corr+' '+(canReadMail(m)?m.subject:'')).toLowerCase().includes(UI.q.mail.toLowerCase())), {click:'mailOpen', emptyTitle:'Registre vide'})}`;
  } else if(tab==='SLIP'){
    body = `<div class="toolbar"><span class="muted">Bordereaux d’envoi : numérotés à l’émission, lignes figées, accusé de réception.</span><span class="sp"></span>${can('SLIP_ISSUE')?`<button class="btn pri" data-a="slipNew">${ico('plus')}Nouveau bordereau</button>`:''}</div>`
    + table([{h:'N°',f:s=>`<b class="mono">${esc(s.num||'Brouillon')}</b>${EX(s)}`},{h:'Destinataire',f:s=>esc(s.to)},{h:'Pièces',f:s=>s.lines.map(l=>esc(l.d)+' ('+l.q+')').join('<br>')},
      {h:'Émis le',f:s=>dfr(s.issued)},{h:'Réception',f:s=>s.ack?`${dfr(s.ack)} · ${esc(s.ackBy)}`:(s.status==='ISSUED'&&can('SLIP_ISSUE')?`<button class="btn sm" data-a="slipAck" data-x="${s.id}">Enregistrer l’accusé</button>`:'—')},
      {h:'Statut',f:s=>tag({DRAFT:'Brouillon',ISSUED:'Émis',ACKNOWLEDGED:'Reçu'}[s.status], s.status==='ACKNOWLEDGED'?'t-ok':'t-info')}], S.slips);
  } else if(tab==='OM'){
    body = `<div class="toolbar"><span class="muted">Registre des OM : les actes numérotés eux-mêmes. Un seul numéro par OM, jamais de second compteur.</span></div>`
    + table([{h:'N° officiel',f:m=>`<b class="mono">${esc(m.number)}</b>${EX(m)}`},{h:'Objet',f:m=>esc(m.subject)},{h:'Période',f:m=>dfr(m.from)+' au '+dfr(m.to)},{h:'Statut',f:omTag}],
      S.missions.filter(m=>m.number), {click:'omFromReg'});
  } else {
    const notes = S.docs.filter(d=>d.kind==='NOTE');
    body = `<div class="toolbar"><span class="muted">Registre des notes de service, dont les notes d’intérim générées par SIGA.</span></div>`
    + table([{h:'N°',f:d=>`<b class="mono">${esc(d.number)}</b>${EX(d)}`},{h:'Objet',f:d=>esc(d.title)},{h:'Date',f:d=>dfr(d.at)},{h:'Statut',f:d=>tag(d.status,'t-info')}], notes, {emptyTitle:'Aucune note de service', empty:' Désignez un intérim dans le module Personnel pour en générer une.'});
  }
  return pageHead('Processus','Courrier et secrétariat',
    'Le secrétariat enregistre et numérote, le DG impute à des unités, chaque chef transmet vers le bas sans sauter de niveau. L’objet d’un pli confidentiel reste masqué pour qui n’est pas concerné.')
  + `<div class="kpis">${kpi('À imputer', toImpute.length, can('MAIL_IMPUTE')?'en attente de votre imputation':'remis au DG', toImpute.length?'warn':'')}
    ${kpi('À distribuer', toDistrib.length, 'destinés à mon unité', toDistrib.length?'warn':'')}
    ${kpi('Attribués à moi', mineA.length, 'à traiter')}
    ${kpi('En retard', ins.filter(overdue).length, 'échéance dépassée', ins.some(overdue)?'bad':'')}</div>
  <div class="panel"><div class="tabs">${[['IN','Arrivée',ins.length],['OUT','Départ',outs.length],['SLIP','Bordereaux',S.slips.length],['OM','Registre des OM',S.missions.filter(m=>m.number).length],['NOTES','Notes de service',S.docs.filter(d=>d.kind==='NOTE').length]]
    .map(([k,l,n])=>`<button class="${tab===k?'on':''}" data-a="tab" data-x="mail:${k}">${l} <span class="cnt-b">${n}</span></button>`).join('')}</div>${body}</div>`;
}});
INP.mailFilter = v => { UI.q.mail = v; rerender(); const i=$('#mq'); if(i){ i.focus(); i.setSelectionRange(v.length,v.length); } };
ACT.mailOpen = id => { UI.sel.mail = id; render(); window.scrollTo(0,0); };
ACT.mailBack = () => { UI.sel.mail = null; render(); };
ACT.omFromReg = id => { UI.sel.om = id; go('om'); };

function mailDetail(m){
  if(!m || !canSeeLine(m)){ UI.sel.mail=null; return MODS.courrier.render(); }
  const readable = canReadMail(m);
  let acts = '';
  if(m.dir==='IN'){
    if(m.status==='REGISTERED' && can('MAIL_REGISTER')){
      if(!m.scan && !m.conf) acts += `<button class="btn" data-a="mailScan" data-x="${m.id}">${ico('down')}Joindre le scan</button>`;
      acts += `<button class="btn pri" data-a="mailTransmit" data-x="${m.id}">${ico('send')}Remettre pour imputation</button>`;
    }
    if(['AWAITING_IMPUTATION','IMPUTED','IN_PROGRESS'].includes(m.status) && (can('MAIL_IMPUTE') || canActForUnit(S.me,'DGREH','MAIL_IMPUTE')))
      acts += `<button class="btn pri" data-a="mailImpute" data-x="${m.id}">${ico('flow')}${m.status==='AWAITING_IMPUTATION'?'Imputer':'Réimputer'}</button>`;
    if(['IMPUTED','IN_PROGRESS'].includes(m.status) && readable && (mailConcerned(m) ))
      acts += `<button class="btn" data-a="mailReply" data-x="${m.id}">Préparer la réponse</button>`;
    if(['IMPUTED','IN_PROGRESS','ANSWERED','REGISTERED'].includes(m.status) && (can('MAIL_ARCHIVE')||m.imputedBy===S.me))
      acts += `<button class="btn" data-a="mailClose" data-x="${m.id}">Classer</button>`;
    if(m.targets.length) acts += `<button class="btn" data-a="mailSlipView" data-x="${m.id}">${ico('doc')}Fiche d’imputation</button>`;
  } else {
    const secr = can('MAIL_REGISTER');
    if(m.status==='DRAFT') acts += `<button class="btn pri" data-a="mailOut" data-x="${m.id}:AWAITING_SIGNATURE">Présenter à la signature</button>`;
    if(m.status==='AWAITING_SIGNATURE' && (S.me===DG_ID||canActForUnit(S.me,'DGREH'))) acts += `<button class="btn pri" data-a="mailOut" data-x="${m.id}:SIGNED">Signer</button><button class="btn" data-a="mailOut" data-x="${m.id}:DRAFT">Retourner</button>`;
    if(m.status==='SIGNED' && secr) acts += `<button class="btn pri" data-a="mailOut" data-x="${m.id}:OUT_REGISTERED">Enregistrer au départ</button>`;
    if(m.status==='OUT_REGISTERED' && secr) acts += `<button class="btn pri" data-a="mailOut" data-x="${m.id}:SENT">Marquer expédié</button>`;
  }
  const tree = (parent, depth) => m.targets.filter(t=>(t.parent||null)===parent).map(t => {
    const as = m.assignments.filter(a=>a.target===t.id);
    const canDist = t.status==='OPEN' && canActForUnit(S.me, t.unit, 'MAIL_ASSIGN');
    return `<div style="margin-left:${depth*22}px;padding:9px 0;border-bottom:1px solid var(--line-2)">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>${esc(t.unit)}</b> <span class="muted">${esc(unitName(t.unit))}</span>
        ${tag(t.role==='LEAD'?'Pilote':'Copie', t.role==='LEAD'?'t-info':'t-n')} ${tag(INSTR[t.instr],'t-n')} ${t.due?`<span class="muted">échéance ${dfr(t.due)}</span>`:''}
        ${t.status!=='OPEN'?tag(t.status==='DONE'?'Traité':'Annulé','t-n'):''}
        ${canDist?`<span class="sp"></span><button class="btn sm" data-a="mailDistrib" data-x="${m.id}:${t.id}">Transmettre</button>`:''}</div>
      <div class="muted" style="font-size:12.5px">Chef compétent : ${esc(nm((actorOfUnit(t.unit)||{}).id))}</div>
      ${as.map(a=>`<div style="margin:6px 0 0 18px;font-size:13px">→ ${esc(nm(a.to))} · ${esc(INSTR[a.instr])} ${a.due?'· échéance '+dfr(a.due):''} · attribué par ${esc(nm(a.by))} ${tag(a.status==='OPEN'?'En cours':a.status==='DONE'?'Traité':'Annulé', a.status==='OPEN'?'t-gold':'t-n')}</div>`).join('')}
    </div>` + tree(t.id, depth+1);
  }).join('');
  const reply = m.replyId ? S.mail.find(x=>x.id===m.replyId) : null;
  return `<div><button class="btn ghost sm" data-a="mailBack">← Courrier</button></div>`
  + pageHead((m.dir==='IN'?'Arrivée':'Départ')+' · '+(m.num||'non numéroté'), readable?m.subject:'Courrier confidentiel',
      `${esc(m.corr)} · ${mailTag(m)} ${m.conf?tag('Confidentiel','t-bad'):''} ${overdue(m)?tag('En retard','t-bad'):''} ${EX(m)}`, acts)
  + (!readable?`<div class="note warn">Pli confidentiel : vous voyez la ligne du registre, pas son objet ni son scan. Seuls le DG, les chefs des unités destinataires et les agents attributaires y ont accès.</div>`:'')
  + `<div class="grid g21"><div class="grid">
    <div class="panel"><h2>Enregistrement</h2><div class="pad kv">
      <div><span>N° d’enregistrement</span><b class="mono">${esc(m.num||'Attribué à l’enregistrement')}</b></div>
      <div><span>${m.dir==='IN'?'Reçu le':'Date'}</span><b>${dfr(m.received||m.date)}</b></div>
      <div><span>Référence de la lettre</span><b class="mono">${esc(m.ref||'—')}</b></div>
      <div><span>Catégorie</span><b>${esc(CATS[m.cat])}</b></div>
      <div><span>Scan</span><b>${m.scan?'Joint · lecture par lien temporaire':m.conf?'Pli remis fermé':'Non joint'}</b></div>
      ${m.dir==='OUT'?`<div><span>Signataire</span><b>${esc(m.signer?nm(m.signer):'—')}</b></div><div><span>Service rédacteur</span><b>${esc(m.unit||'—')}</b></div>`:''}
      ${m.inReplyTo?`<div><span>En réponse à</span><b class="mono">${esc((S.mail.find(x=>x.id===m.inReplyTo)||{}).num)}</b></div>`:''}
      ${reply?`<div><span>Réponse</span><b class="mono">${esc(reply.num||'en préparation')}</b></div>`:''}
    </div></div>
    ${m.dir==='IN'?`<div class="panel"><div class="panel-h">Imputation et distribution ${m.imputedBy?`<span class="muted" style="font-weight:400">par ${esc(nm(m.imputedBy))}${m.impCap==='DELEGATE'?' (délégataire)':m.impCap==='INTERIM'?' (intérimaire)':''} le ${dtfr(m.imputedAt)}</span>`:''}</div>
      <div class="pad" style="padding-top:4px">${m.targets.length?tree(null,0):'<div class="empty"><b>Pas encore imputé</b>Le DG désigne une unité pilote et, s’il y a lieu, des unités en copie.</div>'}</div></div>`:''}
  </div>
  <div class="panel"><div class="panel-h">Chronologie</div><div class="list">${m.history.slice().reverse().map(h=>`<div class="li"><div class="bd"><b>${esc(h.what)}</b><span>${esc(h.who==='SYSTEM'?'Système':nm(h.who))}</span></div><span class="rt">${dtfr(h.at)}</span></div>`).join('')}</div></div></div>`;
}
ACT.mailScan = id => { const m=S.mail.find(x=>x.id===id); m.scan=true; mailLog(m,S.me,'Scan joint'); commit('Scan joint'); };
ACT.mailTransmit = id => { const m=S.mail.find(x=>x.id===id);
  if(!m.scan && !m.conf) return toast('Joignez le scan avant la remise pour imputation (pli confidentiel excepté).');
  m.status='AWAITING_IMPUTATION'; m.transmittedAt=nowIso(); mailLog(m,S.me,'Remis au DG pour imputation');
  notify(actorOfUnit('DGREH').id, 'Courrier à imputer : '+m.num, m.conf?'Pli confidentiel':m.subject, 'courrier'); commit('Remis pour imputation'); };
ACT.mailImpute = id => { const m=S.mail.find(x=>x.id===id);
  const opts = UNITS.filter(u=>u.code!=='DGREH');
  modal('Fiche d’imputation · '+m.num, `
    <p class="muted" style="margin:0">Une seule unité pilote, d’autres en copie. Chaque chef transmettra ensuite à ses agents.</p>
    <div class="tbl-w"><table class="t"><thead><tr><th>Unité</th><th>Rôle</th><th>Mention</th></tr></thead><tbody>
    ${opts.map(u=>`<tr><td><b>${u.code}</b><span class="sub">${esc(u.name)}</span></td>
      <td><select class="inp" id="ir_${u.code}"><option value="">—</option><option value="LEAD">Pilote</option><option value="COPY">Copie</option></select></td>
      <td><select class="inp" id="ii_${u.code}">${Object.entries(INSTR).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></td></tr>`).join('')}
    </tbody></table></div>
    <div class="fg"><label class="f" for="idue">Échéance de traitement<input class="inp" type="date" id="idue" value="${addDays(TODAY,10)}"></label>
    <label class="f" for="inote">Annotation<input class="inp" id="inote" placeholder="Ex. Préparer une réponse pour ma signature"></label></div>`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn pri" data-a="mailImputeDo" data-x="${id}">Imputer</button>`, true); };
ACT.mailImputeDo = id => {
  const m=S.mail.find(x=>x.id===id);
  const sel = UNITS.filter(u=>u.code!=='DGREH').map(u=>({unit:u.code, role:val('ir_'+u.code), instr:val('ii_'+u.code)})).filter(x=>x.role);
  if(!sel.length) return toast('Désignez au moins une unité.');
  if(sel.filter(x=>x.role==='LEAD').length!==1) return toast('Une et une seule unité pilote.');
  m.targets.forEach(t=>{ if(t.status==='OPEN') t.status='CANCELLED'; }); m.assignments.forEach(a=>{ if(a.status==='OPEN') a.status='CANCELLED'; });
  const due = val('idue');
  sel.forEach(x => m.targets.push({id:uid('t'), unit:x.unit, role:x.role, instr:x.instr, due:x.role==='LEAD'?due:null, parent:null, status:'OPEN'}));
  const ac = actorOfUnit('DGREH'); m.imputedBy=S.me; m.impCap = S.me===ac.id ? ac.cap : 'DELEGATE'; m.imputedAt=nowIso(); m.note=val('inote');
  m.status='IMPUTED'; mailLog(m,S.me,'Imputation : '+sel.map(x=>x.unit+(x.role==='LEAD'?' (pilote)':' (copie)')).join(', '));
  sel.forEach(x=>{ const h=actorOfUnit(x.unit); if(h) notify(h.id,'Courrier imputé à '+x.unit+' : '+m.num, m.conf?'Pli confidentiel':m.subject,'courrier'); });
  audit('MAIL_IMPUTED', m.num, sel.map(x=>x.unit).join(','));
  closeModal(); commit('Courrier imputé');
};
ACT.mailDistrib = x => { const [id,tid] = x.split(':'); const m=S.mail.find(q=>q.id===id); const t=m.targets.find(q=>q.id===tid);
  const policy = S.settings.mail_policy;
  const subUnits = UNITS.filter(u => u.parent===t.unit);
  const members = AG.filter(a => !a.driver && a.id!==S.me && (policy==='DIRECT' ? ancestors(a.unit).some(u=>u.code===t.unit) : competentHead(a.id)===t.unit));
  modal('Transmettre · '+m.num+' · '+t.unit, `
    <div class="note">${policy==='HIERARCHICAL'?'Distribution hiérarchique : vous atteignez les agents dont vous êtes le chef compétent, ou vous transmettez à une unité subordonnée qui distribuera à son tour.':'Paramètre DIRECT actif : vous atteignez tout agent de votre sous-arbre.'}</div>
    ${subUnits.length?`<label class="f" for="du">Transmettre à une unité subordonnée<select class="inp" id="du"><option value="">—</option>${subUnits.map(u=>`<option value="${u.code}">${u.code} · ${esc(u.name)}</option>`).join('')}</select></label>`:''}
    <label class="f" for="da">Attribuer à un agent<select class="inp" id="da"><option value="">—</option>${members.map(a=>`<option value="${a.id}">${esc(a.name)} · ${esc(a.job)}</option>`).join('')}</select></label>
    <div class="fg"><label class="f" for="di">Mention<select class="inp" id="di">${Object.entries(INSTR).map(([k,v])=>`<option value="${k}" ${k===t.instr?'selected':''}>${v}</option>`).join('')}</select></label>
    <label class="f" for="dd">Échéance<input class="inp" type="date" id="dd" value="${t.due||addDays(TODAY,7)}"></label></div>`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn pri" data-a="mailDistribDo" data-x="${x}">Transmettre</button>`); };
ACT.mailDistribDo = x => { const [id,tid]=x.split(':'); const m=S.mail.find(q=>q.id===id); const t=m.targets.find(q=>q.id===tid);
  const u=val('du'), a=val('da'); if(!u && !a) return toast('Choisissez une unité ou un agent.');
  if(u){ m.targets.push({id:uid('t'), unit:u, role:t.role, instr:val('di'), due:val('dd'), parent:t.id, status:'OPEN'}); mailLog(m,S.me,'Transmis à '+u); const h=actorOfUnit(u); if(h) notify(h.id,'Courrier transmis : '+m.num,'','courrier'); }
  if(a){ m.assignments.push({id:uid('a'), target:t.id, by:S.me, to:a, instr:val('di'), due:val('dd'), status:'OPEN', at:nowIso()}); if(m.status==='IMPUTED') m.status='IN_PROGRESS'; mailLog(m,S.me,'Attribué à '+nm(a)); notify(a,'Courrier attribué : '+m.num, m.conf?'Pli confidentiel':m.subject,'courrier'); }
  audit('MAIL_DISTRIBUTED', m.num, u||a); closeModal(); commit('Transmis'); };
ACT.mailReply = id => { const m=S.mail.find(x=>x.id===id);
  const r = registerMail({dir:'OUT', corr:m.corr, subject:'Réponse : '+m.subject, inReplyTo:m.id, unit:AGENT[S.me]?AGENT[S.me].unit:'', date:TODAY, conf:m.conf, ex:false});
  m.replyId = r.id; mailLog(m,S.me,'Réponse en préparation'); UI.sel.mail = r.id; commit('Réponse créée en brouillon'); };
ACT.mailOut = x => { const [id, st] = x.split(':'); const m=S.mail.find(q=>q.id===id);
  if(st==='SIGNED') m.signer=S.me;
  if(st==='OUT_REGISTERED'){ if(!m.scan && !m.conf){ m.scan=true; mailLog(m,S.me,'Lettre signée numérisée'); } m.num = REG_FMT.DEPART(nextNum('DEPART',2026)); m.date=TODAY;
    if(m.inReplyTo){ const src=S.mail.find(q=>q.id===m.inReplyTo); if(src && ['IMPUTED','IN_PROGRESS'].includes(src.status)){ src.status='ANSWERED'; src.assignments.forEach(a=>{ if(a.status==='OPEN'){ a.status='DONE'; }}); src.targets.forEach(t=>{ if(t.status==='OPEN') t.status='DONE'; }); mailLog(src,'SYSTEM','Réponse enregistrée sous le n° '+m.num); } } }
  if(st==='SENT') m.sentOn=TODAY;
  m.status=st; mailLog(m,S.me,{AWAITING_SIGNATURE:'Présenté à la signature',SIGNED:'Signé',DRAFT:'Retourné pour correction',OUT_REGISTERED:'Enregistré au départ sous le n° '+m.num,SENT:'Expédié'}[st]);
  audit('MAIL_'+st, m.num||m.id, ''); commit(MAIL_ST[st][0]); };
ACT.mailClose = id => modal('Classer le courrier', `<label class="f" for="cmt">Motif du classement<textarea class="inp" id="cmt" rows="2"></textarea></label>`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn pri" data-a="mailCloseDo" data-x="${id}">Classer</button>`);
ACT.mailCloseDo = id => { const c=val('cmt'); if(!c) return toast('Le motif du classement est obligatoire.'); const m=S.mail.find(x=>x.id===id); m.status='CLOSED'; m.closing=c; mailLog(m,S.me,'Classé : '+c); closeModal(); commit('Courrier classé'); };
ACT.mailNew = dir => modal(dir==='IN'?'Enregistrer une arrivée':'Préparer un départ', `<div class="fg">
  <label class="f full" for="mc">${dir==='IN'?'Expéditeur':'Destinataire'}<input class="inp" id="mc" placeholder="Ex. Office National de l’Eau et de l’Assainissement"></label>
  <label class="f" for="mr">Référence de la lettre<input class="inp" id="mr"></label>
  <label class="f" for="md">${dir==='IN'?'Reçu le':'Date'}<input class="inp" type="date" id="md" value="${TODAY}"></label>
  <label class="f full" for="ms">Objet<input class="inp" id="ms"></label>
  <label class="f" for="mk">Catégorie<select class="inp" id="mk">${Object.entries(CATS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
  <label class="chk" for="mconf"><input type="checkbox" id="mconf"> Pli confidentiel</label>
  ${dir==='IN'?`<label class="chk full" for="mscan"><input type="checkbox" id="mscan" checked> Scan joint</label>`:''}</div>
  ${dir==='IN'?`<p class="muted" style="margin:0">Le numéro d’arrivée est attribué à l’enregistrement, sans discontinuité (prochain : ${REG_FMT.ARRIVEE((S.counters['ARRIVEE|2026']||0)+1)}).</p>`:''}`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn pri" data-a="mailNewDo" data-x="${dir}">Enregistrer</button>`, true);
ACT.mailNewDo = dir => { const c=val('mc'), s=val('ms'); if(!c||!s) return toast('Correspondant et objet sont obligatoires.');
  const m = registerMail({dir, corr:c, ref:val('mr'), received:dir==='IN'?val('md'):null, date:val('md'), subject:s, cat:val('mk'), conf:val('mconf'), scan:dir==='IN'?val('mscan'):false, unit:AGENT[S.me]?AGENT[S.me].unit:''});
  closeModal(); UI.sel.mail=m.id; commit(dir==='IN'?'Arrivée enregistrée sous le n° '+m.num:'Départ préparé'); };
ACT.mailSlipView = id => { const m=S.mail.find(x=>x.id===id);
  modal('Fiche d’imputation · '+m.num, `<div class="doc">${officialHeader('Fiche d’imputation')}
    <p>Courrier arrivée n° <b>${esc(m.num)}</b> du ${dfr(m.received)} · Expéditeur : <b>${esc(m.corr)}</b></p>
    <p>Objet : ${canReadMail(m)?esc(m.subject):'<i>confidentiel</i>'}</p>
    <table><tr><th>Destinataire</th><th>Pilote / copie</th><th>Mention</th><th>Échéance</th></tr>
    ${m.targets.filter(t=>!t.parent).map(t=>`<tr><td>${esc(unitName(t.unit))}</td><td>${t.role==='LEAD'?'Pilote':'Copie'}</td><td>${esc(INSTR[t.instr])}</td><td>${dfr(t.due)}</td></tr>`).join('')}</table>
    <p>Annotation : ${esc(m.note||'—')}</p><p style="text-align:right">Le Directeur Général<br><br>${esc(nm(m.imputedBy))}</p></div>
    <p class="muted" style="margin:0">Mentions à caler sur la fiche d’imputation réellement utilisée par le Secrétariat.</p>`, '', true); };
ACT.slipNew = () => modal('Nouveau bordereau d’envoi', `<label class="f" for="sto">Destinataire<input class="inp" id="sto" placeholder="Ex. Secrétariat Général du Ministère"></label>
  <label class="f" for="sl">Pièces transmises, une par ligne<textarea class="inp" id="sl" rows="4" placeholder="Rapport d’activités du trimestre (2)"></textarea><small>Entre parenthèses : le nombre d’exemplaires.</small></label>`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn pri" data-a="slipNewDo">Émettre</button>`);
ACT.slipNewDo = () => { const to=val('sto'); const lines=val('sl').split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{ const mm=l.match(/\((\d+)\)\s*$/); return {d:l.replace(/\(\d+\)\s*$/,'').trim(), q:mm?Number(mm[1]):1}; });
  if(!to) return toast('Indiquez le destinataire.'); if(!lines.length) return toast('Un bordereau vide ne peut pas être émis.');
  const s={id:uid('s'), to, lines, status:'ISSUED', issued:TODAY, num:REG_FMT.BORDEREAU(nextNum('BORDEREAU',2026))}; S.slips.unshift(s); audit('SLIP_ISSUED', s.num, to); closeModal(); commit('Bordereau '+s.num+' émis'); };
ACT.slipAck = id => modal('Accusé de réception', `<div class="fg"><label class="f" for="ad1">Reçu le<input class="inp" type="date" id="ad1" value="${TODAY}"></label><label class="f" for="ad2">Nom du réceptionnaire<input class="inp" id="ad2"></label></div>`,
  `<button class="btn" data-a="closeModal">Annuler</button><button class="btn pri" data-a="slipAckDo" data-x="${id}">Enregistrer</button>`);
ACT.slipAckDo = id => { const n=val('ad2'); if(!n) return toast('Le nom du réceptionnaire est obligatoire.'); const s=S.slips.find(x=>x.id===id); s.ack=val('ad1'); s.ackBy=n; s.status='ACKNOWLEDGED'; closeModal(); commit('Accusé de réception enregistré'); };
