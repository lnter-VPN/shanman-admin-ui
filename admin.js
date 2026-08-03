const TOKEN_KEY='shanman-admin-token';
const API_BASE_KEY='shanman-admin-api-base';
const isGitHubPages=location.hostname.endsWith('.github.io');
const configuredApiBase=String(globalThis.SHANMAN_API_BASE||'').trim();
const initialApiBase=localStorage.getItem(API_BASE_KEY)||configuredApiBase||(isGitHubPages?'':location.origin);
const state={token:sessionStorage.getItem(TOKEN_KEY)||'',user:null,page:'dashboard',apiBase:initialApiBase.replace(/\/$/,''),catalogSkills:[],productFilters:{agents:'active',skills:'active'}};
const $=(selector)=>document.querySelector(selector);
const content=$('#content');
const pageMeta={dashboard:['OVERVIEW','平台概览'],agents:['AGENTS','智能体管理'],skills:['SKILLS','技能管理'],users:['USERS & LICENSES','用户与授权'],audit:['AUDIT & USAGE','操作与统计']};
const eventLabels={app_started:'客户端启动',agent_created:'创建智能体',agent_installed:'安装智能体',skill_enabled:'启用技能',skill_disabled:'停用技能',chat_completed:'对话成功',chat_failed:'对话失败',channel_connected:'手机通道连接',channel_failed:'手机通道失败'};
const statusLabels={draft:'草稿',published:'已上架',unpublished:'已下架',deleted:'已删除',active:'有效',revoked:'已吊销',expired:'已过期'};
const statusHints={draft:'仅后台可见',published:'客户端市场可见',unpublished:'客户端已隐藏',deleted:'已软删除',active:'当前可使用',revoked:'已停止使用',expired:'已过有效期'};

