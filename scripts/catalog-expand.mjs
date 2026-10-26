// Developer-time importer. Auctions use only the reviewed, local output manifest.
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
const root = path.resolve(import.meta.dirname, "..");
const seeds = JSON.parse(await fs.readFile(path.join(root,"src/catalog/expansion-seeds.json"),"utf8"));
const review = JSON.parse(await fs.readFile(path.join(root,"src/catalog/photo-review.json"),"utf8"));
const cache = path.join(root, ".local/catalog-import");
await fs.mkdir(cache,{recursive:true});
await fs.mkdir(path.join(root,"public/products"),{recursive:true});
const headers={"User-Agent":"BlackMarketCatalog/2.0 (local collectible game; licensed Commons photography; metadata and attribution retained)"};
async function get(url) {
  let error;
  for(let attempt=0;attempt<4;attempt++){
    try {
      const response=await fetch(url,{headers,signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw new Error("HTTP "+response.status);
      return await response.json();
    } catch(e){error=e;if(attempt<3)await new Promise(r=>setTimeout(r,1500*(attempt+1)));}
  }
  throw error;
}
async function cached(name,url){
  const p=path.join(cache,name+".json");
  try{return JSON.parse(await fs.readFile(p,"utf8"))}catch{}
  const d=await get(url);await fs.writeFile(p,JSON.stringify(d));await new Promise(r=>setTimeout(r,400));return d;
}
function api(host,params){return "https://"+host+"/w/api.php?"+new URLSearchParams({action:"query",format:"json",...params})}
const pageMap=new Map;
for(let start=0;start<seeds.length;start+=30){
  const batch=seeds.slice(start,start+30);
  const data=await cached("pages-"+start,api("en.wikipedia.org",{prop:"pageimages",titles:batch.map(s=>s.title).join("|"),piprop:"name|original",pilicense:"free",redirects:"1",pilimit:"50"}));
  const pages=Object.values(data.query?.pages??{});
  const normalized=new Map((data.query?.normalized??[]).map(x=>[x.from,x.to]));
  const redirects=new Map((data.query?.redirects??[]).map(x=>[x.from,x.to]));
  for(const seed of batch){
    let title=normalized.get(seed.title)??seed.title;title=redirects.get(title)??title;
    const page=pages.find(p=>p.title===title);
    if(page?.pageimage&&page.original?.source?.includes("/commons/")&&/\.(jpg|jpeg|png|webp)$/i.test(page.pageimage)&&page.original.width>=300&&page.original.height>=180)pageMap.set(seed.id,{...page,canonicalTitle:title});
  }
  console.log("Researched",Math.min(start+30,seeds.length),"/",seeds.length);
}
const images=[...new Set([...pageMap.values()].map(p=>"File:"+p.pageimage))];
const infoMap=new Map;
for(let start=0;start<images.length;start+=25){
  const data=await cached("licenses-"+start,api("en.wikipedia.org",{prop:"imageinfo",titles:images.slice(start,start+25).join("|"),iiprop:"url|extmetadata|size",iiurlwidth:"960"}));
  for(const p of Object.values(data.query?.pages??{})){const info=p.imageinfo?.[0];if(info)infoMap.set(p.title.replaceAll("_"," ").toLowerCase(),info);}
  console.log("Checked licenses",Math.min(start+25,images.length),"/",images.length);
}
function plain(s=""){return s.replace(/<[^>]*>/g,"").replaceAll("&amp;","&").replaceAll("&quot;",'"').replaceAll("&#039;","'").replaceAll("&nbsp;"," ").trim();}
const excluded=new Set(["pentax-k-1000","leatherman-pst","lego-technic-8860","lego-mindstorms-rcx","korg-volca-beats"]);
const accepted=[],rejected=[];
for(const seed of seeds){
  const p=pageMap.get(seed.id), info=p&&infoMap.get(("File:"+p.pageimage).replaceAll("_"," ").toLowerCase()), meta=info?.extmetadata??{};
  const license=plain(meta.LicenseShortName?.value),artist=plain(meta.Artist?.value);
  if(!review.approved.includes(seed.id)||excluded.has(seed.id)||!p||!info||!artist||!(/^(Public domain|CC0|CC BY(?:-SA)? [\d.]+)$/i.test(license))||/logo|signature|wordmark|diagram|flag of/i.test(p.pageimage)){
    rejected.push({id:seed.id,reason:excluded.has(seed.id)?"Specific model not established by the source":!p?"No usable model photograph":!info?"No Commons metadata":"Photo license or identity needs review",file:p?.pageimage,license});continue;
  }
  accepted.push({...seed,year:"Standard model",description:seed.brand+" "+seed.model+". Reference photography identifies the model; included accessories and condition are specified for each fictional lot.",completeness:"Item and essential operating accessories; no retail packaging",rationale:"Curated fictional-dollar baseline for a standard used "+seed.brand+" "+seed.model+". Selected for game balance; not an observed transaction, live quote, or guaranteed resale value.",identitySource:"https://en.wikipedia.org/wiki/"+encodeURIComponent(p.canonicalTitle.replaceAll(" ","_")),image:{title:"File:"+p.pageimage,url:info.url.split("?")[0],source:info.descriptionurl,description:plain(meta.ImageDescription?.value).slice(0,400),artist,license,licenseUrl:meta.LicenseUrl?.value??"",thumbnail:info.thumburl?.split("?")[0]}});
}
let next=0;const ready=[],failures=[];
async function worker(){
  while(next<accepted.length){
    const p=accepted[next++],out=path.join(root,"public/products",p.id+".webp");
    try{
      try{await fs.access(out)}catch{
        const original=new URL(p.image.url),filename=original.pathname.split("/").at(-1);
        const thumbnail=p.image.thumbnail??("https://upload.wikimedia.org"+original.pathname.replace("/commons/","/commons/thumb/")+"/960px-"+filename);
        let response=await fetch(thumbnail.replace("upload.wikimedia.org","thumb.wikimedia.org"),{headers,signal:AbortSignal.timeout(30000)});
        if(!response.ok)response=await fetch(p.image.url,{headers,signal:AbortSignal.timeout(30000)});
        if(!response.ok)throw Error("Image HTTP "+response.status);
        let bytes=Buffer.from(await response.arrayBuffer());
        if(!/^image\//i.test(response.headers.get("content-type")??"") || bytes.subarray(0,100).toString().includes("<!DOCTYPE")){const originalResponse=await fetch(p.image.url,{headers,signal:AbortSignal.timeout(30000)});if(!originalResponse.ok)throw Error("Original HTTP "+originalResponse.status);bytes=Buffer.from(await originalResponse.arrayBuffer());}
        if(bytes.length>30000000)throw Error("Image exceeds 30MB import limit");
        await sharp(bytes).rotate().resize({width:1000,height:800,fit:"inside",withoutEnlargement:true}).webp({quality:83}).toFile(out);
      }
      const metadata=await sharp(out).metadata();if(!metadata.width||metadata.width<200)throw Error("Photo too small");
      delete p.image.thumbnail;ready.push(p);console.log("Ready",ready.length,"/",accepted.length,p.id);
    }catch(e){failures.push({id:p.id,error:e.message});console.error("Skipped",p.id,e.message)}
  }
}
await Promise.all([worker(),worker(),worker()]);
ready.sort((a,b)=>seeds.findIndex(s=>s.id===a.id)-seeds.findIndex(s=>s.id===b.id));
await fs.writeFile(path.join(root,"src/catalog/expanded-products.json"),JSON.stringify(ready,null,2)+"\n");
await fs.writeFile(path.join(cache,"review.json"),JSON.stringify({candidates:seeds.length,imported:ready.length,rejected,failures},null,2));
const base=JSON.parse(await fs.readFile(path.join(root,"src/catalog/products.json"),"utf8"));
await fs.writeFile(path.join(root,"public/products/valuation.json"),JSON.stringify({reviewedAt:"2026-10-26",currency:"fictional USD",note:"Curated game-design baselines, not completed transactions or live quotes.",products:[...base,...ready].map(p=>({id:p.id,brand:p.brand,model:p.model,referenceValue:p.referenceValue,rationale:p.rationale,identitySource:p.identitySource}))},null,2)+"\n");
console.log(JSON.stringify({candidates:seeds.length,imported:ready.length,rejected:rejected.length,failed:failures.length}));
