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
const {createVisualPulse} = require('../pump-signal.js');
function fixture() {
  let now=0, task=null;
  const states=[];
  const timers={setTimeout(fn,delay){task={fn,due:now+delay};return 1;},clearTimeout(){task=null;}};
  const pulse=createVisualPulse(active=>states.push(active),timers);
  return {pulse,states,tick(ms){now+=ms;if(task && now>=task.due){const fn=task.fn;task=null;fn();}}};
}
{
  const f=fixture();f.pulse.receive(true);f.tick(1000);f.pulse.receive(false);f.tick(3999);
  assert.deepEqual(f.states,[true],'OFF awal tidak boleh memotong visual');
  f.tick(1);assert.deepEqual(f.states,[true,false]);
}
{
  const f=fixture();f.pulse.receive(true);f.tick(1000);f.pulse.receive(false);f.tick(1000);f.pulse.receive(true);f.tick(3000);
  assert.deepEqual(f.states,[true,false],'ON berulang tidak memperpanjang lima detik');
  f.tick(1000);f.pulse.receive(true);assert.deepEqual(f.states,[true,false],'Status ON tetap bukan event baru');
}
{
  const f=fixture();f.pulse.receive(true);f.tick(5000);f.pulse.receive(false);f.pulse.receive(true);
  assert.deepEqual(f.states,[true,false,true],'Siklus berikutnya dapat memulai animasi lagi');
}
{
  const f=fixture();f.pulse.receive(true);f.pulse.reset();f.tick(5000);
  assert.deepEqual(f.states,[true,false],'Pindah profil membersihkan timer visual');
}
console.log('4 pengujian durasi visual lulus.');
