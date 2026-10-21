import { chromium } from '/home/claude/sdeath-scythe/tripguide/node_modules/playwright/index.mjs';
const url='file:///home/claude/sdeath-scythe/tripguide/dist/demo/index.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const routes={guest:['/','/guides','/guides/2','/login','/register','/post'],
 tourist:['/','/guides','/guides/2','/post','/requests','/requests/74','/requests/75','/bookings','/bookings/74','/messages','/messages/73','/notifications','/wallet','/profile'],
 guide:['/','/requests','/offers','/bookings','/messages','/wallet','/profile','/profile/guide','/notifications'],
 admin:['/','/admin/verify','/admin/reports','/admin/users','/profile']};
const issues=[];const errs=[];
for(const lang of ['en','ar']){
 for(const role of Object.keys(routes)){
  const ctx=await b.newContext({viewport:{width:360,height:740},deviceScaleFactor:1,hasTouch:true,isMobile:true});
  const p=await ctx.newPage();p.on('pageerror',e=>errs.push(lang+' '+role+' '+e.message));
  await p.goto(url+'#/login');await p.evaluate(l=>{localStorage.clear();localStorage.setItem('tg.lang',l)},lang);await p.reload();await p.waitForTimeout(500);
  if(role!=='guest'){await p.locator('.demo-trigger').click();await p.locator('.demo-pick').nth({tourist:0,guide:1,admin:2}[role]).click();await p.locator('.demo-go').click();await p.waitForTimeout(700);}
  for(const r of routes[role]){
   await p.goto(url+'#'+r);await p.waitForTimeout(500);
   const res=await p.evaluate(()=>{const W=innerWidth;const out=[];
     if(document.documentElement.scrollWidth>W+1)out.push('PAGE scrollWidth '+document.documentElement.scrollWidth);
     for(const el of document.querySelectorAll('main *, .topbar *, .tabbar *')){const rc=el.getBoundingClientRect();if(rc.width===0)continue;
       let sc=false;for(let a=el.parentElement;a;a=a.parentElement){const cs=getComputedStyle(a);if(/(auto|scroll|hidden|clip)/.test(cs.overflowX)&&a!==document.body&&a!==document.documentElement){sc=true;break}}
       if(!sc&&(rc.right>W+1||rc.left<-1))out.push(el.tagName.toLowerCase()+'.'+(el.className||'').toString().slice(0,30)+' '+Math.round(rc.left)+'..'+Math.round(rc.right));}
     return out.slice(0,4)});
   if(res.length)issues.push(`${lang} ${role} ${r}: ${res.join(' | ')}`);
  }
  await ctx.close();
 }}
console.log(issues.length?issues.join('\n'):'NO OVERFLOW');console.log('errors',errs);
await b.close();
