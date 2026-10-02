// Run: node tools/app-review-data-probes.mjs
// Reproduces the 2026-10-02 review findings using synthetic fetch responses.
// These assertions record current defects; they are not passing product requirements.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const web = path.join(root, 'src/Steeple.Web.v2');
const require = createRequire(path.join(web, 'package.json'));
const { build } = await import(pathToFileURL(require.resolve('vite')));
async function bundle(entry, suffix) {
  const result = await build({root:web, configFile:false, envDir:false, mode:'production',logLevel:'error',build:{write:false,minify:false,lib:{entry:path.join(web,entry),formats:['es']}}});
  const output = (Array.isArray(result)?result[0]:result).output;
  const code=output.find(x=>x.type==='chunk' && x.isEntry).code;
  return import(`data:text/javascript;base64,${Buffer.from(code+'\n//'+suffix).toString('base64')}`);
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const person={id:'review-person',displayName:'Review Person',email:'review@example.test',createdAtUtc:'2026-01-01T00:00:00Z'};
for (const status of [429,502,503]) {
  let refreshStatus=200, refreshCalls=0;
  globalThis.fetch=async(url)=>{
    if(url.endsWith('/auth/sessions')) return json({accessToken:'review-token',user:person});
    if(url.endsWith('/auth/refresh')) {refreshCalls++;return json({accessToken:'renewed-token'},refreshStatus);}
    if(url.endsWith('/me')) return json(person);
    throw Error('unexpected URL '+url);
  };
  const session=await bundle('src/data/session.js','session-'+status);
  await session.fetchCurrentUser();
  await session.signIn({email:person.email});
  refreshStatus=status;
  await assert.rejects(session.withAccess(async()=>{throw {status:401};}));
  assert.equal(session.isSignedIn(),false);
  refreshStatus=200;
  const count=refreshCalls;
  await session.fetchCurrentUser();
  assert.equal(refreshCalls,count);
  console.log(`CONFIRMED refresh ${status}: signed out, recovery suppresses further refresh attempts`);
}
let published=true,sitemapCalls=0;
const detail={roomId:'room-1',roomSlug:'hall',roomName:'Review Hall',capacity:20,pricePerHour:30,currency:'USD',activities:[],amenities:[],accessibility:[],photos:[],venue:{venueId:'venue-1',slug:'review-venue',name:'Review Venue',latitude:38.9,longitude:-77.2,suburb:'Vienna'}};
globalThis.fetch=async(url)=>{
  if(url.endsWith('/sitemap')) {sitemapCalls++;return json(published?[{venueSlug:'review-venue',roomSlug:'hall'}]:[]);}
  if(url.includes('/listings/by-slug/')) return json(published?detail:{},published?200:404);
  throw Error('unexpected URL '+url);
};
const catalog=await bundle('src/data/catalog.js','catalog-stale');
await catalog.readVenue('review-venue');
published=false;catalog.forgetVenues();
const after=await catalog.readVenue('review-venue');
assert.equal(sitemapCalls,1);
assert.equal(after.rooms[0].status,'published');
console.log('CONFIRMED catalogue after unpublish+forgetVenues: sitemap fetched only once; removed room remains published in venue roster');
let calls=0,healthy=false;
globalThis.fetch=async()=>{calls++;return healthy?json({items:[],totalCount:0}):json({},503);};
const retryCatalog=await bundle('src/data/catalog.js','catalog-retry');
await assert.rejects(retryCatalog.searchListings());
healthy=true;
const beforeRetry=calls;
await assert.rejects(retryCatalog.searchListings());
assert.equal(calls,beforeRetry);
console.log('CONFIRMED immediate catalogue Retry makes no network request after API recovery (30s shared quiet window)');
const api=await import(pathToFileURL(path.join(web,'src/data/api.js')));
for (const [name,request] of [['read',()=>api.searchListings({})],['write',()=>api.createSession({})]]) {
  const nativeTimeout=globalThis.setTimeout;
  let bodyController, wireSignal;
  globalThis.fetch=async(_url,options)=>{
    wireSignal=options.signal;
    return new Response(new ReadableStream({start(controller){bodyController=controller;}}),{status:200,headers:{'content-type':'application/json'}});
  };
  globalThis.setTimeout=(fn,ms,...args)=>nativeTimeout(fn, Math.min(ms,10),...args);
  const pending=request();
  globalThis.setTimeout=nativeTimeout;
  const outcome=await Promise.race([pending.then(()=> 'done'),new Promise(resolve=>nativeTimeout(()=>resolve('pending'),50))]);
  assert.equal(outcome,'pending');
  assert.equal(wireSignal.aborted,false);
  bodyController.enqueue(new TextEncoder().encode('{}'));bodyController.close();
  await pending;
  console.log(`CONFIRMED ${name} deadline removed at response headers; stalled JSON body remains pending past accelerated deadline`);
}
