const TOKEN_KEY='shanman-admin-token';
const API_BASE_KEY='shanman-admin-api-base';
const isGitHubPages=location.hostname.endsWith('.github.io');
const configuredApiBase=String(globalThis.SHANMAN_API_BASE||'').trim();
const initialApiBase=localStorage.getItem(API_BASE_KEY)||configuredApiBase||(isGitHubPages?'':location.origin);
const state={token:sessionStorage.getItem(TOKEN_KEY)||'',user:null,page:'dashboard',apiBase:initialApiBase.replace(/\/$/,''),catalogSkills:[],productFilters:{agents:'active',skills:'active'}};
let loginCharacterScene;
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
 const hasBody=options.body!==undefined&&options.body!==null;
 const isFormData=hasBody&&options.body instanceof FormData;
 const headers={...(hasBody&&!isFormData?{'content-type':'application/json'}:{}),...(state.token?{authorization:`Bearer ${state.token}`}:{}) ,...(options.headers||{})};
 const response=await fetch(`${state.apiBase}${path}`,{cache:'no-store',...options,headers});
 const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{data={error:text}}
 if(response.status===401&&state.token){logout();throw new Error('登录已过期，请重新登录')}
 if(!response.ok)throw new Error(data.error||`请求失败（${response.status}）`);
 return data;
}

function showLogin(message=''){$('#appView').hidden=true;$('#loginView').hidden=false;$('#loginError').textContent=message;loginCharacterScene?.start()}
function showApp(){loginCharacterScene?.stop();$('#loginView').hidden=true;$('#appView').hidden=false;$('#adminIdentity').textContent=state.user?.username||state.user?.email||'管理员';void navigate(state.page)}
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
  const sourceNote=type==='skills'?`<section class="panel cloud-scope-note"><strong>这里管理的是云端技能</strong><p>客户端随安装包提供的平台内置技能不会出现在本表，也不会被后台上下架。即使名称相同，云端技能仍以独立产品 ID 安装和停用。</p></section>`:'';
  content.innerHTML=`${builder}${uploadPanel(type)}${sourceNote}
  <section class="panel product-panel"><div class="panel-head"><div><h2>${label}列表</h2><p>状态与客户可见性已明确标注，删除项单独归档</p></div><div class="catalog-total"><strong>${data.items.length}</strong><small>全部${label}</small></div></div>${productSummary(counts)}${productFilters(type,filter,counts)}${productTable(visible,type)}</section>`;
  bindUploadForm($('#uploadForm'));
 }

function uploadPanel(type){
  if(type==='agents')return `<section class="panel"><div class="panel-head"><div><h2>上传现有智能体包</h2><p>支持最大 10MB 的 JSON 或 ZIP，manifest.version 必须递增；上传后先保存为草稿。</p></div></div><form id="uploadForm" class="upload-form" data-type="agents"><label class="field">选择安装包<input name="package" type="file" accept=".json,.zip,application/json,application/zip" required></label><button class="secondary" type="submit">上传智能体包</button></form></section>`;
  return `<section class="panel skill-upload-panel"><div class="panel-head"><div><h2>上传技能</h2><p>可以直接选择技能文件夹，也可以继续上传 JSON / ZIP。文件夹至少要包含 <b>SKILL.md</b>，其他安全文件会一并打包保存。</p></div><span class="upload-limit">≤ 10 MB</span></div>
  <form id="uploadForm" class="skill-upload-form" data-type="skills">
   <div class="skill-upload-fields"><label class="field"><span>技能名称 <b>*</b></span><input name="skillName" maxlength="120" required placeholder="例如：小红书内容策划"></label><label class="field"><span>技能标识 <b>*</b></span><input name="skillSlug" maxlength="64" pattern="[a-z0-9][a-z0-9-]{0,63}" required placeholder="例如：xiaohongshu-content"></label><label class="field"><span>分类</span><input name="skillCategory" maxlength="30" placeholder="例如：内容创作"></label><label class="field"><span>版本 <b>*</b></span><input name="skillVersion" value="1.0.0" pattern="\\d+\\.\\d+\\.\\d+" required placeholder="1.0.0"></label><label class="field span-2"><span>一句话摘要</span><input name="skillSummary" maxlength="500" placeholder="告诉客户这个技能适合解决什么问题"></label><label class="field span-2"><span>技能说明</span><textarea name="skillDescription" rows="2" maxlength="50000" placeholder="可选，后台详情页展示"></textarea></label><label class="field span-2"><span>更新说明</span><input name="skillChangelog" maxlength="20000" placeholder="例如：首次发布"></label></div>
   <div class="skill-source-grid"><label class="skill-source-card folder-source"><span class="source-icon">⌁</span><span><strong>选择技能文件夹</strong><small>推荐：自动读取 SKILL.md 和 manifest.json</small></span><input id="skillFolder" name="folder" type="file" webkitdirectory directory multiple accept=".md,.json,.txt,.png,.jpg,.jpeg,.webp,.gif,.ico"></label><label class="skill-source-card package-source"><span class="source-icon">⇧</span><span><strong>选择 JSON / ZIP 包</strong><small>已有标准安装包可直接上传</small></span><input name="package" type="file" accept=".json,.zip,application/json,application/zip"></label></div>
   <p id="skillFolderMeta" class="skill-folder-meta">尚未选择文件夹。文件夹上传时，上面的名称、标识和发布选项会覆盖 manifest 对应字段。</p>
   <div class="skill-upload-footer"><div class="publish-mode"><strong>上传后状态</strong><label class="selected-draft"><input type="radio" name="publishMode" value="draft" checked><span><b>保存为草稿</b><small>仅管理员可见，确认后再上架</small></span></label><label class="selected-published"><input type="radio" name="publishMode" value="published"><span><b>上传后直接上架</b><small>完成校验后立即同步到客户端市场</small></span></label></div><button class="primary skill-upload-submit" type="submit">上传技能</button></div>
  </form></section>`;
}

