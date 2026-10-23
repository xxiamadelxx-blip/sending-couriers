import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, normalizeState, updateSettings, mergeImport, upsertEntry, calculate, calculateScenario } from '../web/core.mjs';
test('preferences round-trip without changing records, closure or period math',()=>{
 let state=upsertEntry(emptyState(),{date:'2026-10-02',dailyHours:10,dailyOrders:28,reward:1200});
 const entries=state.entries, closures=state.closures;
 state=updateSettings(state,{premiumCycleStart:'2026-10-02',soundEnabled:false,hapticsEnabled:false});
 assert.equal(state.entries,entries);assert.equal(state.closures,closures);
 assert.equal(calculate(state,'2026-10-02').paidReward,1200);
 assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(state))),state);
 assert.deepEqual(normalizeState({schemaVersion:4,entries:[],closures:{},settings:{premiumCycleStart:'2026-10-02'}}).settings,{premiumCycleStart:'2026-10-02',soundEnabled:true,hapticsEnabled:true,theme:'dark',paymentRules:[]});
});
test('old backups preserve preferences; new backups restore explicit preferences',()=>{
 const state=updateSettings(emptyState(),{soundEnabled:false,hapticsEnabled:false});
 assert.deepEqual(mergeImport(state,{schemaVersion:2,entries:[],closures:{}}).settings,state.settings);
 assert.deepEqual(mergeImport(emptyState(),state).settings,state.settings);
});
test('invalid preferences are rejected',()=>{
 for(const input of [{soundEnabled:'false'},{hapticsEnabled:0}])assert.throws(()=>updateSettings(emptyState(),input));
 assert.equal('topInsetExtraDp' in normalizeState({...emptyState(),settings:{topInsetExtraDp:97}}).settings,false);
});
test('calculator uses exact thresholds, handles blanks, and never saves entries',()=>{
 const x=calculateScenario({hours:10,orders:28});
 assert.equal(x.pace,2.8);assert.equal(x.hourlyBase,3600);assert.equal(x.pacePremium,180);
 assert.equal(x.normOrders,18);assert.equal(x.premiumOrders,28);assert.equal(x.missingNorm,0);assert.equal(x.reserve,333);
 assert.equal(calculateScenario({hours:10,orders:17}).missingNorm,1);
 assert.equal(calculateScenario({hours:10.01,orders:28}).pacePremium,0);
 assert.equal(calculateScenario({hours:'',orders:''}).pace,null);
 assert.equal(calculateScenario({hours:0,orders:4}).pace,null);
 assert.throws(()=>calculateScenario({hours:'bad',orders:4}));
});
