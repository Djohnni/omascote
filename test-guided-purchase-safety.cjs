// Shared local-only assertions. The callers intercept every remote API and order request.
const assert = require('node:assert/strict');
const path = require('node:path');

async function assertPurchaseSafety(test, settings) {
  const {form, assertLayout, screenshots, name, capture = false, draft} = settings;
  const disclosure = form.locator('details.guided-purchase-safety');
  assert.equal(await disclosure.count(), 1, 'final payment step has one inline purchase disclosure');
  const summary = disclosure.locator(':scope > summary');
  assert.equal(await summary.count(), 1, 'native details has one direct summary');
  assert.equal(await summary.innerText(), 'Clique aqui caso queira saber se é seguro comprar');
  assert.equal(await disclosure.evaluate(node => node.open), false, 'purchase information starts collapsed');

  const order = await disclosure.evaluate(node => {
    const previous = node.previousElementSibling, next = node.nextElementSibling;
    return {
      followsSend: previous?.matches('button.guided-primary') && previous.getAttribute('aria-label') === 'Enviar pedido',
      precedesReview: next?.matches('.guided-review'),
      gap: node.getBoundingClientRect().top - previous?.getBoundingClientRect().bottom,
      contentFirst: node.firstElementChild?.tagName === 'SUMMARY',
      customSubmitControls: node.querySelectorAll('button,input,select,textarea,form').length
    };
  });
  assert.equal(order.followsSend, true, 'disclosure is the next DOM sibling directly below Enviar pedido');
  assert.equal(order.precedesReview, true, 'review remains the next DOM sibling below the disclosure');
  assert.ok(order.gap >= 0 && order.gap <= 30, 'disclosure is visually adjacent to Enviar pedido');
  assert.equal(order.contentFirst, true, 'summary is the native disclosure trigger');
  assert.equal(order.customSubmitControls, 0, 'purchase copy does not introduce submission controls');

  const content = disclosure.locator('.guided-purchase-safety-content');
  assert.equal(await content.count(), 1);
  assert.equal(await content.isVisible(), false, 'closed details hides the longer explanation');
  const copy = await content.textContent();
  assert.equal(await content.locator('ol > li').count(), 5, 'all five purchase assurances appear');
  assert.equal(await content.locator('ol').evaluate(node => getComputedStyle(node).listStyleType), 'decimal', 'all five assurances keep visible numbering');
  for (const [pattern, description] of [
    [/WhatsApp[\s\S]*demonstração[\s\S]*antes[\s\S]*finalizar/i, 'WhatsApp demonstration is available before completing the request'],
    [/tempo de espera é maior[\s\S]*R\$\s*38(?:[,.]00)?[\s\S]*trabalho adicional/i, 'manual WhatsApp option states its longer wait, R$ 38 price and added work'],
    [/Instagram[\s\S]*@ia4tube[\s\S]*publicações[\s\S]*comentários positivos[\s\S]*times de futebol/i, 'Instagram profile and customer comments are stated'],
    [/erro na imagem ou no vídeo[\s\S]*WhatsApp[\s\S]*Corrigimos sem custo adicional/i, 'image and video errors can be corrected through WhatsApp without extra cost'],
    [/QR Code do Pix[\s\S]*CNPJ[\s\S]*mais de 10 anos/i, 'Pix CNPJ age is stated'],
    [/mais de 5 mil mascotes[\s\S]*último ano/i, 'last-year delivery volume is stated'],
    [/vídeo[\s\S]*cerca de 4 minutos[\s\S]*outros produtos/i, 'approximate video wait includes the other-products invitation'],
    [/Obrigado,[\s\S]*Direção IA4TUBE/i, 'company signoff is preserved']
  ]) assert.match(copy, pattern, description);

  const before = {
    orders:test.orderCount(), pix:test.pixCount(), messages:await test.messages(),
    draft:structuredClone(draft())
  };
  async function checkState(open) {
    assert.equal(await disclosure.evaluate(node => node.open), open, 'native disclosure toggles as requested');
    assert.equal(await content.isVisible(), open);
    await assertLayout();
    const bounds = await disclosure.evaluate(node => {
      const rect = node.getBoundingClientRect();
      return {left:rect.left, right:rect.right, viewport:innerWidth, width:rect.width,
        overflow:document.documentElement.scrollWidth > innerWidth,
        overflowingChildren: [...node.querySelectorAll('*')].filter(child => {
          const r = child.getBoundingClientRect();
          return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
        }).map(child => child.tagName)};
    });
    assert.ok(bounds.width > 0 && bounds.left >= -1 && bounds.right <= bounds.viewport + 1,
      'purchase disclosure stays inside mobile and desktop viewports');
    assert.equal(bounds.overflow, false, 'purchase disclosure causes no horizontal overflow');
    assert.deepEqual(bounds.overflowingChildren, [], 'expanded copy does not overflow the viewport');
  }

  await checkState(false);
  if (capture) {
    await test.page.screenshot({path:path.join(screenshots,`${name}-purchase-safety-closed.png`),fullPage:true});
    await test.page.screenshot({path:path.join(screenshots,`${name}-purchase-safety-closed-viewport.png`),fullPage:false});
  }
  await summary.click();
  await checkState(true);
  if (capture) await test.page.screenshot({path:path.join(screenshots,`${name}-purchase-safety-open.png`),fullPage:true});
  await summary.click();
  await checkState(false);
  await summary.focus();
  assert.equal(await summary.evaluate(node => node === document.activeElement), true, 'summary receives keyboard focus');
  await summary.press('Enter');
  await checkState(true);
  await summary.press('Enter');
  await checkState(false);
  await summary.press('Space');
  await checkState(true);
  await summary.press('Space');
  await checkState(false);

  assert.equal(test.orderCount(), before.orders, 'clicks and keyboard toggles never create an order');
  assert.equal(test.pixCount(), before.pix, 'clicks and keyboard toggles never create Pix');
  assert.deepEqual(await test.messages(), before.messages, 'disclosure never invokes the parent order bridge');
  assert.deepEqual(draft(), before.draft, 'disclosure never changes answers, prices, delivery or uploads');
  assert.deepEqual(test.errors, [], 'purchase disclosure has no runtime errors');
}

module.exports = {assertPurchaseSafety};
