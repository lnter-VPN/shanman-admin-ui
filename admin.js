const TOKEN_KEY='shanman-admin-token';
const API_BASE_KEY='shanman-admin-api-base';
const isGitHubPages=location.hostname.endsWith('.github.io');
const configuredApiBase=String(globalThis.SHANMAN_API_BASE||'').trim();
const initialApiBase=localStorage.getItem(API_BASE_KEY)||configuredApiBase||(isGitHubPages?'':location.origin);
const state={token:sessionStorage.getItem(TOKEN_KEY)||'',user:null,page:'dashboard',apiBase:initialApiBase.replace(/\/$/,''),catalogSkills:[]};
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
 const label=type==='agents'?'智能体':'技能';
 const [data,skills]=type==='agents'?await Promise.all([api('/api/admin/agents'),api('/api/admin/skills')]):[await api('/api/admin/skills'),null];
 if(skills)state.catalogSkills=skills.items.filter((item)=>item.status!=='deleted');
 const builder=type==='agents'?`<section class="panel agent-builder-hero"><div><span class="eyebrow">AGENT BUILDER</span><h2>直接在网页制作智能体</h2><p>配置角色提示词、模型、独立工作区、文件与联网权限，并为它绑定专属技能。</p><div class="builder-points"><span>结构化配置</span><span>独立技能</span><span>版本管理</span><span>草稿 / 上架</span></div></div><button class="primary builder-create" type="button" data-action="create-agent">+  新建智能体</button></section>`:'';
 content.innerHTML=`${builder}<section class="panel"><div class="panel-head"><div><h2>${type==='agents'?'上传现有智能体包':'上传技能包'}</h2><p>保留包上传能力：支持最大 10MB 的 JSON 或 ZIP，manifest.version 必须递增</p></div></div>
 <form id="uploadForm" class="upload-form" data-type="${type}"><label class="field">选择安装包<input name="package" type="file" accept=".json,.zip,application/json,application/zip" required></label><button class="secondary" type="submit">上传为草稿</button></form></section>
 <section class="panel"><div class="panel-head"><div><h2>${label}列表</h2><p>${data.items.length} 项，只有已上架且有版本的内容会出现在客户市场</p></div></div>${productTable(data.items,type)}</section>`;
}
function productTable(items,type){
 if(!items.length)return empty('暂无内容，请先上传一个安装包');
 return `<div class="table-wrap"><table><thead><tr><th>名称</th><th>slug</th><th>${type==='agents'?'分类 / 技能':'类型'}</th><th>版本</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>${items.map((item)=>{const latest=item.latestVersion||item.latest_version;const updated=item.updatedAt||item.updated_at;const editAction=type==='agents'?'edit-agent':'edit-product';return `<tr><td><strong>${esc(item.name)}</strong><br><span class="subtle">${esc(item.summary||'无摘要')}</span></td><td class="mono">${esc(item.slug)}</td><td>${type==='agents'?`<span class="category-pill">${esc(item.category||'通用')}</span><br><span class="subtle">${(item.skills||[]).length} 个技能</span>`:'技能包'}</td><td>${esc(latest?.version||'—')}</td><td>${status(item.status)}</td><td>${date(updated)}</td><td><div class="actions"><button class="table-action" data-action="${editAction}" data-type="${type}" data-id="${item.id}"${type==='skills'?` data-name="${esc(item.name)}" data-summary="${esc(item.summary||'')}" data-description="${esc(item.description||'')}"`:''}>编辑</button>${type==='agents'?`<button class="table-action" data-action="clone-agent" data-id="${item.id}">复制</button>`:''}${item.status==='published'?`<button class="table-action" data-action="unpublish" data-type="${type}" data-id="${item.id}">下架</button>`:`<button class="table-action" data-action="publish" data-type="${type}" data-id="${item.id}">上架</button>`}<button class="table-action warn" data-action="delete-product" data-type="${type}" data-id="${item.id}">删除</button></div></td></tr>`}).join('')}</tbody></table></div>`;
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

function checked(value){return value?' checked':''}
function selected(value,current){return value===current?' selected':''}
function agentSkillSelector(selectedIds=[]){
 const active=new Set(selectedIds||[]);
 if(!state.catalogSkills.length)return '<div class="builder-empty">还没有可选技能。请先在“技能”页上传技能包。</div>';
 return `<div class="skill-picker">${state.catalogSkills.map((skill)=>{const version=skill.latestVersion||skill.latest_version;return `<label class="skill-option"><input type="checkbox" name="skillIds" value="${skill.id}"${checked(active.has(skill.id))}><span><strong>${esc(skill.name)}</strong><small>${esc(skill.summary||'无摘要')} · ${esc(version?.version||'无版本')}</small></span>${status(skill.status)}</label>`}).join('')}</div>`;
}

async function openAgentBuilder({id='',clone=false}={}){
 let agent={workspace:{}};
 if(id)agent=await api(`/api/admin/agents/${id}`);
 const latest=agent.latestVersion||agent.latest_version||agent.versions?.[0];
 const workspace=agent.workspace||{};
 const editing=Boolean(id&&!clone);
 const cloneSuffix=Date.now().toString().slice(-6);
 const slug=clone?`${String(agent.slug||'agent').slice(0,56).replace(/-+$/,'')}-${cloneSuffix}`:agent.slug||`agent-${cloneSuffix}`;
 const name=clone?`${agent.name||'智能体'} 副本`:agent.name||'';
 const version=clone?'1.0.0':latest?.version||'1.0.0';
 $('#dialogRoot').innerHTML=`<div class="dialog-backdrop agent-builder-backdrop"><div class="dialog agent-builder-dialog" role="dialog" aria-modal="true" aria-labelledby="agentBuilderTitle">
  <header class="builder-header"><div><span class="eyebrow">AGENT BUILDER</span><h2 id="agentBuilderTitle">${editing?'编辑智能体':clone?'复制智能体':'新建智能体'}</h2><p>设定它是谁、如何工作、可以使用哪些技能与工具。</p></div><button class="dialog-close" type="button" data-action="close-dialog" aria-label="关闭">×</button></header>
  <form id="agentBuilderForm" data-id="${editing?id:''}">
   <section class="builder-section"><div class="section-title"><span>01</span><div><h3>基础资料</h3><p>客户端智能体市场中展示的信息</p></div></div><div class="builder-grid three">
    <label class="field">名称<input name="name" maxlength="120" value="${esc(name)}" required placeholder="例：新媒体内容总监"></label>
    <label class="field">Slug<input name="slug" maxlength="64" pattern="[a-z0-9][a-z0-9-]*" value="${esc(slug)}" required placeholder="content-director"></label>
    <label class="field">分类<input name="category" maxlength="80" value="${esc(agent.category||'通用')}" placeholder="内容 / 运营 / 销售"></label>
    <label class="field">图标<input name="icon" maxlength="120" value="${esc(agent.icon||'bot')}" placeholder="bot"></label>
    <label class="field span-2">头像 URL<input name="avatar" maxlength="2048" value="${esc(agent.avatar||'')}" placeholder="https://... （可留空）"></label>
    <label class="field span-3">摘要<input name="summary" maxlength="500" value="${esc(agent.summary||'')}" placeholder="一句话说清它能解决什么问题"></label>
    <label class="field span-3">详细介绍<textarea name="description" rows="3" maxlength="50000" placeholder="介绍职责、适用场景与交付物">${esc(agent.description||'')}</textarea></label>
   </div></section>
   <section class="builder-section"><div class="section-title"><span>02</span><div><h3>角色与提示词</h3><p>定义智能体的行为边界和开场方式</p></div></div><div class="builder-grid">
    <label class="field span-2">系统提示词<textarea name="systemPrompt" rows="9" maxlength="200000" required placeholder="你是……\n\n职责：……\n工作流程：……\n输出标准：……">${esc(agent.systemPrompt||'')}</textarea></label>
    <label class="field span-2">欢迎语<textarea name="welcomeMessage" rows="3" maxlength="10000" placeholder="用户打开智能体时看到的第一句话">${esc(agent.welcomeMessage||'')}</textarea></label>
   </div></section>
   <section class="builder-section"><div class="section-title"><span>03</span><div><h3>默认模型</h3><p>客户端仍可在被允许时更换模型</p></div></div><div class="builder-grid three">
    <label class="field">提供方<input name="provider" maxlength="120" value="${esc(agent.provider||'')}" list="providerOptions" placeholder="openai-compatible"><datalist id="providerOptions"><option value="openai-compatible"><option value="deepseek"><option value="qwen"><option value="doubao"><option value="local"></datalist></label>
    <label class="field">模型 ID<input name="model" maxlength="160" value="${esc(agent.model||'')}" placeholder="例：deepseek-chat"></label>
    <label class="field">温度 <output id="temperatureValue">${Number(agent.temperature??0.7).toFixed(1)}</output><input name="temperature" type="range" min="0" max="2" step="0.1" value="${Number(agent.temperature??0.7)}"></label>
   </div></section>
   <section class="builder-section"><div class="section-title"><span>04</span><div><h3>独立工作区</h3><p>为这个智能体设定目标、文件目录、记忆和工具权限</p></div></div><div class="builder-grid">
    <label class="field span-2">工作目标<textarea name="workspaceGoal" rows="3" maxlength="20000" placeholder="它在这个工作区需要持续达成的目标">${esc(workspace.goal||'')}</textarea></label>
    <label class="field span-2">角色规则<textarea name="workspaceRoleRules" rows="4" maxlength="50000" placeholder="例：每次修改前先备份；交付文件必须放入指定目录">${esc(workspace.roleRules||'')}</textarea></label>
    <label class="field">默认交付目录<input name="outputDirectory" maxlength="500" value="${esc(workspace.outputDirectory||'outputs')}" placeholder="outputs"></label>
    <div class="permission-grid span-2">
     <label><input type="checkbox" name="memoryEnabled"${checked(workspace.memoryEnabled!==false)}><span><strong>启用长期记忆</strong><small>保留该智能体的独立工作记忆</small></span></label>
     <label><input type="checkbox" name="allowWeb"${checked(Boolean(workspace.allowWeb))}><span><strong>允许联网</strong><small>可以访问公网资料</small></span></label>
     <label><input type="checkbox" name="allowFiles"${checked(workspace.allowFiles!==false)}><span><strong>允许文件</strong><small>可以读写工作区文件</small></span></label>
     <label><input type="checkbox" name="allowTerminal"${checked(Boolean(workspace.allowTerminal))}><span><strong>允许终端</strong><small>高权限，仅在必要时开启</small></span></label>
    </div>
   </div></section>
   <section class="builder-section"><div class="section-title"><span>05</span><div><h3>专属技能</h3><p>勾选后技能将写入智能体配置，客户端安装时可按配置启用</p></div></div>${agentSkillSelector(agent.skillIds||[])}</section>
   <section class="builder-section compact"><div class="section-title"><span>06</span><div><h3>版本与发布</h3><p>新版本使用 x.y.z；草稿仅管理员可见</p></div></div><div class="builder-grid three">
    <label class="field">版本<input name="version" value="${esc(version)}" pattern="(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)" required></label>
    <label class="field">状态<select name="status"><option value="draft"${selected('draft',clone?'draft':agent.status||'draft')}>草稿</option><option value="unpublished"${selected('unpublished',agent.status)}>已下架</option><option value="published"${selected('published',agent.status)}>直接上架</option></select></label>
    <label class="field">版本说明<input name="changelog" maxlength="20000" placeholder="本次更新内容"></label>
   </div></section>
   <div class="dialog-actions sticky"><button class="secondary" type="button" data-action="close-dialog">取消</button><span class="save-hint">保存后会自动生成市场 manifest</span><button class="primary" type="submit">${editing?'保存智能体':'创建智能体'}</button></div>
  </form></div></div>`;
 const temperature=$('#agentBuilderForm input[name="temperature"]');temperature?.addEventListener('input',()=>{$('#temperatureValue').textContent=Number(temperature.value).toFixed(1)});
}

function normalizeApiBase(value){
 const raw=String(value||'').trim().replace(/\/$/,'');if(!raw)return '';
 let parsed;try{parsed=new URL(raw)}catch{throw new Error('请输入完整的后台地址，例如 https://api.example.com')}
 const local=['localhost','127.0.0.1','::1'].includes(parsed.hostname);
 if(parsed.protocol!=='https:'&&!(local&&parsed.protocol==='http:'))throw new Error('公网后台必须使用 HTTPS，避免管理员密码和令牌被窃取');
 return parsed.origin+parsed.pathname.replace(/\/$/,'');
}

const apiBaseField=$('#apiBaseField');const apiBaseInput=$('#apiBaseInput');
if(!state.apiBase)apiBaseField.hidden=false;
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

$('#dialogRoot').addEventListener('submit',async(event)=>{
 event.preventDefault();const form=event.target;const data=new FormData(form);
 try{
  if(form.id==='editProductForm'){
   await api(`/api/admin/${form.dataset.type}/${form.dataset.id}`,{method:'PATCH',body:JSON.stringify({name:data.get('name'),summary:data.get('summary'),description:data.get('description')})});
   $('#dialogRoot').innerHTML='';notice('保存成功');await navigate(form.dataset.type);return;
  }
  if(form.id==='agentBuilderForm'){
   const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
   const payload={
    name:data.get('name'),slug:data.get('slug'),category:data.get('category'),summary:data.get('summary'),description:data.get('description'),icon:data.get('icon'),avatar:data.get('avatar'),
    systemPrompt:data.get('systemPrompt'),welcomeMessage:data.get('welcomeMessage'),provider:data.get('provider'),model:data.get('model'),temperature:Number(data.get('temperature')),
    workspace:{goal:data.get('workspaceGoal'),roleRules:data.get('workspaceRoleRules'),outputDirectory:data.get('outputDirectory'),memoryEnabled:data.has('memoryEnabled'),allowWeb:data.has('allowWeb'),allowFiles:data.has('allowFiles'),allowTerminal:data.has('allowTerminal')},
    skillIds:data.getAll('skillIds'),version:data.get('version'),status:data.get('status'),changelog:data.get('changelog')
   };
   const id=form.dataset.id;await api(id?`/api/admin/agents/${id}`:'/api/admin/agents',{method:id?'PATCH':'POST',body:JSON.stringify(payload)});
   $('#dialogRoot').innerHTML='';notice(id?'智能体已保存':'智能体已创建');await navigate('agents');return;
  }
 }catch(error){const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=false;notice(error.message,true)}
});

document.addEventListener('click',async(event)=>{
 const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;
 if(action==='close-dialog'){$('#dialogRoot').innerHTML='';return}if(action==='edit-product'){editDialog(button);return}
 if(action==='create-agent'||action==='edit-agent'||action==='clone-agent'){
  try{await openAgentBuilder({id:button.dataset.id||'',clone:action==='clone-agent'})}catch(error){notice(error.message,true)}return;
 }
 if(action==='copy-license'){const value=button.previousElementSibling?.value||'';try{await navigator.clipboard.writeText(value);notice('已复制授权 Key')}catch{notice('复制失败，请手动复制',true)}return}
 try{
  if(action==='publish'||action==='unpublish'){await api(`/api/admin/${button.dataset.type}/${button.dataset.id}/${action}`,{method:'POST'});notice(action==='publish'?'已上架':'已下架');await navigate(button.dataset.type)}
  if(action==='delete-product'&&confirm('确定删除？该操作会软删除资源并从客户市场隐藏。')){await api(`/api/admin/${button.dataset.type}/${button.dataset.id}`,{method:'DELETE'});notice('已删除');await navigate(button.dataset.type)}
  if(action==='revoke-license'&&confirm('确定吊销这条授权？已激活设备后续将无法再次验证。')){await api(`/api/admin/licenses/${button.dataset.id}/revoke`,{method:'POST'});notice('授权已吊销');await navigate('users')}
 }catch(error){notice(error.message,true)}
});

(async()=>{if(!state.token)return showLogin();try{const data=await api('/api/me');if(data.user?.role!=='admin')throw new Error('不是管理员');state.user=data.user;showApp()}catch{logout()}})();
