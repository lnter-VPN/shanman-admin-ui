/* Tutorial authoring only. Uses the existing admin API/auth; no model runtime. */
window.TutorialPublisher=(()=>{
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const imagePattern=/^\/api\/tutorial-images\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/;
 const icons={plus:'M12 5v14M5 12h14',back:'m14 6-6 6 6 6',image:'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M8 8h.01',folder:'M3 7h7l2-3h9v16H3z',search:'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14m5-2 6 6',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',file:'M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6'};
 const icon=name=>`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name]||icons.file}"/></svg>`;
 const statusName={draft:'草稿',published:'已发布',unpublished:'已下架'};
 const lines=value=>Array.isArray(value)?value.join('\n'):'';
 let root,api,base,token,items=[],categories=[],current=null,dirty=false,busy=0,saving=false,filter={search:'',category:'',status:''};
 const blobUrls=new Map();
 const $=selector=>root.querySelector(selector);
 function error(message){const target=$('[data-tp-error]');if(target){target.textContent=message;target.hidden=!message;target.scrollIntoView({block:'nearest'})}}
 function canLeave(){if(busy||saving){error(saving?'教程正在保存，请稍候。':'图片仍在上传，请等待上传完成。');return false}return !dirty||confirm('有尚未保存的内容，确定离开并放弃这些修改吗？')}
 function dispose(){for(const url of blobUrls.values())URL.revokeObjectURL(url);blobUrls.clear();dirty=false;current=null;document.querySelectorAll('dialog[data-tp-dialog]').forEach(node=>node.remove())}
 window.addEventListener('beforeunload',event=>{if(dirty||busy||saving){event.preventDefault();event.returnValue=''}});
 async function mount(options){
  root=options.root;api=options.api;base=options.base;token=options.token;
  root.classList.add('tutorial-publisher');
  root.onclick=click;root.oninput=onInput;root.onchange=onChange;root.onsubmit=submit;
  root.ondragover=event=>{if(event.dataTransfer?.types.includes('Files')&&event.target.closest('[data-image-zone]')){event.preventDefault();event.target.closest('[data-image-zone]').classList.add('is-dragging')}};
  root.ondragleave=event=>event.target.closest('[data-image-zone]')?.classList.remove('is-dragging');
  root.ondrop=event=>{const zone=event.target.closest('[data-image-zone]');if(!zone||!event.dataTransfer?.files.length)return;event.preventDefault();zone.classList.remove('is-dragging');void upload(zone,[...event.dataTransfer.files])};
  root.onpaste=event=>{const files=[...(event.clipboardData?.items||[])].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);if(!files.length)return;const section=event.target.closest('[data-tp-step]')||$('[data-body-section]');const zone=section?.querySelector('[data-image-zone]');if(zone){event.preventDefault();void upload(zone,files)}};
  await load();list();
 }
 async function load(){const data=await api('/api/admin/tutorials');items=data.items||[];categories=data.categories||(await api('/api/admin/tutorial-categories')).items||[]}
 function options(selected='',all=false){return `${all?'<option value="">全部分类</option>':''}${categories.map(item=>`<option value="${escape(item.id)}"${item.id===selected?' selected':''}>${escape(item.name)}</option>`).join('')}`}
 function list(){
  current=null;dirty=false;
  root.innerHTML=`<header class="tp-heading"><div><h2>让每一篇教程，更容易读懂</h2><p>创建分类，编写图文教程，确认后再发布到客户端。</p></div><div class="tp-heading-actions"><button type="button" class="tp-button" data-tp="categories">${icon('folder')}管理分类</button><button type="button" class="tp-button tp-primary" data-tp="new">${icon('plus')}新建教程</button></div></header>
   <div class="tp-error" data-tp-error role="alert" hidden></div>
   <section class="tp-library"><div class="tp-filters"><label class="tp-search">${icon('search')}<input data-filter="search" type="search" aria-label="搜索教程" placeholder="搜索教程标题或简介" value="${escape(filter.search)}"></label><select data-filter="category" aria-label="按分类筛选">${options(filter.category,true)}</select><select data-filter="status" aria-label="按状态筛选"><option value="">全部状态</option>${Object.entries(statusName).map(([value,label])=>`<option value="${value}"${filter.status===value?' selected':''}>${label}</option>`).join('')}</select></div>
   <div class="tp-list-summary"><strong>全部教程 <span>${items.length}</span></strong><p>${items.filter(item=>item.status==='published').length} 篇已发布 · ${items.filter(item=>item.status==='draft').length} 篇草稿</p></div><div data-tp-list></div></section>
   <p class="tp-footnote">草稿不会出现在客户端。发布后的内容将在客户端重新打开“教程”时显示。</p>`;
  rows();
 }
 function rows(){
  const selected=items.filter(item=>(!filter.category||item.category===filter.category)&&(!filter.status||item.status===filter.status)&&(!filter.search||`${item.title} ${item.summary}`.toLowerCase().includes(filter.search.toLowerCase())));
  $('[data-tp-list]').innerHTML=selected.length?selected.map(item=>`<article class="tp-row"><span class="tp-document-icon">${icon('file')}</span><div class="tp-row-copy"><h3>${escape(item.title)}</h3><p>${escape(item.summary)}</p><div class="tp-row-meta"><span>${escape(categories.find(category=>category.id===item.category)?.name||item.categoryName||item.category)}</span><span>${item.steps?.length?`${item.steps.length} 个步骤`:'图文教程'}</span><span>${(item.images?.length||0)+(item.steps||[]).reduce((sum,step)=>sum+(step.images?.length||0),0)} 张图片</span><span>${escape(String(item.updatedAt||'').slice(0,10))}</span></div></div><span class="tp-status" data-status="${escape(item.status)}">${statusName[item.status]||'草稿'}</span><div class="tp-row-actions"><button type="button" class="tp-button" data-tp="edit" data-id="${escape(item.id)}">编辑</button><button type="button" class="tp-button tp-quiet" data-tp="read" data-id="${escape(item.id)}">预览</button><details class="tp-row-more"><summary aria-label="更多教程操作">···</summary><div>${item.status==='published'?`<button type="button" data-tp="unpublish" data-id="${escape(item.id)}">下架教程</button>`:'' }<button type="button" data-tp="delete" data-id="${escape(item.id)}">删除教程</button></div></details></div></article>`).join(''):`<div class="tp-empty">${icon('file')}<h3>${items.length?'没有找到匹配的教程':'从第一篇教程开始'}</h3><p>${items.length?'换个关键词或分类再试试。':'点击“新建教程”，填写标题、内容和图片即可。'}</p></div>`;
 }
 function imagesEditor(images=[]){return `<div class="tp-image-zone" data-image-zone><div class="tp-image-grid" data-images>${images.filter(item=>imagePattern.test(item.url||'')).map(imageCard).join('')}</div><label class="tp-image-drop">${icon('image')}<span><strong>添加图片</strong><small>点击选择、拖到这里，或在内容框粘贴截图 · PNG / JPG / WEBP，每张 ≤ 8MB</small></span><input type="file" accept="image/png,image/jpeg,image/webp" multiple data-upload aria-label="上传教程图片"></label><p data-upload-status role="status"></p></div>`}
 function imageCard(image){return `<figure class="tp-image-card" data-image-url="${escape(image.url)}"><div class="tp-image-frame"><img alt="教程配图"${blobUrls.has(image.url)?` src="${escape(blobUrls.get(image.url))}"`:''}><span data-image-error hidden>图片读取失败，请重试</span></div><input data-caption maxlength="300" value="${escape(image.caption||'')}" aria-label="图片说明" placeholder="图片说明（可选）"><div><button type="button" class="tp-button tp-quiet" data-tp="image-up" aria-label="将图片前移">前移</button><button type="button" class="tp-button tp-quiet" data-tp="remove-image">移除</button></div></figure>`}
 function stepEditor(step={},index=0){return `<section class="tp-step" data-tp-step><header><strong data-step-number>步骤 ${index+1}</strong><div><button type="button" class="tp-button tp-quiet" data-tp="step-up" aria-label="将步骤上移">上移</button><button type="button" class="tp-button tp-quiet" data-tp="step-down" aria-label="将步骤下移">下移</button><button type="button" class="tp-button tp-quiet" data-tp="remove-step">移除</button></div></header><label class="tp-field">步骤标题<input name="stepTitle" maxlength="120" placeholder="例如：打开模型配置" value="${escape(step.title||'')}"></label><label class="tp-field">操作说明<textarea name="stepBody" rows="4" maxlength="4000" placeholder="点哪里、填写什么、看到什么结果，按顺序写清楚。">${escape(step.body||'')}</textarea></label>${imagesEditor(step.images)}<label class="tp-field">完成这一步的标志 <span>选填</span><input name="stepCheck" maxlength="1000" value="${escape(step.check||'')}" placeholder="例如：页面显示连接成功"></label></section>`}
 function edit(item={}){
  current=structuredClone(item);dirty=false;
  root.innerHTML=`<form id="tpTutorialForm" class="tp-editor"><header class="tp-editor-header"><div><button type="button" class="tp-back" data-tp="back">${icon('back')}返回教程列表</button><h2>${item.id?'编辑教程':'新建教程'}<span data-save-state>${item.id?(statusName[item.status]||'草稿'):'未保存'}</span></h2></div><div class="tp-heading-actions"><button type="button" class="tp-button" data-tp="preview">${icon('eye')}预览</button><button type="submit" class="tp-button" name="saveMode" value="draft">保存草稿</button><button type="submit" class="tp-button tp-primary" name="saveMode" value="published">${item.status==='published'?'更新已发布教程':'发布教程'}</button></div></header><div class="tp-error" data-tp-error role="alert" hidden></div>
   <div class="tp-editor-layout"><div class="tp-editor-main"><section class="tp-section"><div class="tp-section-title"><span>01</span><div><h3>基本信息</h3><p>先告诉读者，这篇教程能解决什么问题。</p></div></div><label class="tp-field">教程标题 <span>必填</span><input name="title" maxlength="160" required value="${escape(item.title||'')}" placeholder="例如：如何配置模型并开始第一次对话"></label><label class="tp-field">一句话简介 <span>必填</span><textarea name="summary" rows="2" maxlength="500" required placeholder="简短说明适合谁阅读、读完能完成什么。">${escape(item.summary||'')}</textarea></label><label class="tp-field">所属分类 <span>必填</span><select name="category" required>${options(item.category||categories[0]?.id)}</select></label><button type="button" class="tp-text-button" data-tp="toggle-category">${icon('plus')}新建分类</button><div class="tp-inline-category" data-inline-category hidden><label class="tp-field">分类名称<input data-category-name maxlength="40" placeholder="例如：电商运营、摄影剪辑"></label><button class="tp-button" type="button" data-tp="create-inline-category">创建并选用</button></div></section>
   <section class="tp-section" data-body-section><div class="tp-section-title"><span>02</span><div><h3>图文内容</h3><p>像写文章一样填写，不需要代码；操作截图可直接粘贴。</p></div></div><label class="tp-field">教程正文<textarea name="body" rows="8" maxlength="30000" placeholder="在这里写教程内容。可以说明背景、适用场景，或直接写完整操作方法。">${escape(item.body||'')}</textarea></label>${imagesEditor(item.images)}</section>
   <section class="tp-section"><div class="tp-section-title"><span>03</span><div><h3>操作步骤 <small>可选</small></h3><p>需要分步讲解时再添加，每一步都能配图。</p></div></div><div data-steps>${(item.steps||[]).map(stepEditor).join('')}</div><button type="button" class="tp-button tp-add-step" data-tp="add-step">${icon('plus')}添加一个步骤</button></section>
   <details class="tp-section tp-extra"><summary>补充说明 <span>选填：准备事项、注意事项、完成标准</span></summary><label class="tp-field">开始前准备<textarea name="preparation" rows="3" placeholder="每行写一项">${escape(lines(item.preparation))}</textarea></label><label class="tp-field">注意事项<textarea name="tips" rows="3" placeholder="每行写一项">${escape(lines(item.tips))}</textarea></label><label class="tp-field">完成标准<textarea name="completion" rows="3" placeholder="每行写一项">${escape(lines(item.completion))}</textarea></label></details></div>
   <aside class="tp-settings"><section class="tp-section"><h3>发布设置</h3><label class="tp-field">阅读时长<input name="duration" maxlength="40" value="${escape(item.duration||'约 3 分钟')}" placeholder="例如：约 5 分钟"></label><label class="tp-field">分类内排序<input name="sortOrder" type="number" min="-100000" max="100000" value="${Number(item.sortOrder)||0}"><small>数字越小越靠前，默认填 0 即可。</small></label><p class="tp-help">先保存草稿，核对文字和图片后再发布。新建分类会自动同步到客户端。</p></section>
   <details class="tp-section tp-extra"><summary>更多设置 <span>选填</span></summary><label class="tp-field">教程标识<input name="slug" maxlength="80" value="${escape(item.slug||`guide-${crypto.randomUUID()}`)}"><small>系统自动生成，无需修改。</small></label><label class="tp-field">阅读后的快捷入口<select name="actionTarget"><option value="">不设置</option>${Object.entries({agents:'AI 员工',market:'AI 超市',skills:'技能',settings:'模型配置','settings-mobile':'手机端连接'}).map(([value,label])=>`<option value="${value}"${item.action?.target===value?' selected':''}>${label}</option>`).join('')}</select></label><label class="tp-field">快捷按钮文字<input name="actionLabel" maxlength="80" value="${escape(item.action?.label||'')}" placeholder="例如：去配置模型"></label></details></aside></div></form>`;
  void hydrate(root);root.querySelector('[name=title]').focus();window.scrollTo({top:0});
 }
 function readImages(zone){return [...zone.querySelectorAll('[data-image-url]')].map(node=>({url:node.dataset.imageUrl,caption:node.querySelector('[data-caption]')?.value.trim()||''}))}
 function payload(status='draft'){
  const form=$('#tpTutorialForm');const data=new FormData(form);const string=name=>String(data.get(name)||'').trim();const list=name=>string(name).split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
  const steps=[...form.querySelectorAll('[data-tp-step]')].map(node=>({title:node.querySelector('[name=stepTitle]').value.trim(),body:node.querySelector('[name=stepBody]').value.trim(),check:node.querySelector('[name=stepCheck]').value.trim(),images:readImages(node)}));
  return {title:string('title'),summary:string('summary'),slug:string('slug'),category:string('category'),duration:string('duration')||'约 3 分钟',sortOrder:Number(data.get('sortOrder')),status,body:string('body'),images:readImages(form.querySelector('[data-body-section]')),steps,preparation:list('preparation'),tips:list('tips'),completion:list('completion'),action:string('actionTarget')?{target:string('actionTarget'),label:string('actionLabel')}:null};
 }
 function changed(){dirty=true;const state=$('[data-save-state]');if(state)state.textContent='有未保存的修改'}
 function onInput(event){if(event.target.dataset.filter){filter[event.target.dataset.filter]=event.target.value;rows()}else if(current)changed()}
 function onChange(event){if(event.target.matches('[data-upload]')){void upload(event.target.closest('[data-image-zone]'),[...event.target.files]);event.target.value=''}else onInput(event)}
 async function upload(zone,files){
  if(!files.length)return;
  if(busy||saving){error('请等待当前上传或保存完成后再添加。');return}
  if(zone.querySelectorAll('[data-image-url]').length+files.length>12||root.querySelectorAll('[data-image-url]').length+files.length>40){error('每个内容区域最多 12 张图片，一篇教程最多 40 张。');return}
  const hint=zone.querySelector('[data-upload-status]');busy++;
  try{
   for(const file of files){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('图片仅支持 PNG、JPG、WEBP 格式。');
    if(file.size>8*1024*1024)throw new Error('单张图片不能超过 8MB。');
    hint.textContent=`正在上传 ${file.name}…`;
    const body=new FormData();body.append('image',file);
    const image=await api('/api/admin/tutorial-images',{method:'POST',body});
    if(!imagePattern.test(image.url||''))throw new Error('服务器未返回有效图片地址，请重试。');
    blobUrls.set(image.url,URL.createObjectURL(file));zone.querySelector('[data-images]').insertAdjacentHTML('beforeend',imageCard(image));changed();
   }
   hint.textContent='图片已上传；随教程发布后才对客户端可见。';error('');
  }catch(failure){hint.textContent='上传未完成，已成功的图片已保留，可重试剩余图片。';error(failure.message)}finally{busy--}
 }
 async function hydrate(scope){
  for(const node of scope.querySelectorAll('[data-image-url]')){
   const url=node.dataset.imageUrl;if(!imagePattern.test(url))continue;
   if(!blobUrls.has(url))try{const response=await fetch(`${base()}${url.replace('/api/tutorial-images/','/api/admin/tutorial-images/')}`,{headers:{authorization:`Bearer ${token()}`},cache:'no-store'});if(!response.ok)throw new Error('图片读取失败');blobUrls.set(url,URL.createObjectURL(await response.blob()))}catch{node.querySelector('[data-image-error]')?.removeAttribute('hidden');continue}
   if(node.isConnected)node.querySelector('img').src=blobUrls.get(url);
  }
 }
 function dialog(title,html){
  const element=document.createElement('dialog');element.className='tp-dialog';element.dataset.tpDialog='true';element.setAttribute('aria-label',title);
  element.innerHTML=`<header><div><h2>${escape(title)}</h2><p>${title==='管理教程分类'?'按你的内容建立分类，不限制题材。':'核对内容与图片；预览不会更改发布状态。'}</p></div><button class="tp-button" type="button" data-dialog-close aria-label="关闭">关闭</button></header>${html}`;
  document.body.append(element);element.querySelector('[data-dialog-close]').onclick=()=>element.close();element.onclose=()=>element.remove();element.showModal();return element;
 }
 function preview(item){
  const gallery=images=>(images||[]).filter(image=>imagePattern.test(image.url||'')).map(image=>`<figure data-image-url="${escape(image.url)}"><img alt="${escape(image.caption||'教程配图')}"><span data-image-error hidden>图片读取失败</span>${image.caption?`<figcaption>${escape(image.caption)}</figcaption>`:''}</figure>`).join('');
  const bullet=(title,values)=>values?.length?`<section><h3>${title}</h3><ul>${values.map(value=>`<li>${escape(value)}</li>`).join('')}</ul></section>`:'';
  const element=dialog('阅读效果预览',`<article class="tp-reader"><p class="tp-reader-category">${escape(categories.find(category=>category.id===item.category)?.name||'未选择分类')} · ${escape(item.duration||'约 3 分钟')}</p><h1>${escape(item.title||'教程标题')}</h1><p class="tp-reader-summary">${escape(item.summary||'这里显示教程简介。')}</p>${item.body?`<p class="tp-reader-body">${escape(item.body)}</p>`:''}${gallery(item.images)}${bullet('开始前准备',item.preparation)}${(item.steps||[]).map((step,index)=>`<section><h2><span>${index+1}</span>${escape(step.title||'步骤标题')}</h2><p>${escape(step.body)}</p>${gallery(step.images)}${step.check?`<p class="tp-reader-check">完成标志：${escape(step.check)}</p>`:''}</section>`).join('')}${bullet('注意事项',item.tips)}${bullet('完成标准',item.completion)}</article>`);
  void hydrate(element);
 }
 function manageCategories(){
  const element=dialog('管理教程分类',`<div class="tp-category-manager"><p>分类不限制题材，可以随时新增或改名；已有教程会跟随分类名称同步。</p><form data-category-create><label class="tp-field">新分类名称<input name="name" maxlength="40" required placeholder="例如：摄影剪辑、企业培训"></label><button class="tp-button tp-primary" type="submit">创建分类</button></form><p class="tp-error" data-category-error role="alert" hidden></p><div data-category-list></div></div>`);
  const render=()=>{element.querySelector('[data-category-list]').innerHTML=categories.map(category=>`<form class="tp-category-row" data-category-id="${escape(category.id)}"><label><span>${items.filter(item=>item.category===category.id).length} 篇教程</span><input name="name" required maxlength="40" aria-label="分类名称" value="${escape(category.name)}"></label><button type="submit" class="tp-button">保存名称</button></form>`).join('')};render();
  element.onsubmit=async event=>{event.preventDefault();const form=event.target;const button=event.submitter;button.disabled=true;const note=element.querySelector('[data-category-error]');try{const id=form.dataset.categoryId;const name=new FormData(form).get('name');await api(`/api/admin/tutorial-categories${id?`/${encodeURIComponent(id)}`:''}`,{method:id?'PATCH':'POST',body:JSON.stringify({name})});await load();render();if(!id)form.reset();note.hidden=false;note.textContent=id?'分类名称已保存':'分类已创建';list()}catch(failure){note.hidden=false;note.textContent=failure.message}finally{button.disabled=false}};
 }
 async function click(event){
  const button=event.target.closest('[data-tp]');if(!button)return;const action=button.dataset.tp;
  if((busy||saving)&&!['preview'].includes(action)){error(saving?'教程正在保存，请稍候。':'图片仍在上传，请稍候。');return}
  try{
   if(action==='new')return edit();
   if(action==='edit')return edit(items.find(item=>item.id===button.dataset.id));
   if(action==='read')return preview(items.find(item=>item.id===button.dataset.id));
   if(action==='categories')return manageCategories();
   if(action==='delete'||action==='unpublish'){
    const item=items.find(entry=>entry.id===button.dataset.id);if(!item)return;
    const message=action==='delete'?`确定删除“${item.title}”？此操作无法撤回。`:`确定下架“${item.title}”？客户端将不再展示。`;
    if(!confirm(message))return;button.disabled=true;
    try{await api(`/api/admin/tutorials/${encodeURIComponent(item.id)}${action==='unpublish'?'/status':''}`,{method:action==='unpublish'?'POST':'DELETE',...(action==='unpublish'?{body:JSON.stringify({status:'unpublished'})}:{})});await load();list()}finally{button.disabled=false}return;
   }
   if(action==='back'){if(canLeave())list();return}
   if(action==='preview')return preview(payload());
   if(action==='toggle-category'){$('[data-inline-category]').hidden=!$('[data-inline-category]').hidden;return}
   if(action==='create-inline-category'){
    button.disabled=true;try{const category=await api('/api/admin/tutorial-categories',{method:'POST',body:JSON.stringify({name:$('[data-category-name]').value})});categories.push(category);$('[name=category]').innerHTML=options(category.id);$('[data-inline-category]').hidden=true;changed();error('')}finally{button.disabled=false}return;
   }
   if(action==='add-step'){const container=$('[data-steps]');if(container.children.length>=30)throw new Error('最多添加 30 个步骤');container.insertAdjacentHTML('beforeend',stepEditor({},container.children.length));changed();return}
   if(action.startsWith('step-')||action==='remove-step'){
    const node=button.closest('[data-tp-step]');if(action==='remove-step')node.remove();else if(action==='step-up'&&node.previousElementSibling)node.previousElementSibling.before(node);else if(action==='step-down'&&node.nextElementSibling)node.nextElementSibling.after(node);
    root.querySelectorAll('[data-step-number]').forEach((label,index)=>label.textContent=`步骤 ${index+1}`);changed();return;
   }
   if(action==='remove-image'){button.closest('[data-image-url]').remove();changed();return}
   if(action==='image-up'){const node=button.closest('[data-image-url]');if(node.previousElementSibling)node.previousElementSibling.before(node);changed();return}
  }catch(failure){error(failure.message)}
 }
 async function submit(event){
  if(event.target.id!=='tpTutorialForm')return;event.preventDefault();if(saving)return;if(busy){error('请等待图片上传完成再保存。');return}saving=true;
  const buttons=[...event.target.querySelectorAll('button[type=submit]')];buttons.forEach(button=>button.disabled=true);
  try{
   const draft=payload(event.submitter?.value||'draft');
   if(!draft.body&&!draft.images.length&&!draft.steps.length)throw new Error('请填写教程正文、添加步骤或上传图片。');
   if(draft.steps.some(step=>!step.title||!step.body))throw new Error('请补全每个步骤的标题和说明，或移除不需要的空步骤。');
   if(draft.action&&!draft.action.label)throw new Error('请填写快捷按钮文字，或将快捷入口改为“不设置”。');
   if(current.status==='published'&&draft.status==='draft'&&!confirm('保存为草稿会暂时从客户端隐藏这篇已发布教程，确定吗？'))return;
   current=await api(`/api/admin/tutorials${current.id?`/${encodeURIComponent(current.id)}`:''}`,{method:current.id?'PATCH':'POST',body:JSON.stringify(draft)});dirty=false;await load();list();
   const note=$('[data-tp-error]');note.hidden=false;note.className='tp-success';note.textContent=draft.status==='published'?'教程已发布，客户端重新打开教程后可见。':'草稿已保存，尚未发布到客户端。';
  }catch(failure){error(failure.message)}finally{saving=false;buttons.forEach(button=>button.disabled=false)}
 }
 return {mount,canLeave,dispose};
})();
