import {createServer} from 'node:http';
import {runAccessibilityNative} from './accessibility-native.server';
if(process.env.NODE_ENV==='production'||process.env.NORTHSTAR_E2E!=='1')throw Error('Local native verification requires explicit E2E mode.');
createServer(async(request,response)=>{
 response.setHeader('Cache-Control','no-store');response.setHeader('Content-Type','application/json');
 if(request.method!=='POST'||request.url!=='/accessibility'||request.headers['x-northstar-local-evaluation']!=='1'){response.writeHead(403);response.end('{}');return;}
 const signal=new AbortController();response.on('close',()=>signal.abort());let size=0;const chunks:Buffer[]=[];
 try{for await(const chunk of request){size+=chunk.length;if(size>9_000_000)throw Error('Native request is too large.');chunks.push(chunk);}const result=await runAccessibilityNative(JSON.parse(Buffer.concat(chunks).toString()),signal.signal);response.end(JSON.stringify(result));}
 catch(error){response.writeHead(400);response.end(JSON.stringify({error:error instanceof Error?error.message:'Native review failed.'}));}
}).listen(3150,'127.0.0.1',()=>process.stdout.write('Local native verification ready on loopback 3150\n'));
