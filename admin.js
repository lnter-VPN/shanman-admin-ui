const TOKEN_KEY='shanman-admin-token';
const API_BASE_KEY='shanman-admin-api-base';
const isGitHubPages=location.hostname.endsWith('.github.io');
const configuredApiBase=String(globalThis.SHANMAN_API_BASE||'').trim();
const initialApiBase=localStorage.getItem(API_BASE_KEY)||configuredApiBase||(isGitHubPages?'':location.origin);
const state={token:sessionStorage.getItem(TOKEN_KEY)||'',user:null,page:'dashboard',apiBase:initialApiBase.replace(/\/$/,'')};
const $=(selector)=>document.querySelector(selector);
const content=$('#content');
const pageMeta={dashboard:['OVERVIEW','平台概览'],agents:['AGENTS','智能体管理'],skills:['SKILLS','技能管理'],users:['USERS & LICENSES','用户与授权'],audit:['AUDIT & USAGE','操作与统计']};
const eventLabels={app_started:'客户端启动',agent_created:'创建智能体',agent_installed:'安装智能体',skill_enabled:'启用技能',skill_disabled:'停用技能',chat_completed:'对话成功',chat_failed:'对话失败',channel_connected:'手机通道连接',channel_failed:'手机通道失败'};
const statusLabels={draft:'草稿',published:'已上架',unpublished:'已下架',deleted:'已删除',active:'有效',revoked:'已吊销',expired:'已过期'};

function esc(value=''){return String(value).replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function date(value){if(!value)return '—';const parsed=new Date(value);return Number.isFinite(parsed.getTime())?parsed.toLocaleString('zh-CN'):'—'}
function status(value){return `<span class="status ${esc(value)}">${esc(statusLabels[value]||value||'未知')}</span>`}
function empty(text){return `<div class="empty">${esc(text)}</div>`}
function notice(message,isError=false){const el=$('#notice');el.textContent=message;el.hidden=!message;el.classList.toggle('error-note',isError);if(message)setTimeout(()=>{if(el.textContent===message)el.hidden=true},5000)}
function loading(){content.innerHTML='<div class="loading">正在加载…</div>'}

async function api(path,options={}){
 if(!state.apiBase)throw new Error('后台 API 尚未配置。GitHub Pages 只负责显示界面，请先填写 HTTPS 后台地址。');
 const headers={...(options.body instanceof FormData?{}:{'content-type':'application/json'}),...(state.token?{authorization:`Bearer ${state.token}`}:{}) ,...(options.headers||{})};
 const response=await fetch(`${state.apiBase}${path}`,{...options,headers});
 const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={error:text}}
 if(response.status===401&&state.token){logout();throw new Error('登录已过期，请重新登录')}
 if(!response.ok)throw new Error(data.error||`请求失败（${response.status}）`);
 return data;
}

function showLogin(message=''){$('#appView').hidden=true;$('#loginView').hidden=false;$('#loginError').textContent=message}
function showApp(){$('#loginView').hidden=true;$('#appView').hidden=false;$('#adminIdentity').textContent=state.user?.username||state.user?.email||'管理员';void navigate(state.page)}
function logout(){state.token='';state.user=null;sessionStorage.removeItem(TOKEN_KEY);showLogin()}

async function navigate(page){
 state.page=page;const meta=pageMeta[page]||pageMeta.dashboard;$('#pageEyebrow').textContent=meta[0];$('#pageTitle').textContent=meta[1];
 document.querySelectorAll('#navigation button').forEach((button)=>button.classList.toggle('active',button.dataset.page===page));
 $('.sidebar').classList.remove('open');loading();
 try{if(page==='dashboard')await renderDashboard();else if(page==='agents'||page==='skills')await renderProducts(page);else if(page==='users')await renderUsers();else await renderAudit()}catch(error){content.innerHTML=empty(error.message);notice(error.message,true)}
}

