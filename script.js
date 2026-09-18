const STORAGE_KEY = 'finanzasV5';
const THEME_KEY = 'finanzasV5-theme';
const DEFAULT_CATEGORIES = ['Alquiler','Comida','Servicios','Entretenimiento','Transporte','Salud','Educación','Compras','Otros'];
const fmt = new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0});
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const money = v => fmt.format(Number(v)||0);
const num = v => Number(String(v ?? '').replace(/\D/g,'')) || 0;
const today = () => new Date().toISOString().slice(0,10);
const monthKey = d => d.slice(0,7);
const currentMonthKey = () => $('month-picker').value;
let categoryChart, annualChart;

function defaults(){
  const now = new Date();
  return {accounts:[{id:'cash',name:'Efectivo',opening:0},{id:'bank',name:'Banco',opening:0},{id:'mp',name:'Mercado Pago',opening:0}],months:{},budgets:Object.fromEntries(DEFAULT_CATEGORIES.map(c=>[c,0])),settings:{}};
}
function load(){try{return {...defaults(),...JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}}catch{return defaults()}}
let app = load();
function ensureMonth(key){if(!app.months[key]) app.months[key]={baseIncome:0,savingsGoal:0,transactions:[]}; return app.months[key]}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(app)); $('save-status').textContent='Guardado automático · ahora'; setTimeout(()=>$('save-status').textContent='Guardado automático activo',900)}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let toastTimer=null, undoAction=null;
function showToast(message,{undo}={}){
  clearTimeout(toastTimer);
  $('toast-message').textContent=message;
  undoAction=undo||null;
  $('toast-undo').classList.toggle('hide',!undo);
  $('toast').classList.remove('hide');
  toastTimer=setTimeout(hideToast, undo?6000:3500);
}
function hideToast(){$('toast').classList.add('hide'); undoAction=null}
$('toast-undo').onclick=()=>{if(undoAction)undoAction(); hideToast()};

function showFormError(msg){const el=$('transaction-error'); el.textContent=msg; el.classList.remove('hide')}
function clearFormError(){$('transaction-error').classList.add('hide')}

function applyTheme(theme){
  document.documentElement.dataset.theme=theme;
  $('theme-toggle').textContent=theme==='light'?'☀':'🌙';
  $('theme-toggle').setAttribute('aria-label',theme==='light'?'Cambiar a tema oscuro':'Cambiar a tema claro');
}
function initTheme(){
  const stored=localStorage.getItem(THEME_KEY);
  const theme=stored||(window.matchMedia?.('(prefers-color-scheme: light)').matches?'light':'dark');
  applyTheme(theme);
}
$('theme-toggle').onclick=()=>{
  const next=document.documentElement.dataset.theme==='light'?'dark':'light';
  localStorage.setItem(THEME_KEY,next);
  applyTheme(next);
  renderCharts();
};

$('export-data').onclick=()=>{
  const blob=new Blob([JSON.stringify(app,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`finanzas-backup-${today()}.json`; a.click();
  URL.revokeObjectURL(url);
  showToast('Backup descargado.');
};
$('import-data').onclick=()=>$('import-file').click();
$('import-file').addEventListener('change',e=>{
  const file=e.target.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result);
      if(!data||typeof data!=='object'||!data.accounts||!data.months) throw new Error('formato inválido');
      if(!confirm('Esto reemplaza todos tus datos actuales por los del archivo. ¿Continuar?')){e.target.value='';return}
      app={...defaults(),...data};
      save(); initMonth();
      showToast('Datos importados correctamente.');
    }catch(err){
      showToast('El archivo no tiene un formato válido.');
    }
    e.target.value='';
  };
  reader.readAsText(file);
});

function initMonth(){ const d=new Date(); $('month-picker').value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; $('transaction-date').value=today(); loadMonth(); }
function loadMonth(){const m=ensureMonth(currentMonthKey()); $('base-income').value=m.baseIncome?moneyText(m.baseIncome):''; $('savings-goal').value=m.savingsGoal?moneyText(m.savingsGoal):''; const [y,mo]=currentMonthKey().split('-').map(Number); $('transaction-date').value=`${currentMonthKey()}-${String(Math.min(new Date().getDate(),new Date(y,mo,0).getDate())).padStart(2,'0')}`; renderAll();}
function moneyText(n){return '$'+Number(n||0).toLocaleString('es-AR')}
function formatInput(el){const v=num(el.value); el.value=v?moneyText(v):''}

