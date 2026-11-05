const assert = require('node:assert/strict');
const {parse} = require('../pump-signal.js');
const fixtures = [
  ['ON',true],['OFF',false],['1',true],['0',false],['true',true],['false',false],
  ['"ON"',true],['"OFF"',false],[{state:true},true],[{status_pump:0},false],
  ['{"pump":"on"}',true],['{"action":"off"}',false],[{temperature:29},null],
  ['unknown',null],[null,null],[[],null]
];
for(const [raw,expected] of fixtures) assert.equal(parse(raw),expected,JSON.stringify(raw));
console.log(`${fixtures.length} pengujian sinyal pompa lulus.`);
