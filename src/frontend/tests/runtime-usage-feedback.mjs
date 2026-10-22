import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {chromium,expect as baseExpect} from '@playwright/test';
const expect=baseExpect.configure({timeout:30000});
const base=process.env.AE_TEST_URL,org=process.env.AE_TEST_ORG,out=process.env.AE_TEST_OUTPUT;
assert(base?.startsWith('http://127.0.0.1:')&&org&&out,'Explicit loopback disposable controller required');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.AE_TEST_BROWSER_EXECUTABLE||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({baseURL:base,viewport:{width:1440,height:980},reducedMotion:'reduce'});
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const key=(await readFile(path.join(org,'.state/owner.key'),'utf8')).trim();
async function call(url,data,method=data===undefined?'GET':'POST'){
 const response=await context.request.fetch('/api'+url,{method,...(data===undefined?{}:{data})});
 assert(response.ok(),method+' '+url+': '+response.status());return response.json();
}
const toasts=()=>page.locator('.action-toast:not([data-ending-style])');
async function dismiss(){while(await toasts().count()){const title=await toasts().first().locator('[data-slot="toast-title"]').textContent();const target=toasts().filter({has:page.getByText(title,{exact:true})});await target.first().getByRole('button',{name:'Dismiss notification'}).click();await expect(target).toHaveCount(0);}}