async function renderDashboard(){
 const [data,usage]=await Promise.all([api('/api/admin/dashboard'),api('/api/admin/telemetry?days=30')]);
 const max=Math.max(1,...usage.byEvent.map((item)=>item.count));
 content.innerHTML=`<div class="stats">
  ${statCard('注册用户',data.users)}${statCard('智能体',`${data.agents.published}/${data.agents.total}`,'已上架 / 总数')}${statCard('技能',`${data.skills.published}/${data.skills.total}`,'已上架 / 总数')}
  ${statCard('有效授权',data.activeLicenses)}${statCard('24 小时事件',data.events24h)}${statCard('30 天活跃安装',data.installations30d)}
 </div><div class="two-column"><section class="panel"><div class="panel-head"><div><h2>近 30 天使用情况</h2><p>只展示匿名聚合事件，不保存聊天正文或密钥</p></div></div>
 <div class="event-bars">${usage.byEvent.length?usage.byEvent.map((item)=>`<div class="event-row"><span>${esc(eventLabels[item.name]||item.name)}</span><div class="bar"><i style="width:${Math.max(3,item.count/max*100)}%"></i></div><strong>${item.count}</strong></div>`).join(''):empty('还没有客户端统计')}</div></section>
 <section class="panel"><div class="panel-head"><div><h2>后台使用说明</h2><p>当前为单管理员基础版</p></div></div><p class="muted">在“智能体”或“技能”页面上传 JSON/ZIP 包，检查后再上架。客户客户端通过公开市场 API 获取已上架内容；草稿和已下架内容仅管理员可见。</p><p class="muted">正式交付请使用 HTTPS 域名，并定期备份 PostgreSQL 与上传目录。</p></section></div>`;
}
function statCard(label,value,tip=''){return `<article class="stat"><small>${esc(label)}</small><strong>${esc(value)}</strong>${tip?`<small>${esc(tip)}</small>`:''}</article>`}

async function renderProducts(type){
 const label=type==='agents'?'智能体':'技能';const data=await api(`/api/admin/${type}`);
 content.innerHTML=`<section class="panel"><div class="panel-head"><div><h2>上传${label}包</h2><p>支持最大 10MB 的 JSON 或 ZIP；包内 manifest.version 必须递增</p></div></div>
 <form id="uploadForm" class="upload-form" data-type="${type}"><label class="field">选择安装包<input name="package" type="file" accept=".json,.zip,application/json,application/zip" required></label><button class="primary" type="submit">上传为草稿</button></form></section>
 <section class="panel"><div class="panel-head"><div><h2>${label}列表</h2><p>${data.items.length} 项，只有已上架且有版本的内容会出现在客户市场</p></div></div>${productTable(data.items,type)}</section>`;
}
function productTable(items,type){
 if(!items.length)return empty('暂无内容，请先上传一个安装包');
 return `<div class="table-wrap"><table><thead><tr><th>名称</th><th>slug</th><th>版本</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>${items.map((item)=>`<tr><td><strong>${esc(item.name)}</strong><br><span class="subtle">${esc(item.summary||'无摘要')}</span></td><td class="mono">${esc(item.slug)}</td><td>${esc(item.latest_version?.version||'—')}</td><td>${status(item.status)}</td><td>${date(item.updated_at)}</td><td><div class="actions"><button class="table-action" data-action="edit-product" data-type="${type}" data-id="${item.id}" data-name="${esc(item.name)}" data-summary="${esc(item.summary||'')}" data-description="${esc(item.description||'')}">编辑</button>${item.status==='published'?`<button class="table-action" data-action="unpublish" data-type="${type}" data-id="${item.id}">下架</button>`:`<button class="table-action" data-action="publish" data-type="${type}" data-id="${item.id}">上架</button>`}<button class="table-action warn" data-action="delete-product" data-type="${type}" data-id="${item.id}">删除</button></div></td></tr>`).join('')}</tbody></table></div>`;
}

