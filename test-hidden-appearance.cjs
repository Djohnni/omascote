/* Pure presentation regression: no server, browser, real upload or paid order. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const worktree = __dirname;
const context = vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(path.join(worktree,'atendimento/guided-products.js'),'utf8'),context);
const {visibleFields,hideAppearance} = context.window.OmascoteGuidedProducts;

// This mock only models the immutable element/Children operations used by the helper.
const flatten = children => children == null ? [] : Array.isArray(children)
  ? children.flatMap(flatten) : [children];
const React = {
  isValidElement:node => !!node && node.element === true,
  Children:{toArray:flatten,map:(children,mapper) => children == null ? children : flatten(children).map(mapper)},
  cloneElement:(node,changes,...children) => Object.freeze({...node,
    props:Object.freeze({...node.props,...changes,...(children.length ? {children:children[0]} : {})})})
};
const element = (type,props={},...children) => Object.freeze({element:true,type,
  key:props.key ?? null,ref:props.ref ?? null,
  props:Object.freeze({...props,...(children.length ? {children:children.length === 1 ? children[0] : children} : {})})});
const nodes = node => React.isValidElement(node)
  ? [node,...flatten(node.props.children).flatMap(nodes)] : [];
const text = node => React.isValidElement(node) ? flatten(node.props.children).map(text).join('')
  : node == null ? '' : String(node);

const validate = () => [];
const submit = () => {};
const onChange = () => {};
const fields = Object.freeze([
  Object.freeze({key:'scenario_id',required:true,defaultValue:'Cenário atual'}),
  Object.freeze({key:'visual_style',required:true,defaultValue:'Esportivo leve'}),
  Object.freeze({key:'style_id',required:false,defaultValue:'3D'}),
  Object.freeze({key:'mascot_animal',required:true,onChange}),
  Object.freeze({key:'style_family',required:true,defaultValue:'Mascote'}),
  Object.freeze({key:'sample',required:false,defaultValue:'Modelo original'}),
  Object.freeze({key:'coupon_code',required:false})
]);
const draft = Object.freeze({values:Object.freeze({scenario_id:'Cenário atual',
  visual_style:'Esportivo leve',style_id:'3D',mascot_animal:'Lobo',sample:'Modelo original'})});
const controller = Object.freeze({fields,draft,validate,submit});
const visible = visibleFields(fields);
assert.deepEqual(Array.from(visible,field => field.key),['mascot_animal','style_family','sample','coupon_code']);
assert.notEqual(visible,fields);
for(const field of visible) assert.equal(field,fields.find(original => original.key === field.key));
assert.equal(controller.fields,fields);
assert.equal(controller.validate,validate);
assert.equal(controller.submit,submit);
assert.equal(controller.draft,draft);
assert.equal(draft.values.scenario_id,'Cenário atual');
assert.equal(draft.values.visual_style,'Esportivo leve');
assert.equal(fields[1].required,true);
assert.equal(fields[3].onChange,onChange);
console.log('PASS: visibleFields hides exact appearance keys and preserves original objects, defaults and controllers.');

const AccordionItem = function OriginalAccordionItem() {};
const InputComponent = function OriginalTextInput() {};
const ref = Object.freeze({current:null});
const original = element('section',{className:'lab-form',onClick:submit,ref},
  element(AccordionItem,{key:'scenario_id',value:'scenario_id',onValueChange:onChange},
    element('strong',{},'Qual cenário você prefere?')),
  element(AccordionItem,{key:'visual_style',value:'visual_style',onValueChange:onChange},
    element('strong',{},'Como você quer o visual da arte?')),
  element(AccordionItem,{key:'style_id',value:'style_id'},'Estilo interno'),
  element(AccordionItem,{key:'sample',value:'sample'},
    element('strong',{},'Amostra'),
    element('fieldset',{className:'lab-actions'},
      element('legend',{},'Estilo da arte'),element('input',{type:'radio',value:'Esportivo leve',checked:true,onChange})),
    element('button',{type:'button',onClick:submit},'Referência original')),
  element(AccordionItem,{key:'coupon_code',value:'coupon_code'},
    element('input',{value:'CUPOM',onChange})),
  element(AccordionItem,{key:'mascot_animal',value:'mascot_animal'},
    element(InputComponent,{key:'animal-input',value:'scenario_id',onChange}),
    element('input',{key:'other-answer',value:'visual_style',onChange})),
  element('button',{type:'button',onClick:submit},'Enviar pedido'));
const hidden = hideAppearance(React,original);
const remaining = nodes(hidden);
assert.equal(hidden.type,original.type);
assert.equal(hidden.ref,ref);
assert.equal(hidden.props.onClick,submit);
for(const key of ['scenario_id','visual_style','style_id']) {
  assert.equal(remaining.some(node => node.type === AccordionItem && node.props.value === key),false);
}
assert.equal(text(hidden).includes('Estilo da arte'),false);
assert.equal(text(hidden).includes('Referência original'),true);
assert.equal(remaining.find(node => node.type === AccordionItem && node.props.value === 'sample').props.value,'sample');
assert.equal(remaining.find(node => node.type === 'input' && node.props.value === 'CUPOM').props.onChange,onChange);
assert.equal(remaining.find(node => node.key === 'animal-input')?.props.onChange,onChange,
  'A non-appearance answer equal to scenario_id must not be hidden.');
assert.equal(remaining.find(node => node.key === 'other-answer')?.props.onChange,onChange,
  'A non-appearance answer equal to visual_style must not be hidden.');
assert.equal(remaining.find(node => node.type === 'button' && text(node) === 'Enviar pedido').props.onClick,submit);
assert.equal(original.props.children[0].props.value,'scenario_id');
assert.equal(nodes(original).some(node => node.type === 'legend' && text(node) === 'Estilo da arte'),true);
assert.equal(hideAppearance(React,null),null);
assert.equal(hideAppearance(React,'ordinary text'),'ordinary text');
console.log('PASS: fallback removes only appearance accordions and embedded style, leaving sample, answers, refs and callbacks intact.');

const legacy = fs.readFileSync(path.join(worktree,'app.html'),'utf8');
const appearanceCss = legacy.match(/\/\* Appearance controls stay in the original forms\/defaults, but are not offered to customers\. \*\/([\s\S]*?)<\/style>/)?.[1];
assert.ok(appearanceCss,'The final presentation-only CSS override must exist.');
assert.match(appearanceCss,/\[data-clean-field-card="scenario_id"\]/);
assert.match(appearanceCss,/\.fotoJogosScenarioField/);
assert.match(appearanceCss,/\.contratacaoStyleGrid/);
assert.match(appearanceCss,/display:none !important/);
for(const revealSelector of [
  'body.copaColombiaOrderMode.copaColombiaShowScenario [data-product-form="proximo_jogo"] [data-clean-field-card="scenario_id"]',
  'body.copaColombiaOrderMode.copaColombiaResultMode.copaColombiaShowScenario [data-product-form="resultado"] [data-clean-field-card="scenario_id"]'
]) assert.equal(appearanceCss.includes(revealSelector),true,
  'The final hidden rule must also override the more-specific legacy reveal selector.');
assert.match(legacy,/name="visual_style" value="3d" checked/);
assert.match(legacy,/name="contratacao_style_mode" value="catalog" data-contratacao-style data-sample-id="contratacao_modelo_01_v1" checked/);
assert.match(legacy,/function getProductVisualStyle\(form\)/);
assert.match(legacy,/data-contratacao-player-photo/);
console.log('PASS: legacy appearance is hidden with CSS; checked defaults, player uploads and original readers still exist.');
