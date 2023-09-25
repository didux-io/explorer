'use strict';

const etherUnits = require(`${__lib}etherUnits.js`);
const BigNumber = require('bignumber.js');
const RLP = require('rlp');

/*
  Filter an array of TX
*/
function filterTX(txs, value) {
  return txs.map(tx => [tx.hash, tx.blockNumber, tx.from, tx.to, etherUnits.toEther(new BigNumber(tx.value), 'ether'), tx.gas, tx.timestamp, tx.creates]);
}

function filterMinedBlock(mbs, value) {
  return mbs.map(mb => [mb.number, getBlockReward(mb.number), mb.gasUsed, mb.gasLimit, mb.timestamp]);
}

let getBlockReward = function (b) {
  if (b >= 0 && b < 20000001) {
      return 4;
  }
  if (b > 20000000 && b < 40000001) {
      return 2;
  }
  if (b > 40000000 && b < 60000001) {
      return 1.75;
  }
  if (b > 60000000 && b < 80000001) {
      return 1.5;
  }
  if (b > 80000000 && b < 100000001) {
      return 1.25;
  }
  if (b > 100000000 && b < 120000001) {
      return 1.0;
  }
  if (b > 120000000 && b < 140000001) {
      return 0.8;
  }
  if (b > 140000000 && b < 160000001) {
      return 0.6;
  }
  if (b > 160000000 && b < 180000001) {
      return 0.4;
  }
  if (b > 180000000 && b < 200000001) {
      return 0.2;
  }
  if (b > 200000000 && b < 400000001) {
      return 0.1;
  }
  if (b > 400000000 && b < 800000001) {
      return 0.05;
  }
  if (b > 800000000 && b < 1600000001) {
      return 0.025;
  }
  if (b > 1600000000 && b < 3200000001) {
      return 0.0125;
  }
};

function filterTrace(txs, value) {
  return txs.map((tx) => {
    const t = tx;
    if (t.type == 'suicide') {
      if (t.action.address) t.from = t.action.address;
      if (t.action.balance) t.value = etherUnits.toEther(new BigNumber(t.action.balance), 'wei');
      if (t.action.refundAddress) t.to = t.action.refundAddress;
    } else {
      if (t.action.to) t.to = t.action.to;
      t.from = t.action.from;
      if (t.action.gas) t.gas = new BigNumber(t.action.gas).toNumber();
      if ((t.result) && (t.result.gasUsed)) t.gasUsed = new BigNumber(t.result.gasUsed).toNumber();
      if ((t.result) && (t.result.address)) t.to = t.result.address;
      t.value = etherUnits.toEther(new BigNumber(t.action.value), 'wei');
    }
    return t;
  });
}

function filterBlock(block, field, value) {
  let tx = block.transactions.filter(obj => obj[field] == value);
  tx = tx[0];
  if (typeof tx !== 'undefined') tx.timestamp = block.timestamp;
  return tx;
}

/* make blocks human readable */
function filterBlocks(blocks) {
  if (blocks.constructor !== Array) {
    const b = blocks;
    const ascii = hex2ascii(blocks.extraData);
    b.extraDataHex = blocks.extraData;
    b.extraData = ascii;
    return b;
  }
  return blocks.map((block) => {
    const b = block;
    const ascii = hex2ascii(block.extraData);
    b.extraDataHex = block.extraData;
    b.extraData = ascii;

    return b;
  });
}

/* stupid datatable format */
function datatableTX(txs) {
  return txs.map(tx => [tx.hash, tx.blockNumber, tx.from, tx.to,
    etherUnits.toEther(new BigNumber(tx.value), 'wei'), tx.gas, tx.timestamp]);
}

function internalTX(txs) {
  return txs.map(tx => [tx.transactionHash, tx.blockNumber, tx.action.from, tx.action.to,
    etherUnits.toEther(new BigNumber(tx.action.value), 'wei'), tx.action.gas, tx.timestamp]);
}

/* modified baToJSON() routine from rlp */
function baToString(ba) {
  if (Buffer.isBuffer(ba)) {
    return ba.toString('ascii');
  } if (ba instanceof Array) {
    const array = [];
    for (let i = 0; i < ba.length; i++) {
      array.push(baToString(ba[i]));
    }
    return array.join('/');
  }
  return ba;

}

var hex2ascii = function (hexIn) {
  const hex = hexIn.toString();
  let str = '';

  try {
    const ba = RLP.decode(hex);
    const test = ba[1].toString('ascii');

    if (test == 'geth' || test == 'Parity') {
      // FIXME
      ba[0] = ba[0].toString('hex');
    }
    str = baToString(ba);
  } catch (e) {
    for (let i = 0; i < hex.length; i += 2) str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  }
  return str;
};

module.exports = {
  filterBlock,
  filterBlocks,
  filterTX,
  filterMinedBlock,
  filterTrace,
  datatableTX,
  internalTX,
};