function normalizeSkillSlug(value){
  const normalized=String(value||'').normalize('NFKD').replace(/[^\w\s-]/g,'').replace(/[\s_]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').toLowerCase().slice(0,64);
  return normalized||`skill-${Date.now().toString(36)}`;
}

function uploadRoot(files){
  const roots=[...files].map(file=>String(file.webkitRelativePath||'').split('/')[0]).filter(Boolean);
  return roots[0]||'';
}

function relativeUploadPath(file,root){
  let value=String(file.webkitRelativePath||file.name||'').replaceAll('\\','/').replace(/^\/+|\/+$/g,'');
  if(root&&value.startsWith(`${root}/`))value=value.slice(root.length+1);
  if(!value||value.split('/').some(part=>!part||part==='.'||part==='..'))throw new Error('技能文件夹包含无效路径');
  return value;
}

function crc32(bytes){
  if(!crc32.table){crc32.table=Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;return value>>>0})}
  let value=0xffffffff;for(const byte of bytes)value=crc32.table[(value^byte)&0xff]^(value>>>8);return (value^0xffffffff)>>>0;
}

function storedZip(entries){
  const encoder=new TextEncoder();const local=[];const central=[];let offset=0;const now=new Date();const dosTime=(now.getHours()<<11)|(now.getMinutes()<<5)|Math.floor(now.getSeconds()/2);const dosDate=((Math.max(1980,now.getFullYear())-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
  const u16=(view,at,value)=>view.setUint16(at,value,true);const u32=(view,at,value)=>view.setUint32(at,value>>>0,true);
  for(const entry of entries){const nameBytes=encoder.encode(entry.name);const data=entry.bytes;const checksum=crc32(data);const header=new Uint8Array(30+nameBytes.length);const view=new DataView(header.buffer);u32(view,0,0x04034b50);u16(view,4,20);u16(view,6,0x800);u16(view,8,0);u16(view,10,dosTime);u16(view,12,dosDate);u32(view,14,checksum);u32(view,18,data.length);u32(view,22,data.length);u16(view,26,nameBytes.length);u16(view,28,0);header.set(nameBytes,30);local.push(header,data);const record=new Uint8Array(46+nameBytes.length);const centralView=new DataView(record.buffer);u32(centralView,0,0x02014b50);u16(centralView,4,20);u16(centralView,6,20);u16(centralView,8,0x800);u16(centralView,10,0);u16(centralView,12,dosTime);u16(centralView,14,dosDate);u32(centralView,16,checksum);u32(centralView,20,data.length);u32(centralView,24,data.length);u16(centralView,28,nameBytes.length);u16(centralView,30,0);u16(centralView,32,0);u16(centralView,34,0);u16(centralView,36,0);u32(centralView,38,0);u32(centralView,42,offset);record.set(nameBytes,46);central.push(record);offset+=header.length+data.length}
  const centralSize=central.reduce((total,item)=>total+item.length,0);const end=new Uint8Array(22);const endView=new DataView(end.buffer);u32(endView,0,0x06054b50);u16(endView,4,0);u16(endView,6,0);u16(endView,8,entries.length);u16(endView,10,entries.length);u32(endView,12,centralSize);u32(endView,16,offset);return new Blob([...local,...central,end],{type:'application/zip'});
}

async function skillFolderPackage(form,files){
  if(!files.length)throw new Error('请选择技能文件夹');
  const root=uploadRoot(files);const getPath=file=>relativeUploadPath(file,root);const core=(name)=>files.filter(file=>getPath(file).split('/').pop().toLowerCase()===name).sort((a,b)=>getPath(a).split('/').length-getPath(b).split('/').length);
  const markdown=core('skill.md')[0];if(!markdown)throw new Error('技能文件夹中缺少 SKILL.md');
  const manifestFile=core('manifest.json')[0];let sourceManifest={};
  if(manifestFile){try{sourceManifest=JSON.parse(await manifestFile.text());if(!sourceManifest||typeof sourceManifest!=='object'||Array.isArray(sourceManifest))throw new Error()}catch{throw new Error('manifest.json 不是有效 JSON')}}
  const data=new FormData(form);const slug=normalizeSkillSlug(data.get('skillSlug'));const manifest={...sourceManifest,type:'skill',name:String(data.get('skillName')||'').trim(),slug,summary:String(data.get('skillSummary')||'').trim(),description:String(data.get('skillDescription')||'').trim(),category:String(data.get('skillCategory')||sourceManifest.category||'通用').trim(),version:String(data.get('skillVersion')||'1.0.0').trim(),changelog:String(data.get('skillChangelog')||'').trim()};
  if(!manifest.name)throw new Error('请填写技能名称');
  const entries=[{name:'manifest.json',bytes:new TextEncoder().encode(`${JSON.stringify(manifest,null,2)}\n`)},{name:'SKILL.md',bytes:new Uint8Array(await markdown.arrayBuffer())}];const seen=new Set(entries.map(entry=>entry.name.toLowerCase()));let total=entries.reduce((sum,entry)=>sum+entry.bytes.length,0);
  for(const file of files){const name=getPath(file);const lower=name.toLowerCase();const baseName=lower.split('/').pop();if(seen.has(lower)||['manifest.json','skill.md'].includes(baseName)||lower.endsWith('/'))continue;const bytes=new Uint8Array(await file.arrayBuffer());total+=bytes.length;if(total>10*1024*1024)throw new Error('技能文件夹打包后不能超过 10MB');entries.push({name,bytes});seen.add(lower)}
  const blob=storedZip(entries);if(blob.size>10*1024*1024)throw new Error('技能文件夹打包后不能超过 10MB');return new File([blob],`${slug}.zip`,{type:'application/zip'});
}

async function skillJsonPackage(form,file){
  if(!file.name.toLowerCase().endsWith('.json'))return file;
  try{const value=JSON.parse(await file.text());if(!value||typeof value!=='object'||!value.manifest)return file;const data=new FormData(form);const manifest={...value.manifest,type:'skill',name:String(data.get('skillName')||value.manifest.name||'').trim(),slug:normalizeSkillSlug(data.get('skillSlug')||value.manifest.slug),summary:String(data.get('skillSummary')||value.manifest.summary||'').trim(),description:String(data.get('skillDescription')||value.manifest.description||'').trim(),category:String(data.get('skillCategory')||value.manifest.category||'通用').trim(),version:String(data.get('skillVersion')||value.manifest.version||'1.0.0').trim(),changelog:String(data.get('skillChangelog')||value.manifest.changelog||'').trim()};return new File([JSON.stringify({...value,manifest})],`${manifest.slug}.json`,{type:'application/json'})}catch{throw new Error('JSON 技能包不是有效格式')}
}

function bindUploadForm(form){
  if(!form||form.dataset.type!=='skills')return;const folder=form.elements.folder;const name=form.elements.skillName;const slug=form.elements.skillSlug;const meta=form.querySelector('#skillFolderMeta');
  name.addEventListener('input',()=>{name.dataset.auto='false'});slug.addEventListener('input',()=>{slug.dataset.auto='false'});
  folder.addEventListener('change',()=>{const files=[...folder.files];const root=uploadRoot(files);if(root&&!name.value){name.value=root;name.dataset.auto='true'}if(root&&(!slug.value||slug.dataset.auto==='true')){slug.value=normalizeSkillSlug(root);slug.dataset.auto='true'}meta.textContent=files.length?`已选择“${root||'技能文件夹'}”，共 ${files.length} 个文件；提交时会自动打包并校验 SKILL.md。`:'尚未选择文件夹。文件夹上传时，上面的名称、标识和发布选项会覆盖 manifest 对应字段。'});
}
function countStatuses(items){return items.reduce((result,item)=>{result[item.status]=(result[item.status]||0)+1;return result},{draft:0,published:0,unpublished:0,deleted:0})}
function productSummary(counts){return `<div class="product-summary"><div class="published"><i></i><span><strong>${counts.published}</strong><small>已上架 · 客户可见</small></span></div><div class="draft"><i></i><span><strong>${counts.draft}</strong><small>草稿 · 仅后台</small></span></div><div class="unpublished"><i></i><span><strong>${counts.unpublished}</strong><small>已下架 · 已隐藏</small></span></div><div class="deleted"><i></i><span><strong>${counts.deleted}</strong><small>历史删除 · 待清理</small></span></div></div>`}
function productFilters(type,current,counts){return `<div class="product-filters"><button class="${current==='active'?'active':''}" data-action="filter-products" data-type="${type}" data-filter="active">管理中 <b>${counts.published+counts.draft+counts.unpublished}</b></button>${['published','draft','unpublished','deleted'].map((key)=>`<button class="${current===key?'active':''}" data-action="filter-products" data-type="${type}" data-filter="${key}">${statusLabels[key]} <b>${counts[key]}</b></button>`).join('')}</div>`}
function avatarUrl(value){const raw=String(value||'').trim();if(!raw)return '';if(/^https?:\/\//i.test(raw)||raw.startsWith('data:')||raw.startsWith('blob:'))return raw;return `${state.apiBase}${raw.startsWith('/')?'':'/'}${raw}`}
function productTable(items,type){
 if(!items.length)return empty('当前状态下暂无内容');
  return `<div class="table-wrap product-table"><table><thead><tr><th>名称</th><th>标识</th><th>${type==='agents'?'分类 / 技能':'来源'}</th><th>版本</th><th>发布状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>${items.map((item)=>{const latest=item.latestVersion||item.latest_version;const updated=item.updatedAt||item.updated_at;const editAction=type==='agents'?'edit-agent':'edit-product';const deleted=item.status==='deleted';const image=type==='agents'?avatarUrl(item.avatar):'';const identity=`data-type="${type}" data-id="${item.id}" data-name="${esc(item.name)}" data-slug="${esc(item.slug)}"`;return `<tr class="state-${esc(item.status)}"><td><div class="product-identity">${type==='agents'?`<span class="product-avatar">${image?`<img src="${esc(image)}" alt="">`:'AI'}</span>`:`<span class="skill-mark">S</span>`}<span><strong>${esc(item.name)}</strong><small>${esc(type==='agents'?(item.role||item.summary||'未填写角色'):(item.summary||'无摘要'))}</small></span></div></td><td class="mono">${esc(item.slug)}</td><td>${type==='agents'?`<span class="category-pill">${esc(item.category||'通用')}</span><br><span class="subtle">${(item.skills||[]).length} 个技能</span>`:'<span class="category-pill cloud-source">后台上传</span><br><span class="subtle">云端独立产品</span>'}</td><td><b class="version-tag">v${esc(latest?.version||'—')}</b></td><td>${statusBlock(item.status)}</td><td>${date(updated)}</td><td>${deleted?`<div class="actions archived-actions"><span class="archived-label">历史删除记录</span><button class="table-action danger" data-action="permanent-delete" ${identity}>永久删除</button></div>`:`<div class="actions"><button class="table-action" data-action="${editAction}" ${identity}${type==='skills'?` data-summary="${esc(item.summary||'')}" data-description="${esc(item.description||'')}"`:''}>编辑</button>${type==='agents'?`<button class="table-action" data-action="clone-agent" data-id="${item.id}">复制</button>`:''}${item.status==='published'?`<button class="table-action amber" data-action="unpublish" ${identity}>立即下架</button>`:`<button class="table-action green" data-action="publish" ${identity}>上架</button>`}<button class="table-action danger" data-action="permanent-delete" ${identity}>删除</button></div>`}</td></tr>`}).join('')}</tbody></table></div>`;
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
   <section class="builder-section"><div class="section-title"><span>02</span><div><h3>角色设定</h3><p>角色名称用于客户端展示，系统提示词决定真实对话行为</p></div></div><div class="builder-grid">
    <label class="field span-2">角色名称<input name="role" maxlength="200" value="${esc(agent.role||agent.summary||'')}" required placeholder="例：新媒体内容策略与交付负责人"></label>
    <label class="field span-2">系统提示词<textarea name="systemPrompt" rows="9" maxlength="200000" required placeholder="你是……\n\n职责：……\n工作流程：……\n输出标准：……">${esc(agent.systemPrompt||'')}</textarea></label>
    <label class="field span-2">欢迎语<textarea name="welcomeMessage" rows="3" maxlength="10000" placeholder="用户打开智能体时看到的第一句话">${esc(agent.welcomeMessage||'')}</textarea></label>
   </div></section>
   <section class="builder-section"><div class="section-title"><span>03</span><div><h3>工作区与权限</h3><p>设定长期目标、交付目录与记忆；运行能力由客户端统一管理</p></div></div><div class="builder-grid">
    <label class="field span-2">工作目标<textarea name="workspaceGoal" rows="3" maxlength="20000" placeholder="它在这个工作区需要持续达成的目标">${esc(workspace.goal||'')}</textarea></label>
    <label class="field span-2">角色规则<textarea name="workspaceRoleRules" rows="4" maxlength="50000" placeholder="例：每次修改前先备份；交付文件必须放入指定目录">${esc(workspace.roleRules||'')}</textarea></label>
    <label class="field">默认交付目录<input name="outputDirectory" maxlength="500" value="${esc(workspace.outputDirectory||'outputs')}" placeholder="outputs"></label>
    <div class="permission-grid span-2">
     <label><input type="checkbox" name="memoryEnabled"${checked(workspace.memoryEnabled!==false)}><span><strong>启用长期记忆</strong><small>保留该智能体的独立工作记忆</small></span></label>
     <label><input type="checkbox" name="allowFiles"${checked(workspace.allowFiles!==false)}><span><strong>允许文件</strong><small>可以读写工作区文件</small></span></label>
    </div>
    <div class="runtime-capability-note span-2" role="note" aria-label="客户端运行能力说明">
     <div><i aria-hidden="true"></i><span><strong>联网默认开启</strong><small>智能体可搜索和读取公开网络内容，无需在后台逐个授权。</small></span></div>
     <div><i aria-hidden="true"></i><span><strong>终端跟随桌面端电脑权限</strong><small>用户在桌面端开启电脑权限后，当前智能体才能使用 PowerShell、CMD 与 CLI。</small></span></div>
    </div>
   </div></section>
   <section class="builder-section compact"><div class="section-title"><span>04</span><div><h3>技能与发布</h3><p>选择专属技能，并明确保存后的市场状态</p></div></div><div class="skill-subheading"><strong>专属技能</strong><small>勾选后写入智能体配置</small></div>${agentSkillSelector(agent.skillIds||[])}<div class="publish-settings"><div class="builder-grid"><label class="field">版本<input name="version" value="${esc(version)}" pattern="(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)" required></label><label class="field">版本说明<input name="changelog" maxlength="20000" placeholder="本次更新内容"></label></div><div><div class="skill-subheading"><strong>保存后状态</strong><small>“已上架”会立即对客户端可见</small></div><div class="publish-choices"><label class="draft"><input type="radio" name="status" value="draft"${checked(currentStatus==='draft')}><span><strong>保存为草稿</strong><small>仅后台可见，适合继续编辑</small></span></label><label class="unpublished"><input type="radio" name="status" value="unpublished"${checked(currentStatus==='unpublished')}><span><strong>保持下架</strong><small>客户端市场中隐藏</small></span></label><label class="published"><input type="radio" name="status" value="published"${checked(currentStatus==='published')}><span><strong>直接上架</strong><small>客户端刷新后可见</small></span></label></div></div></div></section>
   <div class="dialog-actions sticky"><button class="secondary" type="button" data-action="close-dialog">取消</button><span class="save-hint">保存后会自动生成市场 manifest</span><button class="primary" type="submit">${editing?'保存智能体':'创建智能体'}</button></div>
  </form></div></div>`;
 const avatarInput=$('#agentBuilderForm input[name="avatarFile"]');avatarInput?.addEventListener('change',async()=>{const file=avatarInput.files?.[0];if(!file)return;const statusEl=$('#avatarUploadStatus');const hidden=$('#agentBuilderForm input[name="avatar"]');const preview=$('#avatarPreview');if(file.size>3*1024*1024){avatarInput.value='';statusEl.textContent='图片超过 3MB，请压缩后重试';statusEl.classList.add('upload-error');return}if(!['image/png','image/jpeg','image/webp'].includes(file.type)){avatarInput.value='';statusEl.textContent='仅支持 PNG、JPG 或 WEBP';statusEl.classList.add('upload-error');return}statusEl.textContent='正在安全上传…';statusEl.classList.remove('upload-error');const body=new FormData();body.append('avatar',file);try{const result=await api('/api/admin/agents/avatar',{method:'POST',body});hidden.value=result.url;preview.classList.add('has-image');preview.innerHTML=`<img src="${esc(avatarUrl(result.url))}" alt="智能体头像">`;statusEl.textContent='头像已上传，保存智能体后生效';notice('头像上传成功')}catch(error){statusEl.textContent=error.message;statusEl.classList.add('upload-error');notice(error.message,true)}});
}

const LOGIN_INTERACTION_MODE=Object.freeze({IDLE:'idle',MOUSE_TRACKING:'mouse-tracking',USERNAME_HOVER:'username-hover',USERNAME_FOCUS:'username-focus',PASSWORD_FOCUS:'password-focus'});
const LOGIN_CHARACTER_CONFIG=Object.freeze({
  violet:{maxEyeX:7.5,maxEyeY:5.5,sensitivity:.018,minFollow:.14,baseFollow:.17,maxFollow:.38,velocityFactor:.0045,peekFollow:.34,returnFollow:.17,parallax:3.2,bodyRotate:6,targetOffset:{x:-2,y:-2},typingTilt:.45},
  charcoal:{maxEyeX:6.5,maxEyeY:5,sensitivity:.017,minFollow:.08,baseFollow:.16,maxFollow:.35,velocityFactor:.004,peekFollow:.09,returnFollow:.16,parallax:2.3,bodyRotate:5,targetOffset:{x:4,y:3},typingTilt:-.35},
  orange:{maxEyeX:4,maxEyeY:3.2,sensitivity:.015,minFollow:.14,baseFollow:.19,maxFollow:.4,velocityFactor:.0048,peekFollow:.16,returnFollow:.18,parallax:4,bodyRotate:4,targetOffset:{x:1,y:2},typingTilt:.25},
  yellow:{maxEyeX:4,maxEyeY:3.2,sensitivity:.016,minFollow:.13,baseFollow:.18,maxFollow:.37,velocityFactor:.0043,peekFollow:.14,returnFollow:.17,parallax:3.3,bodyRotate:4.5,targetOffset:{x:5,y:-1},typingTilt:-.28}
});

function clampLoginMotion(value,min,max){return Math.min(max,Math.max(min,value))}
function computeBoundedGaze(eye,target,config,weight=1){
 const dx=target.x-eye.x;const dy=target.y-eye.y;const angle=Math.atan2(dy,dx);const strength=Math.min(1,Math.hypot(dx,dy)*config.sensitivity)*weight;
 return {x:Math.cos(angle)*config.maxEyeX*strength,y:Math.sin(angle)*config.maxEyeY*strength};
}
function computeVelocityFollow(mouseSpeed,config){return clampLoginMotion(config.baseFollow+clampLoginMotion(mouseSpeed,0,80)*config.velocityFactor,config.minFollow,config.maxFollow)}

function initLoginCharacterScene(){
 const scene=document.querySelector('[data-character-scene]');
 const usernameInput=document.querySelector('[data-login-field="identifier"]');
 const passwordInput=document.querySelector('[data-login-field="password"]');
 if(!scene||!usernameInput||!passwordInput)return {start(){},stop(){},destroy(){}};
 const reducedQuery=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')||{matches:false,addEventListener(){},removeEventListener(){}};
 const characters=[...scene.querySelectorAll('[data-character]')].map((element)=>{
  const config=LOGIN_CHARACTER_CONFIG[element.dataset.character];
  const eyes=[...element.querySelectorAll('[data-eye]')].map((eye)=>({element:eye,pupil:eye.querySelector('.character-pupil'),center:{x:0,y:0},x:0,y:0}));
  const motion=element.querySelector('[data-character-motion]');
  return {element,motion,config,eyes,bodyX:0,bodyY:0,bodyR:0,typingImpulse:0};
 }).filter((character)=>character.motion&&character.config&&character.eyes.every((eye)=>eye.pupil));
 let mode=LOGIN_INTERACTION_MODE.IDLE;let usernameFocused=false;let usernameHovered=false;let passwordFocused=false;let pointerInside=false;
 let sceneRect={left:0,top:0,right:0,width:1,height:1};let usernameRect={left:0,top:0,width:1,height:1};let geometryDirty=true;
 let targetPointer={x:0,y:0};let sampledPointer={x:0,y:0};let pointerInitialized=false;let smoothSpeed=0;
 let animationFrame=0;let running=false;let lastFrameTime=0;let usernameFocusStartedAt=0;let focusPhase='idle';
 const entryAnimations=new Set(['shanman-entry-charcoal-smooth','shanman-entry-yellow-smooth','shanman-entry-violet-smooth','shanman-entry-orange-smooth']);
 const entryElements=[...scene.querySelectorAll('[data-character-entry]')];
 scene.dataset.intro=reducedQuery.matches?'complete':'running';
 scene.dataset.focusPhase='idle';
 if(reducedQuery.matches)for(const entry of entryElements)entry.dataset.entryComplete='true';

 const resolveMode=()=>{
  if(usernameFocused)return LOGIN_INTERACTION_MODE.USERNAME_FOCUS;
  if(passwordFocused)return LOGIN_INTERACTION_MODE.PASSWORD_FOCUS;
  if(usernameHovered)return LOGIN_INTERACTION_MODE.USERNAME_HOVER;
  if(pointerInside&&!reducedQuery.matches)return LOGIN_INTERACTION_MODE.MOUSE_TRACKING;
  return LOGIN_INTERACTION_MODE.IDLE;
 };
 const setFocusPhase=(next)=>{if(next===focusPhase)return;focusPhase=next;scene.dataset.focusPhase=next};
 const updateMode=()=>{const next=resolveMode();if(next===mode)return;mode=next;scene.dataset.interactionMode=mode;if(mode===LOGIN_INTERACTION_MODE.USERNAME_FOCUS)geometryDirty=true;else setFocusPhase('idle')};
 const updateFocusPhase=(timestamp)=>{
  if(mode!==LOGIN_INTERACTION_MODE.USERNAME_FOCUS){setFocusPhase('idle');return}
  const elapsed=Math.max(0,timestamp-usernameFocusStartedAt);
  setFocusPhase(elapsed<220?'violet-check':elapsed<480?'charcoal-reply':'field-lock');
 };
 const refreshGeometry=()=>{
  sceneRect=scene.getBoundingClientRect();usernameRect=usernameInput.getBoundingClientRect();
  for(const character of characters){for(const eye of character.eyes){const rect=eye.element.getBoundingClientRect();eye.center={x:rect.left+rect.width/2,y:rect.top+rect.height/2}}}
  if(!pointerInitialized){targetPointer={x:sceneRect.left+sceneRect.width*.58,y:sceneRect.top+sceneRect.height*.46};sampledPointer={...targetPointer};pointerInitialized=true}
  geometryDirty=false;
 };
  const characterLookPoint=(key)=>{
   const match=characters.find((candidate)=>candidate.element.dataset.character===key);
   if(!match?.eyes.length)return {x:usernameRect.left+44,y:usernameRect.top+usernameRect.height/2};
   return {x:match.eyes.reduce((sum,item)=>sum+item.center.x,0)/match.eyes.length,y:match.eyes.reduce((sum,item)=>sum+item.center.y,0)/match.eyes.length};
  };
  const gazeTarget=(eye,character)=>{
   if(mode===LOGIN_INTERACTION_MODE.USERNAME_FOCUS){
    const key=character.element.dataset.character;
    if(focusPhase==='violet-check'&&key==='violet')return {...characterLookPoint('charcoal'),weight:1};
    if(focusPhase==='charcoal-reply'&&(key==='violet'||key==='charcoal'))return {...characterLookPoint(key==='violet'?'charcoal':'violet'),weight:1};
    const weight=focusPhase!=='field-lock'&&(key==='orange'||key==='yellow') ? .48 : 1;
    return {x:usernameRect.left+44+character.config.targetOffset.x,y:usernameRect.top+usernameRect.height/2+character.config.targetOffset.y,weight};
   }
   if(mode===LOGIN_INTERACTION_MODE.USERNAME_HOVER)return {x:usernameRect.left+44+character.config.targetOffset.x,y:usernameRect.top+usernameRect.height/2+character.config.targetOffset.y,weight:.28};
  if(mode===LOGIN_INTERACTION_MODE.PASSWORD_FOCUS)return {x:eye.center.x-90+character.config.targetOffset.x,y:eye.center.y-58+character.config.targetOffset.y,weight:.68};
  if(mode===LOGIN_INTERACTION_MODE.MOUSE_TRACKING)return {x:targetPointer.x,y:targetPointer.y,weight:1};
  return {x:sceneRect.right+80,y:sceneRect.top+sceneRect.height*.43+character.config.targetOffset.y,weight:.42};
 };
 const animate=(timestamp)=>{
  if(!running)return;
  updateFocusPhase(timestamp);
  if(scene.dataset.intro!=='complete'){lastFrameTime=timestamp;animationFrame=requestAnimationFrame(animate);return}
  if(geometryDirty)refreshGeometry();
  const frameScale=clampLoginMotion((timestamp-(lastFrameTime||timestamp))/16.667,.5,2);lastFrameTime=timestamp;
  const rawSpeed=Math.hypot(targetPointer.x-sampledPointer.x,targetPointer.y-sampledPointer.y);sampledPointer={...targetPointer};smoothSpeed+=(clampLoginMotion(rawSpeed,0,80)-smoothSpeed)*.2;
  const normalizedX=clampLoginMotion((targetPointer.x-sceneRect.left)/Math.max(sceneRect.width,1)-.5,-.5,.5);const normalizedY=clampLoginMotion((targetPointer.y-sceneRect.top)/Math.max(sceneRect.height,1)-.5,-.5,.5);
  for(const character of characters){
   const config=character.config;let follow=mode===LOGIN_INTERACTION_MODE.USERNAME_FOCUS?config.peekFollow:mode===LOGIN_INTERACTION_MODE.IDLE||mode===LOGIN_INTERACTION_MODE.PASSWORD_FOCUS?config.returnFollow:computeVelocityFollow(smoothSpeed,config);
   if(reducedQuery.matches)follow=1;const effectiveFollow=1-Math.pow(1-follow,frameScale);
    for(const eye of character.eyes){const target=gazeTarget(eye,character);const gaze=computeBoundedGaze(eye.center,target,config,target.weight);eye.x+=(gaze.x-eye.x)*effectiveFollow;eye.y+=(gaze.y-eye.y)*effectiveFollow;eye.pupil.style.setProperty('--eye-x',`${eye.x.toFixed(2)}px`);eye.pupil.style.setProperty('--eye-y',`${eye.y.toFixed(2)}px`)}
   const tracking=mode===LOGIN_INTERACTION_MODE.MOUSE_TRACKING&&!reducedQuery.matches;const targetBodyX=tracking?normalizedX*config.parallax*2:0;const targetBodyY=tracking?normalizedY*config.parallax*2:0;const targetBodyR=tracking?normalizedX*config.bodyRotate*2:0;
   const bodyFollow=1-Math.pow(.9,frameScale);character.bodyX+=(targetBodyX-character.bodyX)*bodyFollow;character.bodyY+=(targetBodyY-character.bodyY)*bodyFollow;character.bodyR+=(targetBodyR-character.bodyR)*bodyFollow;character.typingImpulse*=Math.pow(.82,frameScale);
   character.motion.style.setProperty('--body-x',`${character.bodyX.toFixed(2)}px`);character.motion.style.setProperty('--body-y',`${character.bodyY.toFixed(2)}px`);character.motion.style.setProperty('--body-r',`${character.bodyR.toFixed(3)}deg`);character.motion.style.setProperty('--typing-r',`${(character.typingImpulse*config.typingTilt).toFixed(3)}deg`);
  }
  animationFrame=requestAnimationFrame(animate);
 };
 const onPointerMove=(event)=>{targetPointer={x:event.clientX,y:event.clientY};pointerInitialized=true};
 const onPointerEnter=()=>{pointerInside=true;updateMode()};
 const onPointerLeave=()=>{pointerInside=false;updateMode()};
 const onUsernameEnter=()=>{usernameHovered=true;updateMode()};
 const onUsernameLeave=()=>{usernameHovered=false;updateMode()};
 const onUsernameFocus=()=>{usernameFocused=true;passwordFocused=false;usernameFocusStartedAt=performance.now();setFocusPhase('violet-check');geometryDirty=true;updateMode()};
 const onUsernameBlur=()=>{usernameFocused=false;updateMode()};
 const onUsernameInput=()=>{if(usernameFocused)for(const character of characters)character.typingImpulse=1};
 const onPasswordFocus=()=>{passwordFocused=true;usernameFocused=false;updateMode()};
 const onPasswordBlur=()=>{passwordFocused=false;updateMode()};
 const onLayoutChange=()=>{geometryDirty=true};
 const onEntryAnimationEnd=(event)=>{if(!entryAnimations.has(event.animationName)||!event.target?.matches?.('[data-character-entry]'))return;event.target.dataset.entryComplete='true';if(entryElements.every((entry)=>entry.dataset.entryComplete==='true')){scene.dataset.intro='complete';geometryDirty=true}};
 const onReducedMotionChange=()=>{if(reducedQuery.matches){for(const entry of entryElements)entry.dataset.entryComplete='true';scene.dataset.intro='complete'}geometryDirty=true;updateMode()};
 scene.addEventListener('pointermove',onPointerMove,{passive:true});scene.addEventListener('pointerenter',onPointerEnter,{passive:true});scene.addEventListener('pointerleave',onPointerLeave,{passive:true});
 scene.addEventListener('animationend',onEntryAnimationEnd);
 usernameInput.addEventListener('mouseenter',onUsernameEnter);usernameInput.addEventListener('mouseleave',onUsernameLeave);usernameInput.addEventListener('focus',onUsernameFocus);usernameInput.addEventListener('blur',onUsernameBlur);usernameInput.addEventListener('input',onUsernameInput);
 passwordInput.addEventListener('focus',onPasswordFocus);passwordInput.addEventListener('blur',onPasswordBlur);window.addEventListener('resize',onLayoutChange,{passive:true});reducedQuery.addEventListener('change',onReducedMotionChange);
 const resizeObserver=globalThis.ResizeObserver?new ResizeObserver(onLayoutChange):null;resizeObserver?.observe(scene);resizeObserver?.observe(usernameInput);
 const controller={
  start(){if(running)return;running=true;lastFrameTime=0;geometryDirty=true;animationFrame=requestAnimationFrame(animate)},
  stop(){running=false;if(animationFrame)cancelAnimationFrame(animationFrame);animationFrame=0},
  destroy(){this.stop();resizeObserver?.disconnect();scene.removeEventListener('pointermove',onPointerMove);scene.removeEventListener('pointerenter',onPointerEnter);scene.removeEventListener('pointerleave',onPointerLeave);scene.removeEventListener('animationend',onEntryAnimationEnd);usernameInput.removeEventListener('mouseenter',onUsernameEnter);usernameInput.removeEventListener('mouseleave',onUsernameLeave);usernameInput.removeEventListener('focus',onUsernameFocus);usernameInput.removeEventListener('blur',onUsernameBlur);usernameInput.removeEventListener('input',onUsernameInput);passwordInput.removeEventListener('focus',onPasswordFocus);passwordInput.removeEventListener('blur',onPasswordBlur);window.removeEventListener('resize',onLayoutChange);reducedQuery.removeEventListener('change',onReducedMotionChange)}
 };
 window.addEventListener('pagehide',()=>controller.destroy(),{once:true});return controller;
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
loginCharacterScene=initLoginCharacterScene();

$('#loginForm').addEventListener('submit',async(event)=>{
 event.preventDefault();const formElement=event.currentTarget;const form=new FormData(formElement);const submit=formElement.querySelector('[data-login-submit]');const original=submit.innerHTML;$('#loginError').textContent='';submit.disabled=true;submit.setAttribute('aria-busy','true');submit.textContent='正在安全登录…';
 try{const nextApiBase=normalizeApiBase(form.get('apiBase')||state.apiBase);if(nextApiBase!==state.apiBase){state.apiBase=nextApiBase;state.token='';sessionStorage.removeItem(TOKEN_KEY);if(nextApiBase)localStorage.setItem(API_BASE_KEY,nextApiBase);else localStorage.removeItem(API_BASE_KEY)}const data=await api('/api/auth/login',{method:'POST',body:JSON.stringify({identifier:form.get('identifier'),password:form.get('password')})});if(data.user?.role!=='admin')throw new Error('该账号不是管理员');state.token=data.token;state.user=data.user;sessionStorage.setItem(TOKEN_KEY,data.token);showApp()}catch(error){$('#loginError').textContent=error.message}finally{submit.disabled=false;submit.removeAttribute('aria-busy');submit.innerHTML=original}
});
$('#navigation').addEventListener('click',(event)=>{const button=event.target.closest('[data-page]');if(button)void navigate(button.dataset.page)});
$('#logoutButton').addEventListener('click',logout);$('#refreshButton').addEventListener('click',()=>void navigate(state.page));$('#menuButton').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));

content.addEventListener('submit',async(event)=>{
 event.preventDefault();const form=event.target;
 try{
   if(form.id==='uploadForm'){
    const type=form.dataset.type;const body=new FormData();let file;
    if(type==='skills'){
     const folderFiles=[...(form.elements.folder?.files||[])];const packageFile=form.elements.package?.files?.[0];
     if(folderFiles.length)file=await skillFolderPackage(form,folderFiles);else if(packageFile)file=await skillJsonPackage(form,packageFile);else throw new Error('请选择技能文件夹或 JSON / ZIP 安装包');
     body.append('publishMode',String(form.elements.publishMode?.value||'draft'));
     for(const field of ['skillName','skillSlug','skillCategory','skillVersion','skillSummary','skillDescription','skillChangelog'])body.append(field,String(form.elements[field]?.value||''));
    }else{file=form.elements.package?.files?.[0];if(!file)throw new Error('请选择文件')}
    body.append('package',file,file.name);const result=await api(`/api/admin/${type}/upload`,{method:'POST',body});const id=result.product?.id||result.id;if(!id)throw new Error('上传成功但服务器没有返回资源 ID');
    const expected=type==='skills'?String(form.elements.publishMode?.value||'draft'):'draft';if(type==='skills'&&expected==='published'&&result.product?.status!=='published')await api(`/api/admin/${type}/${id}/publish`,{method:'POST'});const verified=await verifyProductState(type,id,expected);notice(expected==='published'?`技能“${verified.name}”已写入数据库并上架，公共目录已确认可见（${verified.slug} · v${verified.latestVersion?.version||verified.latest_version?.version||'—'}）`:`技能“${verified.name}”已写入数据库并保存为草稿，公共目录已确认隐藏`);await navigate(type);return;
   }
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
    role:data.get('role'),systemPrompt:data.get('systemPrompt'),welcomeMessage:data.get('welcomeMessage'),
     workspace:{goal:data.get('workspaceGoal'),roleRules:data.get('workspaceRoleRules'),outputDirectory:data.get('outputDirectory'),memoryEnabled:data.has('memoryEnabled'),allowWeb:true,allowFiles:data.has('allowFiles'),allowTerminal:true},
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
   const original=button.textContent;button.disabled=true;button.textContent='处理中…';
    try{await api(`/api/admin/${type}/${id}/${action}`,{method:'POST'});await verifyProductState(type,id,expected);state.productFilters[type]=expected;notice(action==='publish'?'已真实上架，客户端市场已确认可见':type==='skills'?'技能已真实下架，客户端市场已隐藏；绑定智能体保持原状态':'智能体已真实下架，客户端市场已隐藏');await navigate(type)}finally{button.disabled=false;button.textContent=original}return;
  }
  if(action==='permanent-delete'){
   if(!confirm(`永久删除“${button.dataset.name||'该资源'}”？数据库记录、全部版本和上传文件将立即清除，且无法恢复。`))return;
   const type=button.dataset.type;const id=button.dataset.id;const slug=button.dataset.slug||'';const original=button.textContent;button.disabled=true;button.textContent='永久删除中…';
   try{const result=await api(`/api/admin/${type}/${id}/permanent?confirm=${encodeURIComponent(slug)}`,{method:'DELETE'});await verifyProductGone(type,id);state.productFilters[type]='active';const detached=Number(result.affectedAgents?.length||0);notice(`已从数据库永久删除“${button.dataset.name||result.slug}”${result.removedVersions?`，清理 ${result.removedVersions} 个版本`:''}${detached?`；已从 ${detached} 个智能体配置中解除该技能，智能体发布状态未改变`:''}${result.cleanupWarnings?'；部分历史文件清理失败，请检查服务器日志':''}`,Boolean(result.cleanupWarnings));await navigate(type)}finally{button.disabled=false;button.textContent=original}return;
  }
  if(action==='revoke-license'&&confirm('确定吊销这条授权？已激活设备后续将无法再次验证。')){await api(`/api/admin/licenses/${button.dataset.id}/revoke`,{method:'POST'});notice('授权已吊销');await navigate('users')}
 }catch(error){notice(error.message,true)}
});

(async()=>{if(!state.token)return showLogin();try{const data=await api('/api/me');if(data.user?.role!=='admin')throw new Error('不是管理员');state.user=data.user;showApp()}catch{logout()}})();
