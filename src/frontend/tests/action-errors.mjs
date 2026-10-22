import assert from 'node:assert/strict';
import {safeActionError} from '../src/actionErrors.ts';
assert.equal(safeActionError(new Error('Unknown chat command. Use /usage.')),'Unknown chat command. Use /usage.');
assert.equal(safeActionError(new TypeError('Failed to fetch'),'Acceptance is uncertain.'),'Acceptance is uncertain.');
for(const text of ['Authorization: Bearer example-not-a-real-token','password=synthetic-test-value','-----BEGIN PRIVATE KEY-----','bad\u0000message','x'.repeat(501)]){
 assert.equal(safeActionError(new Error(text),'Safe fallback'),'Safe fallback');
}
assert.equal(safeActionError({message:'untrusted shape'},'Safe fallback'),'Safe fallback');
assert.equal(safeActionError(new Error('  Runtime is offline.  ')),'Runtime is offline.');
console.log('PASS 9 safe action error cases (safe detail, uncertainty, credential/control/size rejection)');
