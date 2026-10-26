import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the real theme compiler against browser CSSOM serialization. The
// previous string-only checks missed rgb()/hex normalization and stale inline
// overrides after a native canvas stylesheet edit.
const moduleCode=ts.transpileModule(readFileSync('lib/canvas-v2/artifact-theme.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function setup(page:Page,colour:string){
  await page.setContent(`<style id="authored">.accent{border:13px solid ${colour} !important;width:174px;height:538px;transform:rotate(8deg)}</style><div id="scene" style="background:#0d0e11"><div id="accent" class="accent" data-canvas-v2-theme-preserve="false"></div><p id="label" style="color:#f0ecdf">NIGHT STUDIO</p></div>`);
  await page.addScriptTag({content:`(()=>{const exports={};${moduleCode};window.themeCheck={...exports,state:exports.createCanvasV2ArtifactThemeState()};})();`});
}
async function apply(page:Page){
  await page.evaluate(()=>{
    const api=(window as typeof window&{themeCheck:{state:unknown;applyCanvasV2ArtifactThemeToElement:(root:Element,theme:string,state:unknown)=>void}}).themeCheck;
    api.applyCanvasV2ArtifactThemeToElement(document.getElementById('scene')!,'dark',api.state);
  });
}

test('a requested cyan border stays cyan through repeated native canvas theme passes',async({page})=>{
  await setup(page,'#68CFE5');
  for(let pass=0;pass<3;pass++){
    await apply(page);
    await expect(page.locator('#accent')).toHaveCSS('border-top-color','rgb(104, 207, 229)');
    await expect(page.locator('#accent')).toHaveCSS('border-top-width','13px');
    await expect(page.locator('#label')).toHaveText('NIGHT STUDIO');
  }
});

test('a saved stylesheet colour edit removes only the preceding theme override',async({page})=>{
  await setup(page,'#CCCCCC');await apply(page);
  const before=await page.locator('#accent').getAttribute('style');expect(before).toContain('important');
  await page.locator('#authored').evaluate(element=>{element.textContent='.accent{border:13px solid #68CFE5 !important;width:174px;height:538px;transform:rotate(8deg)}';});
  await apply(page);
  await expect(page.locator('#accent')).toHaveCSS('border-top-color','rgb(104, 207, 229)');
  await expect(page.locator('#accent')).toHaveCSS('width','174px');
  await expect(page.locator('#accent')).toHaveCSS('height','538px');
  await expect(page.locator('#label')).toHaveCSS('color','rgb(240, 236, 223)');
});
