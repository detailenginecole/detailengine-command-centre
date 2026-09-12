import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";
const source=await readFile(new URL("../app/lib/client-identity.ts",import.meta.url),"utf8");
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {selectClient}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const a={id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",slug:"shop-a",display_name:"Same business name"};
const b={id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",slug:"shop-b",display_name:"Same business name"};
test("UUID identifies the same client despite renames and repeated business names",()=>{
 assert.equal(selectClient([a,b],{id:b.id}),b);
 const renamed={...b,slug:"new-slug",display_name:"Renamed shop"};
 assert.equal(selectClient([a,renamed],{id:b.id.toUpperCase()}),renamed);
});
test("unknown, malformed and empty client IDs never fall back to another account",()=>{
 for(const id of ["cccccccc-cccc-4ccc-8ccc-cccccccccccc","shop-a","","not-a-uuid"]){
  assert.equal(selectClient([a,b],{id}),null);
  assert.equal(selectClient([a,b],{id,slug:a.slug}),null);
 }
 assert.equal(selectClient([a],{id:b.id}),null);
});
test("legacy slugs resolve only when unique and cannot override a conflicting UUID",()=>{
 assert.equal(selectClient([a,b],{slug:b.slug}),b);
 assert.equal(selectClient([a,{...b,slug:a.slug}],{slug:a.slug}),null);
 assert.equal(selectClient([a,b],{id:a.id,slug:b.slug}),null);
 assert.equal(selectClient([a,b],{slug:""}),null);
});
test("only an omitted selection may use the first accessible account",()=>{
 assert.equal(selectClient([a,b]),a);
 assert.equal(selectClient([]),null);
});