function esc(value=''){return String(value).replace(/[&<>'"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function date(value){if(!value)return '—';const parsed=new Date(value);return Number.isFinite(parsed.getTime())?parsed.toLocaleString('zh-CN'):'—'}
function status(value){return `<span class="status ${esc(value)}"><i></i>${esc(statusLabels[value]||value||'未知')}</span>`}
function statusBlock(value){return `<div class="status-block">${status(value)}<small>${esc(statusHints[value]||'状态未知')}</small></div>`}
function empty(text){return `<div class="empty">${esc(text)}</div>`}
function notice(message,isError=false){const el=$('#notice');el.textContent=message;el.hidden=!message;el.classList.toggle('error-note',isError);if(message)setTimeout(()=>{if(el.textContent===message)el.hidden=true},5000)}
function loading(){content.innerHTML='<div class="loading">正在加载…</div>'}

async function api(path,options={}){
 if(!state.apiBase)throw new Error('后台 API 尚未配置。GitHub Pages 只负责显示界面，请先填写 HTTPS 后台地址。');
 const headers={...(options.body instanceof FormData?{}:{'content-type':'application/json'}),...(state.token?{authorization:`Bearer ${state.token}`}:{}) ,...(options.headers||{})};
 const response=await fetch(`${state.apiBase}${path}`,{cache:'no-store',...options,headers});
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
 const [data,usage,audit]=await Promise.all([api('/api/admin/dashboard'),api('/api/admin/telemetry?days=30'),api('/api/admin/audit?limit=7')]);
 const max=Math.max(1,...usage.byEvent.map((item)=>item.count));
 content.innerHTML=`<section class="dashboard-hero"><div><span class="eyebrow">CONTROL CENTER</span><h2>欢迎回来，${esc(state.user?.username||'管理员')}</h2><p>在一个页面掌握内容上架、客户使用和服务运行情况。</p></div><div class="server-health"><i></i><span><strong>服务运行正常</strong><small>市场 API 已连接</small></span></div><div class="hero-actions"><button class="primary" data-action="dashboard-nav" data-page="agents">新建智能体</button><button class="secondary" data-action="dashboard-nav" data-page="skills">管理技能</button></div></section>
 <div class="stats dashboard-stats">
  ${statCard('注册用户',data.users,'累计平台注册','users')}${statCard('上架智能体',data.agents.published,`共 ${data.agents.total} 个管理中`,'agents')}${statCard('上架技能',data.skills.published,`共 ${data.skills.total} 个管理中`,'skills')}
  ${statCard('有效授权',data.activeLicenses,'当前可验证','licenses')}${statCard('24 小时事件',data.events24h,'客户端活动','events')}${statCard('30 天活跃端',data.installations30d,'去重安装量','devices')}
 </div>
 <div class="overview-grid"><section class="panel publication-panel"><div class="panel-head"><div><h2>内容发布概况</h2><p>状态变化会决定客户应用市场是否可见</p></div><span class="live-badge"><i></i>实时数据</span></div>
 ${publicationRow('智能体',data.agents,'agents')}${publicationRow('技能',data.skills,'skills')}
 <div class="sync-note"><span>↻</span><div><strong>客户端同步规则</strong><p>已上架内容会在客户打开或刷新市场时同步；草稿、下架和删除内容不会出现在市场。</p></div></div></section>
 <section class="panel activity-panel"><div class="panel-head"><div><h2>最近操作</h2><p>管理员最新变更记录</p></div><button class="text-action" data-action="dashboard-nav" data-page="audit">查看全部</button></div>${recentActivity(audit.items)}</section></div>
 <div class="overview-grid lower"><section class="panel"><div class="panel-head"><div><h2>近 30 天使用情况</h2><p>匿名聚合事件，不保存聊天正文或密钥</p></div></div>
 <div class="event-bars">${usage.byEvent.length?usage.byEvent.map((item)=>`<div class="event-row"><span>${esc(eventLabels[item.name]||item.name)}</span><div class="bar"><i style="width:${Math.max(3,item.count/max*100)}%"></i></div><strong>${item.count}</strong></div>`).join(''):empty('还没有客户端统计')}</div></section>
 <section class="panel quick-guide"><div class="panel-head"><div><h2>推荐发布流程</h2><p>避免未检查内容直接进入客户市场</p></div></div><ol><li><b>1</b><span><strong>创建为草稿</strong><small>补齐头像、介绍、提示词和技能</small></span></li><li><b>2</b><span><strong>本机检查测试</strong><small>确认角色行为和技能可用</small></span></li><li><b>3</b><span><strong>确认后上架</strong><small>客户刷新市场即可获取</small></span></li></ol></section></div>`;
}
function statCard(label,value,tip='',tone=''){return `<article class="stat ${esc(tone)}"><span class="stat-icon"></span><div><small>${esc(label)}</small><strong>${esc(value)}</strong>${tip?`<small>${esc(tip)}</small>`:''}</div></article>`}
function publicationRow(label,data,page){const total=Math.max(1,Number(data.total||0)+Number(data.deleted||0));const segment=(key)=>Math.max(0,Number(data[key]||0)/total*100);return `<div class="publication-row"><div class="publication-title"><strong>${esc(label)}</strong><button class="text-action" data-action="dashboard-nav" data-page="${page}">进入管理 →</button></div><div class="publication-counts"><span class="published"><b>${data.published||0}</b> 已上架</span><span class="draft"><b>${data.draft||0}</b> 草稿</span><span class="unpublished"><b>${data.unpublished||0}</b> 已下架</span><span class="deleted"><b>${data.deleted||0}</b> 已删除</span></div><div class="status-track"><i class="published" style="width:${segment('published')}%"></i><i class="draft" style="width:${segment('draft')}%"></i><i class="unpublished" style="width:${segment('unpublished')}%"></i><i class="deleted" style="width:${segment('deleted')}%"></i></div></div>`}
function recentActivity(items){if(!items?.length)return empty('还没有操作记录');return `<div class="activity-list">${items.map((item)=>`<div class="activity-item"><span class="activity-dot"></span><div><strong>${esc(actionLabel(item.action))}</strong><small>${esc(item.entity_type||'系统')} · ${date(item.created_at)}</small></div></div>`).join('')}</div>`}
function actionLabel(value=''){const action=String(value);if(action.includes('publish')&&!action.includes('unpublish'))return '内容已上架';if(action.includes('unpublish'))return '内容已下架';if(action.includes('delete'))return '内容已删除';if(action.includes('avatar'))return '上传智能体头像';if(action.includes('upload'))return '上传资源包';if(action.includes('create'))return '创建新资源';if(action.includes('update'))return '更新资源配置';return action||'后台操作'}

async function renderProducts(type){
 const label=type==='agents'?'智能体':'技能';
 const [data,skills]=type==='agents'?await Promise.all([api('/api/admin/agents'),api('/api/admin/skills')]):[await api('/api/admin/skills'),null];
 if(skills)state.catalogSkills=skills.items.filter((item)=>item.status!=='deleted');
 const filter=state.productFilters[type]||'active';const counts=countStatuses(data.items);const visible=data.items.filter((item)=>filter==='active'?item.status!=='deleted':item.status===filter);
 const builder=type==='agents'?`<section class="panel agent-builder-hero"><div><span class="eyebrow">AGENT BUILDER</span><h2>直接在网页制作智能体</h2><p>用更清晰的四步完成头像、角色、工作区和专属技能配置。</p><div class="builder-points"><span>真实头像</span><span>角色提示词</span><span>独立工作区</span><span>专属技能</span></div></div><button class="primary builder-create" type="button" data-action="create-agent">+  新建智能体</button></section>`:'';
 content.innerHTML=`${builder}<section class="panel"><div class="panel-head"><div><h2>${type==='agents'?'上传现有智能体包':'上传技能包'}</h2><p>保留包上传能力：支持最大 10MB 的 JSON 或 ZIP，manifest.version 必须递增</p></div></div>
 <form id="uploadForm" class="upload-form" data-type="${type}"><label class="field">选择安装包<input name="package" type="file" accept=".json,.zip,application/json,application/zip" required></label><button class="secondary" type="submit">上传为草稿</button></form></section>
 <section class="panel product-panel"><div class="panel-head"><div><h2>${label}列表</h2><p>状态与客户可见性已明确标注，删除项单独归档</p></div><div class="catalog-total"><strong>${data.items.length}</strong><small>全部${label}</small></div></div>${productSummary(counts)}${productFilters(type,filter,counts)}${productTable(visible,type)}</section>`;
}
function countStatuses(items){return items.reduce((result,item)=>{result[item.status]=(result[item.status]||0)+1;return result},{draft:0,published:0,unpublished:0,deleted:0})}
function productSummary(counts){return `<div class="product-summary"><div class="published"><i></i><span><strong>${counts.published}</strong><small>已上架 · 客户可见</small></span></div><div class="draft"><i></i><span><strong>${counts.draft}</strong><small>草稿 · 仅后台</small></span></div><div class="unpublished"><i></i><span><strong>${counts.unpublished}</strong><small>已下架 · 已隐藏</small></span></div><div class="deleted"><i></i><span><strong>${counts.deleted}</strong><small>回收站 · 可永久删除</small></span></div></div>`}
function productFilters(type,current,counts){return `<div class="product-filters"><button class="${current==='active'?'active':''}" data-action="filter-products" data-type="${type}" data-filter="active">管理中 <b>${counts.published+counts.draft+counts.unpublished}</b></button>${['published','draft','unpublished','deleted'].map((key)=>`<button class="${current===key?'active':''}" data-action="filter-products" data-type="${type}" data-filter="${key}">${statusLabels[key]} <b>${counts[key]}</b></button>`).join('')}</div>`}
function avatarUrl(value){const raw=String(value||'').trim();if(!raw)return '';if(/^https?:\/\//i.test(raw)||raw.startsWith('data:')||raw.startsWith('blob:'))return raw;return `${state.apiBase}${raw.startsWith('/')?'':'/'}${raw}`}
function productTable(items,type){
 if(!items.length)return empty('当前状态下暂无内容');
 return `<div class="table-wrap product-table"><table><thead><tr><th>名称</th><th>标识</th><th>${type==='agents'?'分类 / 技能':'类型'}</th><th>版本</th><th>发布状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>${items.map((item)=>{const latest=item.latestVersion||item.latest_version;const updated=item.updatedAt||item.updated_at;const editAction=type==='agents'?'edit-agent':'edit-product';const deleted=item.status==='deleted';const image=type==='agents'?avatarUrl(item.avatar):'';const identity=`data-type="${type}" data-id="${item.id}" data-name="${esc(item.name)}"`;return `<tr class="state-${esc(item.status)}"><td><div class="product-identity">${type==='agents'?`<span class="product-avatar">${image?`<img src="${esc(image)}" alt="">`:'AI'}</span>`:`<span class="skill-mark">S</span>`}<span><strong>${esc(item.name)}</strong><small>${esc(item.summary||'无摘要')}</small></span></div></td><td class="mono">${esc(item.slug)}</td><td>${type==='agents'?`<span class="category-pill">${esc(item.category||'通用')}</span><br><span class="subtle">${(item.skills||[]).length} 个技能</span>`:'技能包'}</td><td><b class="version-tag">v${esc(latest?.version||'—')}</b></td><td>${statusBlock(item.status)}</td><td>${date(updated)}</td><td>${deleted?`<div class="actions archived-actions"><span class="archived-label">已进入回收站</span><button class="table-action danger" data-action="permanent-delete" ${identity}>永久删除</button></div>`:`<div class="actions"><button class="table-action" data-action="${editAction}" ${identity}${type==='skills'?` data-summary="${esc(item.summary||'')}" data-description="${esc(item.description||'')}"`:''}>编辑</button>${type==='agents'?`<button class="table-action" data-action="clone-agent" data-id="${item.id}">复制</button>`:''}${item.status==='published'?`<button class="table-action amber" data-action="unpublish" ${identity}>下架</button>`:`<button class="table-action green" data-action="publish" ${identity}>上架</button>`}<button class="table-action warn" data-action="delete-product" ${identity}>移入回收站</button></div>`}</td></tr>`}).join('')}</tbody></table></div>`;
}

async function verifyProductState(type,id,expected){
 const [admin,market]=await Promise.all([api(`/api/admin/${type}/${id}`),api(`/api/marketplace/${type}`)]);
 if(admin.status!==expected)throw new Error(`服务器状态校验失败：期望 ${statusLabels[expected]||expected}，实际 ${statusLabels[admin.status]||admin.status}`);
 const visible=(market.items||[]).some((item)=>item.id===id);
 if(visible!==(expected==='published'))throw new Error(expected==='published'?'服务器已上架，但客户端市场尚未显示':'服务器状态已修改，但客户端市场仍可见');
 return admin;
}
async function verifyProductGone(type,id){
 const [admin,market]=await Promise.all([api(`/api/admin/${type}`),api(`/api/marketplace/${type}`)]);
 if((admin.items||[]).some((item)=>item.id===id)||(market.items||[]).some((item)=>item.id===id))throw new Error('永久删除校验失败，服务器仍返回该资源');
}

async function renderUsers(){
 const [users,licenses,capabilities]=await Promise.all([api('/api/admin/users'),api('/api/admin/licenses'),api('/api/admin/licenses/capabilities')]);
 content.innerHTML=`<section class="device-license-hero"><div><p class="eyebrow">DEVICE LICENSE CENTER</p><h2>设备码授权中心</h2><p>每台客户设备只保留一个当前有效 Key。重新生成时旧 Key 自动吊销，历史记录仍永久保存在 PostgreSQL。</p></div><div class="signer-state ${capabilities.canSign?'ready':'missing'}"><i></i><span><strong>${capabilities.canSign?'签名服务可用':'签名私钥未配置'}</strong><small>${capabilities.canSign?'设备专属 Key 可立即生成':'请先恢复服务器签名私钥'}</small></span></div></section>
 <div class="license-workspace"><section class="panel license-issue-panel"><div class="panel-head"><div><h2>生成设备专属 Key</h2><p>输入客户激活页显示的 32 位设备码</p></div><span class="step-chip">1 个设备 · 1 个有效 Key</span></div><form id="licenseForm" class="device-license-form">
 <label class="field machine-field">设备码<input id="licenseMachine" name="machine" minlength="32" maxlength="32" pattern="[A-Fa-f0-9]{32}" required placeholder="粘贴 32 位设备码" autocomplete="off" spellcheck="false"></label>
 <label class="field">客户 / 授权名称<input name="name" maxlength="200" required placeholder="例如：木子工作室"></label>
 <label class="field">关联用户<select name="userId"><option value="">不关联用户</option>${users.items.map((u)=>`<option value="${u.id}">${esc(u.username)} · ${esc(u.email)}</option>`).join('')}</select></label>
 <label class="field">授权期限<select name="validity"><option value="365">1 年</option><option value="1095">3 年</option><option value="3650">10 年</option><option value="permanent">永久</option></select></label>
 <button class="primary generate-key-button" type="submit"${capabilities.canSign?'':' disabled'}><span>＋</span>生成新的专属 Key</button></form><div id="licenseResult"></div></section>
 <section class="panel license-search-panel"><div class="panel-head"><div><h2>按设备码查询 Key</h2><p>可找回当前 Key，也可查看该设备的历史 Key</p></div></div><form id="licenseSearchForm" class="license-search-form"><input id="deviceLicenseSearch" name="machine" minlength="32" maxlength="32" pattern="[A-Fa-f0-9]{32}" required placeholder="输入完整的 32 位设备码" autocomplete="off" spellcheck="false"><button class="secondary" type="submit">查询设备</button></form><div id="licenseSearchResult" class="license-search-result"><div class="license-search-empty"><span>⌕</span><strong>输入设备码即可查询</strong><small>完整 Key 只向已登录管理员显示</small></div></div></section></div>
 <section class="panel"><div class="panel-head"><div><h2>设备授权记录</h2><p>Key 完整内容需通过设备码精确查询；吊销和替换记录不会丢失</p></div><span class="record-count">${licenses.items.length} 条记录</span></div>${licenseTable(licenses.items)}</section>
 <section class="panel"><div class="panel-head"><div><h2>平台用户</h2><p>不显示密码，使用统计仅为匿名事件计数</p></div></div>${userTable(users.items)}</section>`;
}
function userTable(items){if(!items.length)return empty('暂无用户');return `<div class="table-wrap"><table><thead><tr><th>用户</th><th>角色</th><th>授权数</th><th>使用事件</th><th>最近使用</th><th>注册时间</th></tr></thead><tbody>${items.map((u)=>`<tr><td><strong>${esc(u.username)}</strong><br><span class="subtle">${esc(u.email)}</span></td><td>${esc(u.role)}</td><td>${u.license_count}</td><td>${u.event_count}</td><td>${date(u.last_seen_at)}</td><td>${date(u.created_at)}</td></tr>`).join('')}</tbody></table></div>`}
function licenseTable(items){if(!items.length)return empty('暂无设备授权');return `<div class="table-wrap license-table"><table><thead><tr><th>客户</th><th>设备码</th><th>Key 前缀</th><th>状态</th><th>激活情况</th><th>到期</th><th>操作</th></tr></thead><tbody>${items.map((item)=>`<tr><td><strong>${esc(item.display_name||item.username||'未命名授权')}</strong><br><span class="subtle">${esc(item.username||item.email||'未关联用户')}</span></td><td><code class="machine-code">${esc(item.machine_fingerprint||'非绑定授权')}</code></td><td class="mono">${esc(item.license_key_prefix)}</td><td>${statusBlock(item.status)}</td><td>${item.activated_at?`<span class="activation-state used"><i></i>已激活</span><br><small class="subtle">${date(item.activated_at)}</small>`:'<span class="activation-state pending"><i></i>等待激活</span>'}</td><td>${item.expires_at?date(item.expires_at):'永久'}</td><td>${item.status==='active'?`<button class="table-action warn" data-action="revoke-license" data-id="${item.id}">吊销</button>`:'—'}</td></tr>`).join('')}</tbody></table></div>`}
function issuedLicenseCard(result){return `<div class="issued-license-card"><div class="issued-license-heading"><span>✓</span><div><strong>新的设备专属 Key 已生成</strong><small>已持久化到服务器，可随时按设备码找回</small></div></div><div class="issued-device"><span>设备码</span><code>${esc(result.machine_fingerprint||result.payload?.machine||'')}</code></div><div class="license-key-box"><textarea readonly spellcheck="false">${esc(result.licenseKey)}</textarea><button class="primary" data-action="copy-license" type="button">复制授权 Key</button></div></div>`}
function searchedLicenseCards(data){if(!data.items?.length)return `<div class="license-search-empty not-found"><span>!</span><strong>未找到该设备的授权</strong><small>请检查设备码，或在左侧为它生成新的 Key</small></div>`;return `<div class="device-query-head"><span>设备码</span><code>${esc(data.machine)}</code><b>${data.items.length} 条记录</b></div><div class="device-license-history">${data.items.map((item,index)=>`<article class="device-license-record ${index===0?'latest':''}"><header><div><strong>${esc(item.display_name||'设备授权')}</strong><small>${date(item.created_at)}</small></div>${status(item.status)}</header><div class="license-key-box"><textarea readonly spellcheck="false">${esc(item.licenseKey)}</textarea><button class="secondary" data-action="copy-license" type="button">复制 Key</button></div><footer><span>${item.activated_at?'已激活':'未激活'}</span><span>${item.expires_at?`到期 ${date(item.expires_at)}`:'永久授权'}</span>${index===0?'<b>最新</b>':''}</footer></article>`).join('')}</div>`}

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
 const avatar=clone?'':agent.avatar||'';const avatarPreview=avatarUrl(avatar);const currentStatus=clone?'draft':agent.status||'draft';
 $('#dialogRoot').innerHTML=`<div class="dialog-backdrop agent-builder-backdrop"><div class="dialog agent-builder-dialog" role="dialog" aria-modal="true" aria-labelledby="agentBuilderTitle">
  <header class="builder-header"><div><span class="eyebrow">AGENT BUILDER</span><h2 id="agentBuilderTitle">${editing?'编辑智能体':clone?'复制智能体':'新建智能体'}</h2><p>设定它是谁、如何工作、可以使用哪些技能与工具。</p></div><button class="dialog-close" type="button" data-action="close-dialog" aria-label="关闭">×</button></header>
  <form id="agentBuilderForm" data-id="${editing?id:''}">
   <section class="builder-section"><div class="section-title"><span>01</span><div><h3>形象与基本信息</h3><p>这些内容会直接展示在客户应用的智能体市场</p></div></div><div class="builder-profile">
    <div class="avatar-editor"><div class="avatar-preview${avatarPreview?' has-image':''}" id="avatarPreview">${avatarPreview?`<img src="${esc(avatarPreview)}" alt="智能体头像">`:'<span>AI</span>'}</div><input type="hidden" name="avatar" value="${esc(avatar)}"><input type="hidden" name="icon" value="${esc(agent.icon||'bot')}"><input class="avatar-file" id="avatarFile" name="avatarFile" type="file" accept="image/png,image/jpeg,image/webp"><label class="secondary avatar-upload-button" for="avatarFile">上传真实头像</label><small id="avatarUploadStatus">PNG / JPG / WEBP，最大 3MB</small></div>
    <div class="builder-grid three profile-fields">
     <label class="field">名称<input name="name" maxlength="120" value="${esc(name)}" required placeholder="例：新媒体内容总监"></label>
     <label class="field">唯一标识 Slug<input name="slug" maxlength="64" pattern="[a-z0-9][a-z0-9-]*" value="${esc(slug)}" required placeholder="content-director"></label>
     <label class="field">分类<input name="category" maxlength="80" value="${esc(agent.category||'通用')}" placeholder="内容 / 运营 / 销售"></label>
     <label class="field span-3">一句话简介<input name="summary" maxlength="500" value="${esc(agent.summary||'')}" placeholder="一句话说清它能解决什么问题"></label>
     <label class="field span-3">详细介绍<textarea name="description" rows="3" maxlength="50000" placeholder="介绍职责、适用场景与交付物">${esc(agent.description||'')}</textarea></label>
    </div>
   </div></section>
   <section class="builder-section"><div class="section-title"><span>02</span><div><h3>角色设定</h3><p>定义智能体的身份、工作方式和开场白</p></div></div><div class="builder-grid">
    <label class="field span-2">系统提示词<textarea name="systemPrompt" rows="9" maxlength="200000" required placeholder="你是……\n\n职责：……\n工作流程：……\n输出标准：……">${esc(agent.systemPrompt||'')}</textarea></label>
    <label class="field span-2">欢迎语<textarea name="welcomeMessage" rows="3" maxlength="10000" placeholder="用户打开智能体时看到的第一句话">${esc(agent.welcomeMessage||'')}</textarea></label>
   </div></section>
   <section class="builder-section"><div class="section-title"><span>03</span><div><h3>工作区与权限</h3><p>设定长期目标、交付目录、记忆和可用工具</p></div></div><div class="builder-grid">
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
   <section class="builder-section compact"><div class="section-title"><span>04</span><div><h3>技能与发布</h3><p>选择专属技能，并明确保存后的市场状态</p></div></div><div class="skill-subheading"><strong>专属技能</strong><small>勾选后写入智能体配置</small></div>${agentSkillSelector(agent.skillIds||[])}<div class="publish-settings"><div class="builder-grid"><label class="field">版本<input name="version" value="${esc(version)}" pattern="(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)" required></label><label class="field">版本说明<input name="changelog" maxlength="20000" placeholder="本次更新内容"></label></div><div><div class="skill-subheading"><strong>保存后状态</strong><small>“已上架”会立即对客户端可见</small></div><div class="publish-choices"><label class="draft"><input type="radio" name="status" value="draft"${checked(currentStatus==='draft')}><span><strong>保存为草稿</strong><small>仅后台可见，适合继续编辑</small></span></label><label class="unpublished"><input type="radio" name="status" value="unpublished"${checked(currentStatus==='unpublished')}><span><strong>保持下架</strong><small>客户端市场中隐藏</small></span></label><label class="published"><input type="radio" name="status" value="published"${checked(currentStatus==='published')}><span><strong>直接上架</strong><small>客户端刷新后可见</small></span></label></div></div></div></section>
   <div class="dialog-actions sticky"><button class="secondary" type="button" data-action="close-dialog">取消</button><span class="save-hint">保存后会自动生成市场 manifest</span><button class="primary" type="submit">${editing?'保存智能体':'创建智能体'}</button></div>
  </form></div></div>`;
 const avatarInput=$('#agentBuilderForm input[name="avatarFile"]');avatarInput?.addEventListener('change',async()=>{const file=avatarInput.files?.[0];if(!file)return;const statusEl=$('#avatarUploadStatus');const hidden=$('#agentBuilderForm input[name="avatar"]');const preview=$('#avatarPreview');if(file.size>3*1024*1024){avatarInput.value='';statusEl.textContent='图片超过 3MB，请压缩后重试';statusEl.classList.add('upload-error');return}if(!['image/png','image/jpeg','image/webp'].includes(file.type)){avatarInput.value='';statusEl.textContent='仅支持 PNG、JPG 或 WEBP';statusEl.classList.add('upload-error');return}statusEl.textContent='正在安全上传…';statusEl.classList.remove('upload-error');const body=new FormData();body.append('avatar',file);try{const result=await api('/api/admin/agents/avatar',{method:'POST',body});hidden.value=result.url;preview.classList.add('has-image');preview.innerHTML=`<img src="${esc(avatarUrl(result.url))}" alt="智能体头像">`;statusEl.textContent='头像已上传，保存智能体后生效';notice('头像上传成功')}catch(error){statusEl.textContent=error.message;statusEl.classList.add('upload-error');notice(error.message,true)}});
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
  if(form.id==='licenseForm'){const data=new FormData(form);const machine=String(data.get('machine')||'').trim().toLowerCase();const validity=String(data.get('validity')||'365');const payload={name:data.get('name'),userId:data.get('userId')||undefined,machine,...(validity==='permanent'?{permanent:true}:{days:Number(validity)})};const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;try{const result=await api('/api/admin/licenses',{method:'POST',body:JSON.stringify(payload)});$('#licenseResult').innerHTML=issuedLicenseCard(result);notice('设备专属 Key 已生成并保存到服务器')}finally{if(submit)submit.disabled=false}return}
  if(form.id==='licenseSearchForm'){const data=new FormData(form);const machine=String(data.get('machine')||'').trim().toLowerCase();const target=$('#licenseSearchResult');target.innerHTML='<div class="loading compact">正在查询设备授权…</div>';const result=await api(`/api/admin/licenses/device/${encodeURIComponent(machine)}`);target.innerHTML=searchedLicenseCards(result);return}
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
    systemPrompt:data.get('systemPrompt'),welcomeMessage:data.get('welcomeMessage'),
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
 if(action==='dashboard-nav'){void navigate(button.dataset.page);return}
 if(action==='filter-products'){state.productFilters[button.dataset.type]=button.dataset.filter;void navigate(button.dataset.type);return}
 if(action==='close-dialog'){$('#dialogRoot').innerHTML='';return}if(action==='edit-product'){editDialog(button);return}
 if(action==='create-agent'||action==='edit-agent'||action==='clone-agent'){
  try{await openAgentBuilder({id:button.dataset.id||'',clone:action==='clone-agent'})}catch(error){notice(error.message,true)}return;
 }
 if(action==='copy-license'){const value=button.closest('.license-key-box')?.querySelector('textarea')?.value||'';try{await navigator.clipboard.writeText(value);notice('已复制授权 Key')}catch{notice('复制失败，请手动复制',true)}return}
 try{
  if(action==='publish'||action==='unpublish'){
   const type=button.dataset.type;const id=button.dataset.id;const expected=action==='publish'?'published':'unpublished';
   if(action==='unpublish'&&!confirm(`确定下架“${button.dataset.name||'该资源'}”？下架后客户端市场会立即隐藏。`))return;
   const original=button.textContent;button.disabled=true;button.textContent='处理中…';
   try{const result=await api(`/api/admin/${type}/${id}/${action}`,{method:'POST'});await verifyProductState(type,id,expected);state.productFilters[type]=expected;const affected=Number(result.affectedAgents?.length||0);notice(action==='publish'?'已真实上架，客户端市场已确认可见':`已真实下架，客户端市场已确认隐藏${affected?`；同时下架 ${affected} 个依赖该技能的智能体`:''}`);await navigate(type)}finally{button.disabled=false;button.textContent=original}return;
  }
  if(action==='delete-product'){
   if(!confirm(`确定将“${button.dataset.name||'该资源'}”移入回收站？它会立即从客户端市场隐藏，之后仍可执行永久删除。`))return;
   const type=button.dataset.type;const id=button.dataset.id;const original=button.textContent;button.disabled=true;button.textContent='处理中…';
   try{const result=await api(`/api/admin/${type}/${id}`,{method:'DELETE'});await verifyProductState(type,id,'deleted');state.productFilters[type]='deleted';const affected=Number(result.affectedAgents?.length||0);notice(`已移入回收站并确认客户端不可见${affected?`；同时下架 ${affected} 个依赖该技能的智能体`:''}`);await navigate(type)}finally{button.disabled=false;button.textContent=original}return;
  }
  if(action==='permanent-delete'){
   if(!confirm(`永久删除“${button.dataset.name||'该资源'}”？数据库记录、全部版本和上传文件将被清除，且无法恢复。`))return;
   const type=button.dataset.type;const id=button.dataset.id;const original=button.textContent;button.disabled=true;button.textContent='永久删除中…';
   try{const result=await api(`/api/admin/${type}/${id}/permanent`,{method:'DELETE'});await verifyProductGone(type,id);state.productFilters[type]='deleted';notice(`已永久删除${result.removedVersions?`，同时清理 ${result.removedVersions} 个版本`:''}${result.cleanupWarnings?'；部分历史文件清理失败，请检查服务器日志':''}`,Boolean(result.cleanupWarnings));await navigate(type)}finally{button.disabled=false;button.textContent=original}return;
  }
  if(action==='revoke-license'&&confirm('确定吊销这条授权？已激活设备后续将无法再次验证。')){await api(`/api/admin/licenses/${button.dataset.id}/revoke`,{method:'POST'});notice('授权已吊销');await navigate('users')}
 }catch(error){notice(error.message,true)}
});

(async()=>{if(!state.token)return showLogin();try{const data=await api('/api/me');if(data.user?.role!=='admin')throw new Error('不是管理员');state.user=data.user;showApp()}catch{logout()}})();
