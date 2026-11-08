import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fundedRestartHorizon, type RestartState } from './funded-restart.js';
import { expectedFutureWins } from './horizon.js';
import { AdvancedBot, ADV_DEFAULTS, type AdvView } from './advanced.js';
import { FastEval, WordEngine } from './engine.js';

const recent = [10,19,10,15,30,10,10,11,10,14,13,22,10,9,11,16];
const state: RestartState = { balance:47, score:84, rackSize:0, bagLeft:18, bagStart:68,
  seatCount:6, wordPending:false, restartAcquisitionPrices:recent };

test('real45248 empty rack/cash47 has no extra funded headroom: current plus3 futures cost44', () => {
  const baseline=expectedFutureWins(18,6,6,true);
  assert.equal(baseline,3);
  assert.equal(fundedRestartHorizon(baseline,state),3);
});
test('cash66 funds current plus5 future acquisitions at observed median11', () => {
  assert.equal(fundedRestartHorizon(3,{...state,balance:66}),5);
  assert.equal(fundedRestartHorizon(3,{...state,balance:65}),4);
});
test('more expensive observed market reduces additional capacity', () => {
  assert.equal(fundedRestartHorizon(3,{...state,balance:66,restartAcquisitionPrices:Array(16).fill(20)}),3);
});
test('requires an authoritative post-word state, small rack and observed costs', () => {
  for (const change of [{score:0},{wordPending:true},{wordPending:undefined},{rackSize:3},
    {restartAcquisitionPrices:undefined},{restartAcquisitionPrices:Array(7).fill(11)}])
    assert.equal(fundedRestartHorizon(3,{...state,balance:100,...change}),3);
});
test('never changes other seat counts, early policy or final-tile handling', () => {
  for (const change of [{seatCount:2},{seatCount:5},{seatCount:7},{bagLeft:30}, {bagLeft:0},{bagLeft:1},{bagLeft:2}])
    assert.equal(fundedRestartHorizon(3,{...state,balance:100,...change}),3);
});
test('invalid state or free/nonfinite prices cannot authorize more draws', () => {
  for (const change of [{balance:NaN},{bagLeft:Infinity},{rackSize:-1},{rackSize:.5},
    {restartAcquisitionPrices:[...recent,0]},{restartAcquisitionPrices:[...recent,NaN]}])
    assert.equal(fundedRestartHorizon(3,{...state,balance:100,...change}),3);
});
test('only last16 observed prices influence capacity; no future prices supplied', () => {
  assert.equal(fundedRestartHorizon(3,{...state,balance:66,restartAcquisitionPrices:[1000,...recent]}),5);
});
test('capacity never assumes income, exceeds a third of usable auctions, or lowers baseline', () => {
  for(let bag=3;bag<=20;bag++)for(let balance=1;balance<=100;balance++) {
    const baseline=expectedFutureWins(bag,6,6,true);
    const result=fundedRestartHorizon(baseline,{...state,bagLeft:bag,balance});
    assert.ok(result>=baseline);
    if(result>baseline) {
      assert.ok((result+1)*11<=balance);
      assert.ok(result<=Math.floor((bag-1)/3));
      assert.ok(result<=6);
    }
  }
});
test('AdvancedBot defaults preserve MC horizon; opt-in passes bounded funded horizon', () => {
  const view: AdvView={rack:new Map(),balance:66,score:84,bagLeft:18,bagStart:68,
    seatCount:6,wordPending:false,restartAcquisitionPrices:recent,
    unseen:{counts:{A:9,T:6},total:15}};
  const captures:number[]=[];
  for(const enabled of [undefined,false,true]) {
    const bot=new AdvancedBot(new FastEval(['AT']),new WordEngine(['AT']),
      {...ADV_DEFAULTS,neutralSixHorizon:true,fundedRestart:enabled});
    (bot as unknown as {mc:{value:(...args:unknown[])=>number}}).mc.value=(...args)=>{
      captures.push(args[3] as number); return 2;
    };
    bot.decideBid(view,'A');
  }
  assert.deepEqual(captures,[3,3,5]);
});