async function renderUsers(){
 const [users,licenses]=await Promise.all([api('/api/admin/users'),api('/api/admin/licenses')]);
 content.innerHTML=`<section class="panel"><div class="panel-head"><div><h2>签发授权</h2><p>授权 Key 只在签发成功后完整显示一次</p></div></div><form id="licenseForm" class="license-form">
 <label class="field">授权名称<input name="name" maxlength="200" required placeholder="例如：张三工作室"></label><label class="field">关联用户<select name="userId"><option value="">不关联</option>${users.items.map((u)=>`<option value="${u.id}">${esc(u.username)} · ${esc(u.email)}</option>`).join('')}</select></label>
 <label class="field">有效天数<input name="days" type="number" min="1" max="36500" value="365" required></label><label class="field">机器码（可选）<input name="machine" maxlength="64" placeholder="32 位机器码"></label><button class="primary" type="submit">签发授权</button></form><div id="licenseResult"></div></section>
 <section class="panel"><div class="panel-head"><div><h2>用户</h2><p>不显示密码，使用统计仅为事件计数</p></div></div>${userTable(users.items)}</section>
 <section class="panel"><div class="panel-head"><div><h2>授权记录</h2><p>完整 Key 不在列表中回显</p></div></div>${licenseTable(licenses.items)}</section>`;
}
function userTable(items){if(!items.length)return empty('暂无用户');return `<div class="table-wrap"><table><thead><tr><th>用户</th><th>角色</th><th>授权数</th><th>使用事件</th><th>最近使用</th><th>注册时间</th></tr></thead><tbody>${items.map((u)=>`<tr><td><strong>${esc(u.username)}</strong><br><span class="subtle">${esc(u.email)}</span></td><td>${esc(u.role)}</td><td>${u.license_count}</td><td>${u.event_count}</td><td>${date(u.last_seen_at)}</td><td>${date(u.created_at)}</td></tr>`).join('')}</tbody></table></div>`}
function licenseTable(items){if(!items.length)return empty('暂无授权');return `<div class="table-wrap"><table><thead><tr><th>Key 前缀</th><th>用户</th><th>状态</th><th>设备</th><th>到期</th><th>操作</th></tr></thead><tbody>${items.map((item)=>`<tr><td class="mono">${esc(item.license_key_prefix)}</td><td>${esc(item.username||item.email||'未关联')}</td><td>${status(item.status)}</td><td>${item.device_count}/${item.max_devices}</td><td>${item.expires_at?date(item.expires_at):'永久'}</td><td>${item.status==='active'?`<button class="table-action warn" data-action="revoke-license" data-id="${item.id}">吊销</button>`:'—'}</td></tr>`).join('')}</tbody></table></div>`}

async function renderAudit(){
 const [audit,usage]=await Promise.all([api('/api/admin/audit'),api('/api/admin/telemetry?days=30')]);const max=Math.max(1,...usage.byEvent.map((item)=>item.count));
 content.innerHTML=`<section class="panel"><div class="panel-head"><div><h2>匿名使用统计</h2><p>近 ${usage.days} 天，按事件类型聚合</p></div></div><div class="event-bars">${usage.byEvent.length?usage.byEvent.map((item)=>`<div class="event-row"><span>${esc(eventLabels[item.name]||item.name)}</span><div class="bar"><i style="width:${Math.max(3,item.count/max*100)}%"></i></div><strong>${item.count}</strong></div>`).join(''):empty('暂无统计')}</div></section>
 <section class="panel"><div class="panel-head"><div><h2>管理员操作日志</h2><p>最近 ${audit.items.length} 条</p></div></div>${auditTable(audit.items)}</section>`;
}
function auditTable(items){if(!items.length)return empty('暂无操作日志');return `<div class="table-wrap"><table><thead><tr><th>时间</th><th>管理员</th><th>操作</th><th>对象</th><th>摘要</th></tr></thead><tbody>${items.map((item)=>`<tr><td>${date(item.created_at)}</td><td>${esc(item.username||item.email||'系统')}</td><td class="mono">${esc(item.action)}</td><td>${esc(item.entity_type||'—')}</td><td class="subtle">${esc(JSON.stringify(item.metadata||{})).slice(0,180)}</td></tr>`).join('')}</tbody></table></div>`}

function editDialog(button){
 $('#dialogRoot').innerHTML=`<div class="dialog-backdrop"><div class="dialog" role="dialog" aria-modal="true"><h2>编辑资源</h2><form id="editProductForm" data-type="${button.dataset.type}" data-id="${button.dataset.id}"><label class="field">名称<input name="name" maxlength="120" value="${esc(button.dataset.name)}" required></label><label class="field">摘要<textarea name="summary" maxlength="500">${esc(button.dataset.summary)}</textarea></label><label class="field">说明<textarea name="description" rows="5" maxlength="50000">${esc(button.dataset.description)}</textarea></label><div class="dialog-actions"><button class="secondary" type="button" data-action="close-dialog">取消</button><button class="primary" type="submit">保存</button></div></form></div></div>`;
}

function normalizeApiBase(value){
 const raw=String(value||'').trim().replace(/\/$/,'');if(!raw)return '';
 let parsed;try{parsed=new URL(raw)}catch{throw new Error('请输入完整的后台地址，例如 https://api.example.com')}
 const local=['localhost','127.0.0.1','::1'].includes(parsed.hostname);
 if(parsed.protocol!=='https:'&&!(local&&parsed.protocol==='http:'))throw new Error('公网后台必须使用 HTTPS，避免管理员密码和令牌被窃取');
 return parsed.origin+parsed.pathname.replace(/\/$/,'');
}

