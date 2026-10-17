import test from 'node:test';
import assert from 'node:assert/strict';
import { screenMockDataEqual } from '../lib/canvas-v2/screen-mock-state';
test('reordered seed keys preserve live state; a different dataset or array order resets it',()=>{
 assert.equal(screenMockDataEqual({goal:'x',nested:{a:1,b:2},rows:['a','b']},{rows:['a','b'],nested:{b:2,a:1},goal:'x'}),true);
 assert.equal(screenMockDataEqual(undefined,{}),true);
 assert.equal(screenMockDataEqual({rows:['a','b']},{rows:['b','a']}),false);
 assert.equal(screenMockDataEqual({goal:'x'},{goal:'new seed'}),false);
});