function check(name){checks.push(name);console.log('PASS '+name);}
async function settled(){await expect(page.getByRole('navigation',{name:'Groups',exact:true})).toHaveAttribute('aria-busy','false');}
try{
 await page.goto('/groups/general/chat');await page.getByLabel('Owner key',{exact:true}).fill('invalid-local-key');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(toasts().filter({hasText:'owner key is not valid'})).toHaveCount(1);await expect(page.locator('.login-error')).toHaveCount(0);check('Rejected login has one toast and preserved login form');
 await page.getByLabel('Owner key',{exact:true}).fill(key);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('button',{name:'Group options'})).toBeVisible();await expect(toasts()).toHaveCount(0);
 const start=await call('/state');assert.equal(start.runs.length,0);await call('/preferences/groups',{sort:'custom',pinned:[],order:[],sections:[],collapsed:[]},'PUT');await page.reload();await expect(page.getByRole('button',{name:'Group options'})).toBeVisible();
 let puts=0,heldResolve,heldSeenResolve;let held=new Promise(r=>heldResolve=r),seen=new Promise(r=>heldSeenResolve=r);
 const gate=async route=>{if(route.request().method()==='PUT'){puts++;if(puts===1){heldSeenResolve();await held;} }await route.continue();};
 await page.route('**/api/preferences/groups',gate);
 await page.getByRole('button',{name:'Collapse All groups',exact:true}).click();await seen;
 await expect(page.getByRole('button',{name:'Expand All groups',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Expand All groups',exact:true}).click();await page.getByRole('button',{name:'Collapse All groups',exact:true}).click();assert.equal(puts,1);
 heldResolve();await settled();await expect.poll(async()=> (await call('/state')).group_preferences.collapsed.includes('all')).toBe(true);await expect(toasts()).toHaveCount(0);await page.unroute('**/api/preferences/groups',gate);check('Immediate latest sidebar intent persists serially without success toast');
 await page.getByRole('button',{name:'Expand All groups',exact:true}).click();await settled();
 let noops=0;const counter=async route=>{if(route.request().method()==='PUT')noops++;await route.continue();};await page.route('**/api/preferences/groups',counter);
 await page.getByRole('button',{name:'Move General to section'}).click();await page.getByRole('menuitem',{name:'All groups',exact:true}).click();
 await page.getByRole('button',{name:'Group options'}).click();await page.getByRole('menuitem',{name:'A-Z',exact:true}).click();await settled();const previous=noops;
 await page.getByRole('button',{name:'Group options'}).click();await page.getByRole('menuitem',{name:'A-Z',exact:true}).click();await expect(page.getByRole('menuitem',{name:'A-Z',exact:true})).toHaveCount(0);assert.equal(noops,previous);await expect(toasts()).toHaveCount(0);await page.unroute('**/api/preferences/groups',counter);check('Same placement and sort are no-op writes');
 await page.getByRole('button',{name:'Pin General',exact:true}).click();await settled();await page.getByRole('button',{name:'Unpin General',exact:true}).click();await settled();await expect(toasts()).toHaveCount(0);check('Pin and unpin remain quiet');
 let failRead=false,savedPuts=0;const saveThenFail=async route=>{if(route.request().method()==='PUT'){savedPuts++;const res=await route.fetch();assert(res.ok());failRead=true;return route.fulfill({response:res});}return route.continue();};
 const readFault=route=>failRead&&route.request().method()==='GET'?route.abort('failed'):route.continue();
 await page.route('**/api/preferences/groups',saveThenFail);await page.route('**/api/state',readFault);
 await page.getByRole('button',{name:'Collapse Pinned',exact:true}).click();await expect(toasts().filter({hasText:'Preferences saved, but the view could not refresh'})).toHaveCount(1);
 await page.getByRole('button',{name:'Collapse navigation',exact:true}).click();await page.getByRole('button',{name:'Expand navigation',exact:true}).click();await expect(page.getByRole('button',{name:'Retry refresh',exact:true})).toBeVisible();
 failRead=false;await page.getByRole('button',{name:'Retry refresh',exact:true}).click();await settled();assert.equal(savedPuts,1);await page.unroute('**/api/state',readFault);await page.unroute('**/api/preferences/groups',saveThenFail);await dismiss();check('Acknowledged save recovery survives sidebar hide/show without mutation replay');
 for(const acknowledged of [false,true]){
  const before=(await call('/state')).group_preferences;let writes=0;
  const loss=async route=>{if(route.request().method()==='PUT'){writes++;if(acknowledged){const response=await route.fetch();assert(response.ok());}return route.abort('failed');}return route.continue();};
  await page.route('**/api/preferences/groups',loss);
  const toggle=page.getByRole('button',{name:before.collapsed.includes('pinned')?'Expand Pinned':'Collapse Pinned',exact:true});await toggle.click();
  await expect(toasts().filter({hasText:'Preference save could not be confirmed'})).toHaveCount(1);await expect(page.getByRole('button',{name:'Retry refresh',exact:true})).toBeVisible();
  await page.unroute('**/api/preferences/groups',loss);const server=(await call('/state')).group_preferences;
  assert.equal(server.collapsed.includes('pinned'),acknowledged?!before.collapsed.includes('pinned'):before.collapsed.includes('pinned'));
  await page.getByRole('button',{name:'Retry refresh',exact:true}).click();await settled();assert.equal(writes,1);await expect(page.getByRole('button',{name:server.collapsed.includes('pinned')?'Expand Pinned':'Collapse Pinned',exact:true})).toBeEnabled();await dismiss();
  check(acknowledged?'Lost preference acknowledgement reconciles by read without another PUT':'Failure before preference save restores the confirmed server baseline');
 }
 await page.getByRole('button',{name:'Add group or section'}).click();await page.getByRole('menuitem',{name:'Create section',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Create section',exact:true});await dialog.getByLabel('Section name').fill('Pinned');await dialog.getByRole('button',{name:'Save section',exact:true}).click();await expect(toasts()).toHaveCount(1);await expect(dialog.getByLabel('Section name')).toHaveValue('Pinned');await expect(dialog.locator('.action-result')).toHaveCount(0);await dismiss();
 await dialog.getByLabel('Section name').fill('Acceptance section');await dialog.getByRole('button',{name:'Save section',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(toasts().filter({hasText:'Section saved.'})).toHaveCount(1);await dismiss();check('Rejected explicit section keeps draft and retry succeeds with one toast');
 let sectionPutCount=0,releaseSection,sectionSeen;const sectionHold=new Promise(r=>releaseSection=r),sectionReceived=new Promise(r=>sectionSeen=r);
 const sectionGate=async route=>{if(route.request().method()==='PUT'&&++sectionPutCount===1){sectionSeen();await sectionHold;}await route.continue();};
 await page.route('**/api/preferences/groups',sectionGate);await page.getByRole('button',{name:'Section options for Acceptance section',exact:true}).click();await page.getByRole('menuitem',{name:'Remove section',exact:true}).click();await sectionReceived;
 await page.getByRole('button',{name:'Collapse All groups',exact:true}).click();releaseSection();await settled();await expect(toasts().filter({hasText:'Section removed. Its groups are still available.'})).toHaveCount(1);assert.equal(sectionPutCount,2);await page.unroute('**/api/preferences/groups',sectionGate);await dismiss();check('Explicit section removal retains its success feedback when a quiet preference follows');
 const draft=page.getByRole('textbox',{name:'Message',exact:true});await draft.fill('/unknown-acceptance');await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(toasts().filter({hasText:'Message rejected:'})).toHaveCount(1);await expect(draft).toHaveValue('/unknown-acceptance');await expect(page.locator('.action-result')).toHaveCount(0);await dismiss();check('Chat rejection preserves safe backend detail in one toast');
 let droppedId=null;const drop=async route=>{if(route.request().method()==='POST'){droppedId=route.request().postDataJSON().id;const res=await route.fetch();assert(res.ok());return route.abort('failed');}return route.continue();};await page.route('**/api/messages',drop);
 await draft.fill('/usage');await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(toasts().filter({hasText:'Message acceptance could not be confirmed'})).toHaveCount(1);await expect(draft).toHaveValue('/usage');await page.unroute('**/api/messages',drop);await dismiss();
 await page.getByRole('button',{name:'Send message',exact:true}).click();await expect(draft).toHaveValue('');await expect.poll(async()=> (await call('/groups/general/messages')).filter(m=>m.id===droppedId).length).toBe(1);check('Lost accepted response retries original request ID exactly once');
 await expect(page.getByText('Usage inspection complete',{exact:true}).first()).toBeVisible();await page.screenshot({path:path.join(out,'usage-and-sidebar.png'),fullPage:true});await dismiss();
 await page.reload();await expect(page.getByRole('button',{name:'Group options'})).toBeVisible();await expect(page.getByText('Usage inspection complete',{exact:true}).first()).toBeVisible();await expect(toasts()).toHaveCount(0);check('Historical usage and passive refresh do not replay notifications');
 await page.getByRole('button',{name:'Collapse navigation',exact:true}).click();await expect(page.getByRole('button',{name:'Expand navigation',exact:true})).toBeVisible();await page.getByRole('button',{name:'Expand navigation',exact:true}).click();
 await page.evaluate(()=>{document.documentElement.style.zoom='2';});await expect(page.getByRole('button',{name:'Group options'})).toBeVisible();await page.screenshot({path:path.join(out,'zoom-reduced-motion.png'),fullPage:true});await page.evaluate(()=>{document.documentElement.style.zoom='';});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});check('Rail and zoom/reduced-motion/mobile render without page errors');
 assert.deepEqual(errors,[]);assert.equal((await call('/state')).runs.length,0);await writeFile(path.join(out,'receipt.json'),JSON.stringify({checks,pageErrors:errors,providerRuns:0,productionAccess:false},null,2));
}catch(error){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(out,'failure.json'),JSON.stringify({checks,pageErrors:errors,error:String(error),toasts:await toasts().evaluateAll(elements=>elements.map(element=>({text:element.textContent,attributes:Array.from(element.attributes).map(a=>[a.name,a.value])})))},null,2));throw error;}finally{await browser.close();}