document.addEventListener('input',e=>{if(e.target.classList.contains('currency-input'))formatInput(e.target)});

function monthTransactions(key=currentMonthKey()){return ensureMonth(key).transactions}
function totals(key=currentMonthKey()){
  const m=ensureMonth(key); let income=m.baseIncome||0, expenses=0;
  m.transactions.forEach(t=>{if(t.type==='income')income+=t.amount; if(t.type==='expense')expenses+=t.amount});
  return {income,expenses,balance:income-expenses,savingsRate:income?((income-expenses)/income)*100:0};
}
function accountBalance(id){let bal=(app.accounts.find(a=>a.id===id)?.opening)||0; Object.values(app.months).forEach(m=>(m.transactions||[]).forEach(t=>{if(t.type==='income'&&t.account===id)bal+=t.amount;if(t.type==='expense'&&t.account===id)bal-=t.amount;if(t.type==='transfer'){if(t.account===id)bal-=t.amount;if(t.toAccount===id)bal+=t.amount}})); return bal}
function expenseByCategory(key=currentMonthKey()){const out={};monthTransactions(key).filter(t=>t.type==='expense').forEach(t=>out[t.category]=(out[t.category]||0)+t.amount);return out}

function renderKPIs(){const t=totals();$('kpi-income').textContent=money(t.income);$('kpi-expenses').textContent=money(t.expenses);$('kpi-balance').textContent=money(t.balance);$('kpi-balance').className=t.balance<0?'amount-negative':'amount-positive';$('kpi-savings').textContent=`${Math.round(t.savingsRate)}%`;const goal=ensureMonth(currentMonthKey()).savingsGoal||0;if(goal){const pct=Math.max(0,Math.min(100,t.balance/goal*100));$('goal-progress').style.width=pct+'%';$('goal-text').textContent=`${money(Math.max(0,t.balance))} de ${money(goal)} · ${Math.round(pct)}%`;$('kpi-savings-note').textContent=`Meta ${money(goal)}`}else{$('goal-progress').style.width='0%';$('goal-text').textContent='Sin objetivo definido';$('kpi-savings-note').textContent='Objetivo no definido'}}
function renderAccounts(){const list=$('accounts-list');list.innerHTML=app.accounts.map(a=>`<article class="account-card"><div class="account-head"><strong>${esc(a.name)}</strong>${app.accounts.length>1?`<button class="mini-btn" data-delete-account="${a.id}" aria-label="Eliminar cuenta ${esc(a.name)}">Eliminar</button>`:''}</div><strong class="account-balance">${money(accountBalance(a.id))}</strong><div class="account-meta"><span>Saldo inicial ${money(a.opening)}</span><span>${movementCountForAccount(a.id)} mov.</span></div></article>`).join(''); const opts=app.accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join(''); $('transaction-account').innerHTML=opts;$('transaction-to-account').innerHTML=opts;$('filter-account').innerHTML='<option value="all">Todas las cuentas</option>'+opts}
function movementCountForAccount(id){let n=0;Object.values(app.months).forEach(m=>(m.transactions||[]).forEach(t=>{if(t.account===id||t.toAccount===id)n++}));return n}
function renderMovements(){const q=$('search-movements').value.toLowerCase(),type=$('filter-type').value,acc=$('filter-account').value;let arr=[...monthTransactions()].sort((a,b)=>b.date.localeCompare(a.date)||b.created-a.created);arr=arr.filter(t=>(type==='all'||t.type===type)&&(acc==='all'||t.account===acc||t.toAccount===acc)&&(`${t.description} ${t.category||''}`.toLowerCase().includes(q)));$('movement-count').textContent=`${arr.length} movimiento${arr.length===1?'':'s'}`;if(!arr.length){const noFilters=!q&&type==='all'&&acc==='all';$('movement-list').innerHTML=`<p class="empty-copy">${noFilters?'Todavía no cargaste movimientos este mes. Agregá el primero arriba ↑':'No encontramos movimientos con esos filtros.'}</p>`;return}$('movement-list').innerHTML=arr.map(t=>{const from=accountName(t.account),to=t.toAccount?accountName(t.toAccount):'';const sign=t.type==='income'?'+':t.type==='expense'?'−':'↔';const cls=t.type==='income'?'amount-positive':t.type==='expense'?'amount-negative':'amount-neutral';const meta=t.type==='transfer'?`${from} → ${to}`:`${t.category||'Ingreso'} · ${from}`;return `<article class="movement-item ${t.type}"><div class="movement-icon">${sign}</div><div class="movement-main"><strong>${esc(t.description)}</strong><small>${t.date.split('-').reverse().join('/')} · ${esc(meta)}${t.recurring?' · ♻':''}</small></div><div class="movement-side"><strong class="${cls}">${sign==='↔'?'':sign}${money(t.amount)}</strong><div class="movement-actions"><button class="mini-btn" data-edit="${t.id}" aria-label="Editar ${esc(t.description)}">Editar</button><button class="mini-btn" data-delete="${t.id}" aria-label="Eliminar ${esc(t.description)}">Eliminar</button></div></div></article>`}).join('')}
function accountName(id){return app.accounts.find(a=>a.id===id)?.name||'Cuenta'}
function budgetRowHTML(k){const spent=expenseByCategory();const limit=app.budgets[k]||0,use=spent[k]||0,pct=limit?Math.round(use/limit*100):0;return `<article class="budget-row ${limit&&use>limit?'budget-over':''}" data-budget-row="${esc(k)}"><div class="budget-head"><strong>${esc(k)}</strong><input class="currency-input budget-limit" data-budget="${esc(k)}" value="${limit?moneyText(limit):''}" placeholder="Sin límite" aria-label="Límite mensual para ${esc(k)}"></div><div class="budget-progress"><span style="width:${Math.min(pct,100)}%"></span></div><div class="budget-meta"><span>${money(use)} usados</span><span>${limit?`${pct}% de ${money(limit)}`:'Sin límite'} ${!DEFAULT_CATEGORIES.includes(k)?`· <button class="mini-btn" data-delete-budget="${esc(k)}" aria-label="Eliminar categoría ${esc(k)}">Eliminar</button>`:''}</span></div></article>`}
function renderBudgets(){const keys=Object.keys(app.budgets);$('budget-list').innerHTML=keys.map(budgetRowHTML).join(''); const categorySelect=$('transaction-category');const selected=categorySelect.value;categorySelect.innerHTML=keys.map(k=>`<option>${esc(k)}</option>`).join('');if(keys.includes(selected))categorySelect.value=selected}
function updateBudgetRow(key){const row=$('budget-list').querySelector(`[data-budget-row="${CSS.escape(key)}"]`);if(!row)return;const spent=expenseByCategory(),limit=app.budgets[key]||0,use=spent[key]||0,pct=limit?Math.round(use/limit*100):0;row.classList.toggle('budget-over',!!(limit&&use>limit));row.querySelector('.budget-progress span').style.width=Math.min(pct,100)+'%';row.querySelector('.budget-meta').innerHTML=`<span>${money(use)} usados</span><span>${limit?`${pct}% de ${money(limit)}`:'Sin límite'} ${!DEFAULT_CATEGORIES.includes(key)?`· <button class="mini-btn" data-delete-budget="${esc(key)}" aria-label="Eliminar categoría ${esc(key)}">Eliminar</button>`:''}</span>`}
function renderCharts(){const cats=expenseByCategory(),entries=Object.entries(cats).filter(([,v])=>v>0);$('category-empty').classList.toggle('hide',entries.length>0);$('category-chart').classList.toggle('hide',entries.length===0);$('category-breakdown').innerHTML=entries.map(([k,v])=>`<div class="category-row"><span>${esc(k)}</span><span>${money(v)} · ${Math.round(v/(totals().expenses||1)*100)}%</span></div>`).join('');if(categoryChart)categoryChart.destroy();if(window.Chart&&entries.length)categoryChart=new Chart($('category-chart'),{type:'doughnut',data:{labels:entries.map(x=>x[0]),datasets:[{data:entries.map(x=>x[1]),borderWidth:0}]},options:{animation:!prefersReducedMotion(),plugins:{legend:{display:false}},cutout:'70%',maintainAspectRatio:false}});renderAnnual()}
function renderAnnual(){const year=currentMonthKey().slice(0,4);$('annual-year').textContent=year;const months=Array.from({length:12},(_,i)=>`${year}-${String(i+1).padStart(2,'0')}`);const data=months.map(k=>totals(k));const ai=data.reduce((s,x)=>s+x.income,0),ae=data.reduce((s,x)=>s+x.expenses,0);$('annual-income').textContent=money(ai);$('annual-expenses').textContent=money(ae);$('annual-savings').textContent=money(ai-ae);$('annual-average').textContent=money(ae/12);let maxIdx=-1,max=-1;data.forEach((x,i)=>{if(x.expenses>max){max=x.expenses;maxIdx=i}});$('annual-highest').textContent=max>0?`${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][maxIdx]} · ${money(max)}`:'—';const catTotals={};months.forEach(k=>Object.entries(expenseByCategory(k)).forEach(([c,v])=>catTotals[c]=(catTotals[c]||0)+v));const top=Object.entries(catTotals).sort((a,b)=>b[1]-a[1])[0];$('annual-top-category').textContent=top?`${top[0]} · ${money(top[1])}`:'—';if(annualChart)annualChart.destroy();if(window.Chart)annualChart=new Chart($('annual-chart'),{type:'bar',data:{labels:['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],datasets:[{label:'Ingresos',data:data.map(x=>x.income)},{label:'Gastos',data:data.map(x=>x.expenses)}]},options:{animation:!prefersReducedMotion(),maintainAspectRatio:false,scales:{y:{beginAtZero:true}},plugins:{legend:{labels:{color:getComputedStyle(document.documentElement).getPropertyValue('--muted2').trim()}}}}})}
function renderComparison(){const [y,m]=currentMonthKey().split('-').map(Number);const d=new Date(y,m-2,1);const prev=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;if(!app.months[prev]){$('month-comparison').textContent='Sin datos del mes anterior';$('month-comparison').className='comparison-chip';return}const a=totals(),b=totals(prev),diff=a.expenses-b.expenses,pct=b.expenses?Math.round(Math.abs(diff)/b.expenses*100):0;$('month-comparison').textContent=diff===0?'Mismo gasto que el mes anterior':`${diff>0?'▲':'▼'} ${pct}% ${diff>0?'más':'menos'} gasto que el mes anterior`;$('month-comparison').className=`comparison-chip ${diff>0?'comparison-bad':'comparison-good'}`}
function renderAll(){renderKPIs();renderAccounts();renderMovements();renderBudgets();renderCharts();renderComparison()}

$('transaction-type').addEventListener('change',()=>{const tr=$('transaction-type').value==='transfer';$('category-field').classList.toggle('hide',tr);$('to-account-field').classList.toggle('hide',!tr);$('recurring-field').classList.toggle('hide',tr);$('account-label').textContent=tr?'Cuenta origen':'Cuenta'});
$('transaction-form').addEventListener('submit',e=>{e.preventDefault();clearFormError();const type=$('transaction-type').value,amount=num($('transaction-amount').value);if(!amount)return showFormError('Ingresá un monto válido.');if(type==='transfer'&&$('transaction-account').value===$('transaction-to-account').value)return showFormError('Elegí dos cuentas distintas.');const tx={id:$('editing-id').value||crypto.randomUUID(),type,date:$('transaction-date').value,description:$('transaction-description').value.trim(),amount,category:type==='transfer'?'':$('transaction-category').value,account:$('transaction-account').value,toAccount:type==='transfer'?$('transaction-to-account').value:'',recurring:type!=='transfer'&&$('transaction-recurring').checked,created:Date.now()};if(!tx.description)return showFormError('Ingresá una descripción.');const m=ensureMonth(monthKey(tx.date));const idx=m.transactions.findIndex(t=>t.id===tx.id);if(idx>=0)m.transactions[idx]=tx;else m.transactions.push(tx);save();resetTransactionForm();renderAll()});
function resetTransactionForm(){$('transaction-form').reset();$('editing-id').value='';$('transaction-date').value=today();$('save-transaction').textContent='Agregar movimiento';$('cancel-edit').classList.add('hide');clearFormError();$('transaction-type').dispatchEvent(new Event('change'))}
$('cancel-edit').onclick=resetTransactionForm;
$('movement-list').addEventListener('click',e=>{const id=e.target.dataset.delete||e.target.dataset.edit;if(!id)return;const tx=monthTransactions().find(t=>t.id===id);if(!tx)return;if(e.target.dataset.delete){const monthK=currentMonthKey();ensureMonth(monthK).transactions=monthTransactions().filter(t=>t.id!==id);save();renderAll();showToast(`"${tx.description}" eliminado.`,{undo:()=>{ensureMonth(monthK).transactions.push(tx);save();renderAll()}});return}$('editing-id').value=tx.id;$('transaction-type').value=tx.type;$('transaction-type').dispatchEvent(new Event('change'));$('transaction-date').value=tx.date;$('transaction-description').value=tx.description;$('transaction-amount').value=moneyText(tx.amount);$('transaction-category').value=tx.category;$('transaction-account').value=tx.account;$('transaction-to-account').value=tx.toAccount||app.accounts[0]?.id;$('transaction-recurring').checked=tx.recurring;$('save-transaction').textContent='Guardar cambios';$('cancel-edit').classList.remove('hide');$('transaction-form').scrollIntoView({behavior:'smooth'})});
['search-movements','filter-type','filter-account'].forEach(id=>$(id).addEventListener('input',renderMovements));
$('budget-list').addEventListener('input',e=>{if(e.target.dataset.budget){formatInput(e.target);app.budgets[e.target.dataset.budget]=num(e.target.value);save();updateBudgetRow(e.target.dataset.budget)}});
$('budget-list').addEventListener('click',e=>{const key=e.target.dataset.deleteBudget;if(!key)return;const value=app.budgets[key];delete app.budgets[key];save();renderAll();showToast(`Categoría "${key}" eliminada.`,{undo:()=>{app.budgets[key]=value;save();renderAll()}})});
$('add-account').onclick=()=>$('account-dialog').showModal();$('add-budget-category').onclick=()=>$('category-dialog').showModal();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('account-form').addEventListener('submit',e=>{e.preventDefault();const name=$('account-name').value.trim();if(!name)return;app.accounts.push({id:crypto.randomUUID(),name,opening:num($('account-opening').value)});$('account-form').reset();$('account-dialog').close();save();renderAll()});
$('category-form').addEventListener('submit',e=>{e.preventDefault();const name=$('category-name').value.trim();if(!name)return;app.budgets[name]=num($('category-limit').value);$('category-form').reset();$('category-dialog').close();save();renderAll()});
$('accounts-list').addEventListener('click',e=>{const id=e.target.dataset.deleteAccount;if(!id)return;const used=Object.values(app.months).some(m=>(m.transactions||[]).some(t=>t.account===id||t.toAccount===id));if(used)return showToast('No podés eliminar una cuenta que tiene movimientos.');const idx=app.accounts.findIndex(a=>a.id===id),removed=app.accounts[idx];app.accounts=app.accounts.filter(a=>a.id!==id);save();renderAll();showToast(`Cuenta "${removed.name}" eliminada.`,{undo:()=>{app.accounts.splice(idx,0,removed);save();renderAll()}})});
$('base-income').addEventListener('change',()=>{ensureMonth(currentMonthKey()).baseIncome=num($('base-income').value);save();renderAll()});$('savings-goal').addEventListener('change',()=>{ensureMonth(currentMonthKey()).savingsGoal=num($('savings-goal').value);save();renderAll()});
$('clear-month').onclick=()=>{const key=currentMonthKey(),removed=app.months[key];app.months[key]={baseIncome:0,savingsGoal:0,transactions:[]};save();loadMonth();showToast('Mes actual limpiado.',{undo:()=>{app.months[key]=removed;save();loadMonth()}})};
function shiftMonth(delta){const [y,m]=currentMonthKey().split('-').map(Number),d=new Date(y,m-1+delta,1);$('month-picker').value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;inheritRecurring();loadMonth()}
function inheritRecurring(){const key=currentMonthKey();if(app.months[key])return;const [y,m]=key.split('-').map(Number),d=new Date(y,m-2,1),prev=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;const inherited=(app.months[prev]?.transactions||[]).filter(t=>t.recurring&&t.type!=='transfer').map(t=>({...t,id:crypto.randomUUID(),date:`${key}-${t.date.slice(8,10)}`,created:Date.now()}));app.months[key]={baseIncome:app.months[prev]?.baseIncome||0,savingsGoal:app.months[prev]?.savingsGoal||0,transactions:inherited};save()}
$('prev-month').onclick=()=>shiftMonth(-1);$('next-month').onclick=()=>shiftMonth(1);$('month-picker').addEventListener('change',()=>{inheritRecurring();loadMonth()});

initTheme();
initMonth();
