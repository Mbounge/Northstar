import assert from "node:assert/strict";
import test from "node:test";
import { initialMeditoSimulation, meditoSimulationReducer as reduce, meditoSimulationSections } from "../lib/preview/medito-simulation";
test("recorded signup journey uses actual form state and preserves it on Back", () => {
  let state=reduce(initialMeditoSimulation(),{type:"navigate",screen:"email"});
  state=reduce(state,{type:"email",value:"invalid"}); assert.equal(reduce(state,{type:"submitEmail"}).screen,"email");
  state=reduce(state,{type:"email",value:"demo@example.com"});state=reduce(state,{type:"submitEmail"});assert.equal(state.screen,"verify");
  state=reduce(state,{type:"code",value:"x12-345678"});assert.equal(state.code,"123456");
  assert.equal(reduce(state,{type:"submitCode",expected:"654321"}).screen,"verify");
  const back=reduce(state,{type:"back"});assert.equal(back.email,"demo@example.com");assert.equal(back.screen,"email");
  state=reduce(state,{type:"submitCode",expected:"123456"});assert.equal(state.screen,"experience");
  state=reduce(state,{type:"experience",value:"Never tried it"});assert.equal(state.screen,"reminders");
  state=reduce(state,{type:"skipReminder"});assert.equal(state.reminder,null);
  state=reduce(state,{type:"deferMeditation"});state=reduce(state,{type:"openSupport"});assert.equal(state.screen,"loading");
  state=reduce(state,{type:"loaded"});assert.equal(reduce(state,{type:"back"}).screen,"support");state=reduce(state,{type:"donationAmount",value:"5"});assert.equal(state.donationAmount,"5");
  state=reduce(state,{type:"closeDonation"});assert.equal(state.screen,"home");assert.equal(state.welcomeVisible,true);
  state=reduce(state,{type:"dismissWelcome"});assert.equal(state.welcomeVisible,false);
  assert.deepEqual(reduce(state,{type:"reset"}),initialMeditoSimulation());
});
test("onboarding choices persist across navigation and stale completion events do not move another screen", () => {
  let state=reduce(initialMeditoSimulation(),{type:"navigate",screen:"experience"});
  state=reduce(state,{type:"experience",value:"A little, here and there"});state=reduce(state,{type:"reminder",value:"7:00 AM"});
  state=reduce(state,{type:"back"});assert.equal(state.experience,"A little, here and there");assert.equal(state.reminder,"7:00 AM");
  assert.equal(reduce(state,{type:"loaded"}),state);
  assert.equal(meditoSimulationSections.some(item=>String(item.screen).includes("gmail")),false);
});
