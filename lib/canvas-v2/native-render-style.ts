import { MEDIA_ATTRIBUTE } from './canvas-media';
import { SCREEN_ATTRIBUTE } from './interactive-screen';
import { MODEL_ATTRIBUTE } from './model-object';
import { normalizeCanvasV2ReactInlineStyle, type CanvasV2NativeSceneNode } from './native-scene';

// Native source styles are immutable. Geometry-only edits and warm returns can
// reuse their normalized React properties; source/style replacements get a new
// key. Weak keys release this work with the source rather than retaining boards.
const styles=new WeakMap<CanvasV2NativeSceneNode['inlineStyle'],{plain?:Record<string,string>;live?:Record<string,string>}>();
export function canvasV2NativeRenderStyle(node:CanvasV2NativeSceneNode):Record<string,string> {
 const live=Boolean(node.attributes[MEDIA_ATTRIBUTE]||node.attributes[SCREEN_ATTRIBUTE]||node.attributes[MODEL_ATTRIBUTE]);
 let entry=styles.get(node.inlineStyle);
 if(!entry){entry={};styles.set(node.inlineStyle,entry);}
 const key=live?'live':'plain';
 if(entry[key])return entry[key];
 const style:Record<string,string>={};
 for(const [property,value] of Object.entries(normalizeCanvasV2ReactInlineStyle(node.inlineStyle))){
  if(live&&/^(?:background|border|padding)(?:-|$)|^box-shadow$/.test(property))continue;
  const name=property.startsWith('--')?property:property.replace(/-([a-z])/g,(_match,letter:string)=>letter.toUpperCase());
  style[name]=value;
 }
 entry[key]=style;
 return style;
}