const apiBaseField=$('#apiBaseField');const apiBaseInput=$('#apiBaseInput');const hostingHint=$('#hostingHint');
if(isGitHubPages||!state.apiBase){apiBaseField.hidden=false;hostingHint.hidden=false;hostingHint.textContent='当前界面由 GitHub Pages 免费托管。登录、上传和统计仍需连接独立的 HTTPS 后台服务。'}
apiBaseInput.value=state.apiBase;

$('#loginForm').addEventListener('submit',async(event)=>{event.preventDefault();$('#loginError').textContent='';const form=new FormData(event.currentTarget);try{const nextApiBase=normalizeApiBase(form.get('apiBase')||state.apiBase);if(nextApiBase!==state.apiBase){state.apiBase=nextApiBase;state.token='';sessionStorage.removeItem(TOKEN_KEY);if(nextApiBase)localStorage.setItem(API_BASE_KEY,nextApiBase);else localStorage.removeItem(API_BASE_KEY)}const data=await api('/api/auth/login',{method:'POST',body:JSON.stringify({identifier:form.get('identifier'),password:form.get('password')})});if(data.user?.role!=='admin')throw new Error('该账号不是管理员');state.token=data.token;state.user=data.user;sessionStorage.setItem(TOKEN_KEY,data.token);showApp()}catch(error){$('#loginError').textContent=error.message}});
$('#navigation').addEventListener('click',(event)=>{const button=event.target.closest('[data-page]');if(button)void navigate(button.dataset.page)});
$('#logoutButton').addEventListener('click',logout);$('#refreshButton').addEventListener('click',()=>void navigate(state.page));$('#menuButton').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));

content.addEventListener('submit',async(event)=>{
 event.preventDefault();const form=event.target;
 try{
  if(form.id==='uploadForm'){const body=new FormData();const file=form.elements.package.files[0];if(!file)throw new Error('请选择文件');body.append('package',file);await api(`/api/admin/${form.dataset.type}/upload`,{method:'POST',body});notice('上传成功，已保存为草稿');await navigate(form.dataset.type);return}
  if(form.id==='licenseForm'){const data=new FormData(form);const machine=String(data.get('machine')||'').trim();const payload={name:data.get('name'),userId:data.get('userId')||undefined,days:Number(data.get('days')),machine:machine||undefined,allowUnbound:!machine};const result=await api('/api/admin/licenses',{method:'POST',body:JSON.stringify(payload)});$('#licenseResult').innerHTML=`<div class="license-result"><strong>授权已签发，请立即复制并安全交付</strong><textarea readonly>${esc(result.licenseKey)}</textarea><button class="secondary" data-action="copy-license" type="button">复制授权 Key</button></div>`;notice('授权签发成功');return}
 }catch(error){notice(error.message,true)}
});

$('#dialogRoot').addEventListener('submit',async(event)=>{event.preventDefault();const form=event.target;if(form.id!=='editProductForm')return;const data=new FormData(form);try{await api(`/api/admin/${form.dataset.type}/${form.dataset.id}`,{method:'PATCH',body:JSON.stringify({name:data.get('name'),summary:data.get('summary'),description:data.get('description')})});$('#dialogRoot').innerHTML='';notice('保存成功');await navigate(form.dataset.type)}catch(error){notice(error.message,true)}});

document.addEventListener('click',async(event)=>{
 const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;
 if(action==='close-dialog'){$('#dialogRoot').innerHTML='';return}if(action==='edit-product'){editDialog(button);return}
 if(action==='copy-license'){const value=button.previousElementSibling?.value||'';try{await navigator.clipboard.writeText(value);notice('已复制授权 Key')}catch{notice('复制失败，请手动复制',true)}return}
 try{
  if(action==='publish'||action==='unpublish'){await api(`/api/admin/${button.dataset.type}/${button.dataset.id}/${action}`,{method:'POST'});notice(action==='publish'?'已上架':'已下架');await navigate(button.dataset.type)}
  if(action==='delete-product'&&confirm('确定删除？该操作会软删除资源并从客户市场隐藏。')){await api(`/api/admin/${button.dataset.type}/${button.dataset.id}`,{method:'DELETE'});notice('已删除');await navigate(button.dataset.type)}
  if(action==='revoke-license'&&confirm('确定吊销这条授权？已激活设备后续将无法再次验证。')){await api(`/api/admin/licenses/${button.dataset.id}/revoke`,{method:'POST'});notice('授权已吊销');await navigate('users')}
 }catch(error){notice(error.message,true)}
});

(async()=>{if(!state.token)return showLogin();try{const data=await api('/api/me');if(data.user?.role!=='admin')throw new Error('不是管理员');state.user=data.user;showApp()}catch{logout()}})();
