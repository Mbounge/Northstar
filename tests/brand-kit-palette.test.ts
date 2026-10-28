import assert from "node:assert/strict";
import test from "node:test";
import { selectBrandPalette, type PaletteColor } from "../lib/brand-kit/palette";
test("Flutter library XML colors do not replace the observed UI or exact icon color", () => {
  const result = selectBrandPalette<PaletteColor>({framework:"flutter",extracted:[{hex:"#6750A4",label:"Material primary",source:"colors_xml"}],observed:[{hex:"#000000",label:"Background"},{hex:"#917AEC",label:"Inferred brand",semantic_role:"brand"}],icon:[{hex:"#917DF0",label:"Icon",confidence:"exact"}],fallback:[]});
  assert.deepEqual(result.map(color=>color.hex),["#000000","#917DF0"]);
});
test("Native app XML tokens remain primary and Flutter still exposes its icon without AI", () => {
 const extracted=[{hex:"#102030",label:"Primary",source:"colors_xml"}];
 assert.deepEqual(selectBrandPalette<PaletteColor>({framework:"native_android",extracted,observed:[],icon:[],fallback:[]}),extracted);
 assert.equal(selectBrandPalette<PaletteColor>({framework:"flutter",extracted,observed:[],icon:[{hex:"#917DF0",label:"Icon",confidence:"exact"}],fallback:[]})[0].hex,"#917DF0");
});
