import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire('/app/package.json');
const {Pool}=require('pg');
const base='http://127.0.0.1:8080';
let token='';
async function call(url,method='GET',body,auth=true,expected=200){
  const multipart=body instanceof FormData;
  const response=await fetch(base+url,{method,signal:AbortSignal.timeout(15000),headers:{...(auth&&token?{authorization:`Bearer ${token}`} :{}),...(body!==undefined&&!multipart?{'content-type':'application/json'}:{})},body:body===undefined?undefined:multipart?body:JSON.stringify(body)});
  assert.equal(response.status,expected,`${method} ${url}: HTTP ${response.status}`);
  return response;
}
const login=await call('/api/auth/login','POST',{identifier:process.env.ADMIN_EMAIL,password:process.env.ADMIN_PASSWORD},false);
token=(await login.json()).token;
assert.ok(token);
const categories=await (await call('/api/admin/tutorial-categories')).json();
assert.ok(categories.items.some(x=>x.id==='getting-started'));
assert.ok(Array.isArray((await (await call('/api/tutorials')).json()).items));
if(process.env.PRODUCTION_CHECK_ONLY==='1'){
  assert.ok(Array.isArray((await (await call('/api/admin/tutorials')).json()).items));
  for(const file of ['tutorial-publisher.js','tutorial-publisher.css'])assert.ok((await (await call('/admin/'+file)).text()).length>100);
  console.log('PRODUCTION_TUTORIAL_READONLY_OK');
}else{
  assert.equal(process.env.SHANMAN_ISOLATED_TEST,'1','Mutating tests are isolated-only');
  const db=new Pool({connectionString:process.env.DATABASE_URL});
  const client=await db.connect();
  try{
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA tutorial_legacy_probe');
    await client.query('SET LOCAL search_path TO tutorial_legacy_probe,public');
    await client.query(await fs.readFile('/app/migrations/010_tutorials.sql','utf8'));
    await client.query("INSERT INTO tutorial_legacy_probe.tutorials(slug,category,title) VALUES('legacy-probe','old-custom-category','legacy preserved')");
    await client.query(await fs.readFile('/app/migrations/011_tutorial_categories_images.sql','utf8'));
    const row=(await client.query("SELECT t.title,t.body,c.name FROM tutorial_legacy_probe.tutorials t JOIN tutorial_legacy_probe.tutorial_categories c ON c.id=t.category WHERE t.slug='legacy-probe'")).rows[0];
    assert.equal(row.title,'legacy preserved');assert.equal(row.body,'');assert.equal(row.name,'old-custom-category');
  }finally{await client.query('ROLLBACK');client.release();await db.end()}
  const category=await (await call('/api/admin/tutorial-categories','POST',{name:'隔离验收分类'},true,201)).json();
  await call('/api/admin/tutorial-categories','POST',{name:'隔离验收分类'},true,409);
  await call(`/api/admin/tutorial-categories/${category.id}`,'PATCH',{name:'隔离验收图文分类'});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7XcAAAAASUVORK5CYII=','base64');
  const form=new FormData();form.append('image',new Blob([png],{type:'image/png'}),'check.png');
  const image=await (await call('/api/admin/tutorial-images','POST',form,true,201)).json();
  await call(image.url,'GET',undefined,false,404);
  const adminImage=await call(image.url.replace('/api/','/api/admin/'));
  assert.deepEqual(Buffer.from(await adminImage.arrayBuffer()),png);
  const draft={slug:'isolated-tutorial-probe',category:category.id,title:'图文教程验收',summary:'真实 PostgreSQL 与 HTTP',body:'第一段\n第二段 😃',images:[{url:image.url,caption:'中文配图'}],steps:[{title:'步骤一',body:'步骤内容',images:[{url:image.url,caption:'步骤配图'}]}],preparation:['准备材料'],completion:['完成标准'],tips:['注意事项'],action:{label:'打开设置',target:'settings'},status:'draft'};
  const item=await (await call('/api/admin/tutorials','POST',draft,true,201)).json();
  assert.deepEqual(item.steps,draft.steps);assert.deepEqual(item.images,draft.images);
  assert.equal((await (await call('/api/tutorials')).json()).items.length,0);
  await call(`/api/admin/tutorials/${item.id}/status`,'POST',{status:'published'});
  const published=await (await call('/api/tutorials','GET',undefined,false)).json();
  assert.equal(published.items[0].body,draft.body);assert.equal(published.categories[0].name,'隔离验收图文分类');
  const publicImage=await call(image.url,'GET',undefined,false);assert.equal(publicImage.headers.get('cache-control'),'no-store');
  assert.deepEqual(Buffer.from(await publicImage.arrayBuffer()),png);
  await call(`/api/admin/tutorials/${item.id}`,'PATCH',{body:'修改后正文',images:[]});
  await call(image.url,'GET',undefined,false);
  await call(`/api/admin/tutorials/${item.id}/status`,'POST',{status:'unpublished'});
  await call(image.url,'GET',undefined,false,404);
  await call('/api/admin/tutorials','GET',undefined,false,401);
  await call('/api/admin/tutorial-images','POST',form,false,401);
  const invalid=new FormData();invalid.append('image',new Blob(['<svg/>'],{type:'image/svg+xml'}),'invalid.svg');
  await call('/api/admin/tutorial-images','POST',invalid,true,415);
  const large=new FormData();large.append('image',new Blob([png,Buffer.alloc(8*1024*1024)],{type:'image/png'}),'large.png');
  await call('/api/admin/tutorial-images','POST',large,true,413);
  await call(`/api/admin/tutorials/${item.id}`,'DELETE');
  await call(image.url,'GET',undefined,false,404);
  assert.equal((await (await call('/api/tutorials')).json()).items.length,0);
  console.log('ISOLATED_TUTORIAL_E2E_OK migrations legacy-category jsonb category-create-rename image-auth publish edit unpublish delete invalid-image upload-limit');
}
