'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.setContent('<html><body><header class="vitrineHeader">O Mascote</header><div id="accountMenuPanel"><section id="weeklyPlanAccountCard"></section></div><button id="btnSair">Sair</button></body></html>');
    await page.evaluate(() => {
      const values = new Map([['omascote_token','admin-test-token']]);
      Object.defineProperty(window,'localStorage',{value:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}});
      window.testRequests = [];
      window.testResponse = {ok:true,bonus:{granted:true,active:true,limit:5,remaining:5},grant:{replayed:false},account:{login:'tester_one',created:true},credentials:{email:'cliente@example.com',password:'Tmp-example-long-password'}};
      window.fetch = async (url, options) => {
        window.testRequests.push({url, body:options.body ? JSON.parse(options.body) : null});
        if(window.holdRequest) return new Promise(resolve => {window.releaseRequest=()=>resolve({ok:true,json:async()=>window.testResponse});});
        return {ok:true,json:async()=>window.testResponse};
      };
    });
    await page.addStyleTag({content:fs.readFileSync(path.join(__dirname,'tester-image-bonus.css'),'utf8')});
    await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'tester-image-bonus.js'),'utf8')});
    const summary={granted:true,active:true,limit:5,remaining:5};
    await page.evaluate(b=>window.OmascoteTesterBonus.setAccount({tester_image_bonus:b}),summary);
    assert.match(await page.locator('#testerImageBonusBanner').innerText(),/5 imagens grátis/);
    assert.equal(await page.locator('[data-tester-admin]').isVisible(),false);
    await page.evaluate(b=>window.OmascoteTesterBonus.setAccount({tester_image_bonus:{...b,remaining:0}}),summary);
    assert.match(await page.locator('#testerImageBonusBanner').innerText(),/utilizou suas 5/);
    await page.evaluate(()=>window.OmascoteTesterBonus.setAccount({tester_bonus_admin:true}));
    await page.locator('[data-tester-admin] summary').click();
    await page.locator('[name=login]').fill('cliente@example.com');
    await page.locator('[name=create_account]').check();
    await page.locator('[data-tester-grant-form] button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('[data-tester-grant-message]').textContent.includes('Restam 5'));
    assert.match(await page.locator('[data-tester-credentials-text]').innerText(),/cliente@example.com/);
    const sent=await page.evaluate(()=>window.testRequests[0]);
    assert.deepEqual(sent.body,{login:'cliente@example.com',create_account:true});
    await page.evaluate(()=>{window.testResponse={ok:true,bonus_pending:true,bonus_error:'A conta foi criada, mas o bônus ficou pendente.',bonus:null,credentials:{email:'outro@example.com',password:'Tmp-second-password'}};});
    await page.locator('[data-tester-grant-form] button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('[data-tester-grant-message]').textContent.includes('pendente'));
    assert.doesNotMatch(await page.locator('[data-tester-credentials-text]').innerText(),/cliente@example.com/);
    await page.evaluate(()=>{window.testResponse={ok:true,bonus:{granted:true,active:true,limit:5,remaining:3},grant:{replayed:true},account:{login:'existing'}};});
    await page.locator('[data-tester-grant-form] button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('[data-tester-grant-message]').textContent.includes('Restam 3'));
    assert.equal(await page.locator('[data-tester-credentials]').isVisible(),false);
    await page.evaluate(()=>{window.holdRequest=true;window.testResponse={ok:true,bonus:{granted:true,active:true,limit:5,remaining:5},credentials:{email:'stale@example.com',password:'NEVER-DISPLAY-THIS'}};});
    await page.locator('[data-tester-grant-form] button[type=submit]').click();
    await page.waitForFunction(()=>typeof window.releaseRequest==='function');
    await page.evaluate(()=>{window.localStorage.removeItem('omascote_token');window.OmascoteTesterBonus.clear();window.releaseRequest();});
    await page.waitForFunction(()=>!document.querySelector('[data-tester-grant-form] button[type=submit]').disabled);
    assert.equal(await page.locator('[data-tester-credentials]').isVisible(),false);
    assert.doesNotMatch(await page.locator('body').innerText(),/NEVER-DISPLAY-THIS/);
    await page.evaluate(()=>{window.holdRequest=false;window.localStorage.setItem('omascote_token','customer-test-token');window.testResponse={ok:true};window.OmascoteTesterBonus.setAccount({senha_temporaria:true});});
    await page.locator('[name=current_password]').fill('Tmp-old-password');
    await page.locator('[name=new_password]').fill('NovaSenha-123456');
    await page.locator('[data-tester-password-form] button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('[data-tester-password-form]').hidden);
    const last=await page.evaluate(()=>window.testRequests.at(-1));
    assert.match(last.url,/auth\/change-password$/);
    assert.equal(last.body.new_password,'NovaSenha-123456');
    assert.equal(await page.locator('[name=new_password]').inputValue(),'');
    for(const width of [390,768,1440]){
      await page.setViewportSize({width,height:900});
      await page.evaluate(()=>window.OmascoteTesterBonus.setAccount({tester_bonus_admin:true,tester_image_bonus:{granted:true,active:true,limit:5,remaining:4}}));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    }
    console.log('PASS tester bonus UI: count, admin guard, grant, repeat, pending quota, stale response, temporary password, responsive layout.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

