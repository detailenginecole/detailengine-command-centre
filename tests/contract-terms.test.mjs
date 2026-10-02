
import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {readFile} from "node:fs/promises";
const source=await readFile(new URL("../app/lib/contract-terms.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {parseContractTerms,sameContractTerms}=await import("data:text/javascript;base64,"+Buffer.from(compiled).toString("base64"));
const terms={version:1,currency:"USD",legal_name:"Example LLC",entity_type:"LLC",jurisdiction:"Florida",business_address:"123 Example Road, Tampa, FL",signer_name:"Test Signer",signer_title:"Owner",signer_email:" TEST@example.com ",phone:"+1 555 555 0100",setup_amount_minor:100000,retainer_amount_minor:250000,opportunity_goal:20,daily_budget_minor:10000};
test("normalizes the complete purchase snapshot and fixes contractual constants",()=>{
 const parsed=parseContractTerms({...terms,minimum_cycle_days:1,ad_spend_fee_percent:99},100000);
 assert.equal(parsed.signer_email,"test@example.com");
 assert.equal(parsed.retainer_amount_minor,250000);assert.equal(parsed.minimum_cycle_days,28);assert.equal(parsed.ad_spend_fee_percent,10);
});
for(const key of ["retainer_amount_minor","opportunity_goal","daily_budget_minor"]){
 for(const value of [0,-1,1.1,NaN,Infinity,"20",null,true]){
  test("rejects invalid "+key+" "+String(value),()=>assert.throws(()=>parseContractTerms({...terms,[key]:value},100000)));
 }
}
test("rejects absent legal details, signer details, wrong currency and mismatched setup amount",()=>{
 for(const key of ["legal_name","entity_type","jurisdiction","business_address","signer_name","signer_title","signer_email","phone"])
  assert.throws(()=>parseContractTerms({...terms,[key]:""},100000));
 assert.throws(()=>parseContractTerms({...terms,currency:"CAD"},100000));
 assert.throws(()=>parseContractTerms(terms,200000));
});
test("terms comparisons detect changed goals, retainer and signer but ignore JSON key order",()=>{
 const parsed=parseContractTerms(terms,100000);
 assert.equal(sameContractTerms({...parsed},parsed),true);
 assert.equal(sameContractTerms({...parsed,opportunity_goal:21},parsed),false);
 assert.equal(sameContractTerms({...parsed,retainer_amount_minor:1},parsed),false);
 assert.equal(sameContractTerms({...parsed,signer_email:"other@example.com"},parsed),false);
 assert.equal(sameContractTerms(null,parsed),false);
});

